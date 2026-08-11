import { filterInterstitialAdsFromM3U8 } from './m3u8-ad-filter';
import { isSafeMediaUrl, MAX_MANIFEST_BYTES } from './media-relay';
import { SourceAuditStatus } from './source-audit';
import {
  fetchSafeUpstream,
  isSafeUpstreamUrl,
  readJsonResponseLimited,
} from './upstream-security';

interface SourceApiItem {
  vod_play_url?: string;
}

interface SourceApiResponse {
  list?: SourceApiItem[];
}

export interface SourceAuditResult {
  status: SourceAuditStatus;
  note: string;
  auditDate: string;
  samples: number;
}

const AD_MARKERS = /#EXT-X-(CUE-OUT|CUE-IN)|SCTE35|CLASS="?ad/i;
const AUDIT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
  Accept: 'application/json, application/vnd.apple.mpegurl;q=0.9, */*;q=0.8',
};

async function fetchManifest(url: string): Promise<string> {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: AUDIT_HEADERS,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('无效跳转');
        const next = new URL(location, current).toString();
        if (!isSafeMediaUrl(next)) throw new Error('不安全跳转');
        current = next;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const size = Number(response.headers.get('content-length'));
      if (Number.isFinite(size) && size > MAX_MANIFEST_BYTES) {
        throw new Error('播放清单过大');
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) {
        throw new Error('播放清单过大');
      }
      if (!text.includes('#EXTM3U')) throw new Error('不是有效播放清单');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('跳转次数过多');
}

export async function auditVideoSource(
  api: string
): Promise<SourceAuditResult> {
  const auditDate = new Date().toISOString().slice(0, 10);
  if (!isSafeUpstreamUrl(api)) {
    return {
      status: 'blocked',
      note: '视频源地址不安全',
      auditDate,
      samples: 0,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetchSafeUpstream(`${api}?ac=videolist&pg=1`, {
        signal: controller.signal,
        headers: AUDIT_HEADERS,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`目录接口 HTTP ${response.status}`);
    const data = await readJsonResponseLimited<SourceApiResponse>(response);
    const mediaUrls = Array.from(
      new Set(
        (data.list || []).flatMap((item) =>
          Array.from(
            (item.vod_play_url || '').matchAll(
              /https:\/\/[^"'\s#$]+\.m3u8(?:\?[^"'\s#$]*)?/g
            ),
            (match) => match[0]
          )
        )
      )
    )
      .filter(isSafeMediaUrl)
      .slice(0, 6);
    if (mediaUrls.length === 0) {
      throw new Error('没有抽取到安全的 HTTPS 播放清单');
    }

    const manifests = await Promise.all(
      mediaUrls.map(async (mediaUrl) => {
        try {
          return await fetchManifest(mediaUrl);
        } catch {
          return null;
        }
      })
    );

    let filterable = false;
    let samples = 0;
    for (const manifest of manifests) {
      if (!manifest) continue;
      samples += 1;
      if (AD_MARKERS.test(manifest)) {
        return {
          status: 'blocked',
          note: '安全建议：抽样播放清单包含不可安全移除的广告标记，建议保持禁用',
          auditDate,
          samples,
        };
      }
      if (filterInterstitialAdsFromM3U8(manifest) !== manifest) {
        filterable = true;
      }
      if (samples >= 3) break;
    }
    if (samples === 0) {
      throw new Error('抽样播放地址均不可用');
    }

    return {
      status: filterable ? 'filterable' : 'clean',
      note: filterable
        ? `安全建议：已抽检 ${samples} 个可用播放清单，发现可识别短插播，可在过滤后使用`
        : `安全建议：已抽检 ${samples} 个可用播放清单，未发现独立插播广告段`,
      auditDate,
      samples,
    };
  } catch (error) {
    return {
      status: 'pending',
      note: `安全建议：本次无法完成抽检（${
        error instanceof Error ? error.message : '未知错误'
      }），请结合连通性实测后由站长决定`,
      auditDate,
      samples: 0,
    };
  }
}
