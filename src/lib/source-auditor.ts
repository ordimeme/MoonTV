import { filterInterstitialAdsFromM3U8 } from './m3u8-ad-filter';
import { isSafeMediaUrl, MAX_MANIFEST_BYTES } from './media-relay';
import { SourceAuditStatus } from './source-audit';
import {
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

async function fetchManifest(url: string): Promise<string> {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/vnd.apple.mpegurl' },
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
      response = await fetch(`${api}?ac=videolist&pg=1`, {
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
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
      .slice(0, 3);
    if (mediaUrls.length === 0) {
      throw new Error('没有抽取到安全的 HTTPS 播放清单');
    }

    let filterable = false;
    for (const mediaUrl of mediaUrls) {
      const manifest = await fetchManifest(mediaUrl);
      if (AD_MARKERS.test(manifest)) {
        return {
          status: 'blocked',
          note: '安全建议：抽样播放清单包含不可安全移除的广告标记，建议保持禁用',
          auditDate,
          samples: mediaUrls.length,
        };
      }
      if (filterInterstitialAdsFromM3U8(manifest) !== manifest) {
        filterable = true;
      }
    }

    return {
      status: filterable ? 'filterable' : 'clean',
      note: filterable
        ? `安全建议：已抽检 ${mediaUrls.length} 个播放清单，发现可识别短插播，可在过滤后使用`
        : `安全建议：已抽检 ${mediaUrls.length} 个播放清单，未发现独立插播广告段`,
      auditDate,
      samples: mediaUrls.length,
    };
  } catch (error) {
    return {
      status: 'blocked',
      note: `安全建议：抽检失败（${
        error instanceof Error ? error.message : '未知错误'
      }），建议保持禁用`,
      auditDate,
      samples: 0,
    };
  }
}
