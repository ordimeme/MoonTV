import { NextResponse } from 'next/server';

import { limitResponseStream } from '@/lib/media-relay';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_HOST_SUFFIXES = ['douban.com', 'doubanio.com'];

function isAllowedImageHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return ALLOWED_IMAGE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.includes(':')
  ) {
    return true;
  }

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function validateImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !isAllowedImageHostname(url.hostname) ||
      isBlockedHostname(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function fetchImage(url: URL): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
          Referer: 'https://movie.douban.com/',
          'User-Agent': 'MoonTV image proxy',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid redirect');
    const next = validateImageUrl(new URL(location, current).toString());
    if (!next) throw new Error('Unsafe redirect');
    current = next;
  }
  throw new Error('Too many redirects');
}

// OrionTV 兼容接口
export async function GET(request: Request) {
  const imageUrl = new URL(request.url).searchParams.get('url');
  const validatedUrl = imageUrl ? validateImageUrl(imageUrl) : null;
  if (!validatedUrl) {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
  }

  try {
    const imageResponse = await fetchImage(validatedUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Upstream image request failed' },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    const contentLength = Number(imageResponse.headers.get('content-length'));
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json(
        { error: 'Upstream is not an image' },
        { status: 415 }
      );
    }
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large' },
        { status: 413 }
      );
    }

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Upstream image is empty' },
        { status: 502 }
      );
    }

    return new Response(
      limitResponseStream(imageResponse.body, MAX_IMAGE_BYTES),
      {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=86400',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 502 }
    );
  }
}
