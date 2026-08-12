import { isSafeMediaUrl } from './media-relay';

const MAX_REDIRECTS = 3;

export async function fetchMedia(
  url: string,
  range: string | null
): Promise<{ response: Response; finalUrl: string }> {
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
          Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*',
          ...(range ? { Range: range } : {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('视频源返回了无效跳转');
    const next = new URL(location, current).toString();
    if (!isSafeMediaUrl(next)) throw new Error('视频源跳转到不安全地址');
    current = next;
  }
  throw new Error('视频源跳转次数过多');
}
