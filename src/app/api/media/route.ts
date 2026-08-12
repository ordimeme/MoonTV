import { filterInterstitialAdsFromM3U8 } from '@/lib/m3u8-ad-filter';
import { fetchMedia } from '@/lib/media-fetch';
import {
  limitResponseStream,
  MAX_MANIFEST_BYTES,
  MAX_MEDIA_BYTES,
  resolveScopedMediaUrl,
  rewriteHlsManifest,
  verifyMediaUrlSignature,
} from '@/lib/media-relay';
import { getSessionSecret } from '@/lib/session';

export const dynamic = 'force-dynamic';

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const legacyUrl = requestUrl.searchParams.get('url') || '';
  const scope = requestUrl.searchParams.get('scope') || '';
  const relativePath = requestUrl.searchParams.get('path') || '';
  const signature = requestUrl.searchParams.get('sig') || '';
  const secret = getSessionSecret();
  const signedValue = scope || legacyUrl;
  if (
    !secret ||
    !(await verifyMediaUrlSignature(signedValue, signature, secret))
  ) {
    return jsonError('无效的视频访问凭证', 403);
  }
  const url = scope ? resolveScopedMediaUrl(scope, relativePath) : legacyUrl;
  if (!url) return jsonError('无效的视频访问地址', 403);

  try {
    const { response: upstream, finalUrl } = await fetchMedia(
      url,
      request.headers.get('range')
    );
    if (!upstream.ok && upstream.status !== 206) {
      return jsonError('视频源请求失败', 502);
    }
    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = Number(upstream.headers.get('content-length'));
    const isManifest =
      /mpegurl/i.test(contentType) ||
      new URL(finalUrl).pathname.endsWith('.m3u8');

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
        await rewriteHlsManifest(filteredManifest, finalUrl, secret),
        {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            // The URL is HMAC-signed and contains no account data. A short
            // shared cache prevents every retry/seek from rebuilding the same
            // manifest in the Worker.
            'Cache-Control': 'private, max-age=30',
            'CDN-Cache-Control': 'public, max-age=120',
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
    const isRangeRequest = Boolean(request.headers.get('range'));
    const headers = new Headers({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': isRangeRequest
        ? 'private, max-age=60'
        : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    if (!isRangeRequest) {
      // Signed, immutable HLS fragments may be reused at the edge. Range
      // responses remain private because partial-response cache semantics vary
      // between upstream providers.
      headers.set('CDN-Cache-Control', 'public, max-age=3600');
    }
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
