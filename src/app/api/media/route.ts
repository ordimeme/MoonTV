import { filterInterstitialAdsFromM3U8 } from '@/lib/m3u8-ad-filter';
import {
  isSafeMediaUrl,
  limitResponseStream,
  MAX_MANIFEST_BYTES,
  MAX_MEDIA_BYTES,
  rewriteHlsManifest,
  verifyMediaUrlSignature,
} from '@/lib/media-relay';
import { getSessionSecret } from '@/lib/session';

export const dynamic = 'force-dynamic';

const MAX_REDIRECTS = 3;

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

async function fetchMedia(
  url: string,
  range: string | null
): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*',
        ...(range ? { Range: range } : {}),
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('视频源返回了无效跳转');
    const next = new URL(location, current).toString();
    if (!isSafeMediaUrl(next)) throw new Error('视频源跳转到不安全地址');
    current = next;
  }
  throw new Error('视频源跳转次数过多');
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const url = requestUrl.searchParams.get('url') || '';
  const signature = requestUrl.searchParams.get('sig') || '';
  const secret = getSessionSecret();
  if (!secret || !(await verifyMediaUrlSignature(url, signature, secret))) {
    return jsonError('无效的视频访问凭证', 403);
  }

  try {
    const upstream = await fetchMedia(url, request.headers.get('range'));
    if (!upstream.ok && upstream.status !== 206) {
      return jsonError('视频源请求失败', 502);
    }
    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = Number(upstream.headers.get('content-length'));
    const isManifest =
      /mpegurl/i.test(contentType) || new URL(url).pathname.endsWith('.m3u8');

    if (isManifest) {
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_MANIFEST_BYTES
      ) {
        return jsonError('播放清单过大', 413);
      }
      const manifest = await upstream.text();
      if (new TextEncoder().encode(manifest).byteLength > MAX_MANIFEST_BYTES) {
        return jsonError('播放清单过大', 413);
      }
      const filteredManifest = filterInterstitialAdsFromM3U8(manifest);
      return new Response(
        await rewriteHlsManifest(filteredManifest, url, secret),
        {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }

    if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) {
      return jsonError('视频分片过大', 413);
    }
    if (!upstream.body) {
      return jsonError('视频源响应为空', 502);
    }
    const headers = new Headers({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of [
      'accept-ranges',
      'content-range',
      'etag',
      'last-modified',
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (Number.isFinite(contentLength)) {
      headers.set('Content-Length', String(contentLength));
    }
    return new Response(limitResponseStream(upstream.body), {
      status: upstream.status,
      headers,
    });
  } catch {
    return jsonError('视频代理请求失败', 502);
  }
}
