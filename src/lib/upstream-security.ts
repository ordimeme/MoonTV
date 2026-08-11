const MAX_UPSTREAM_URL_LENGTH = 2048;
export const MAX_UPSTREAM_JSON_BYTES = 2 * 1024 * 1024;

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isSafeUpstreamUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_UPSTREAM_URL_LENGTH
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      Boolean(hostname) &&
      hostname !== 'localhost' &&
      !hostname.endsWith('.localhost') &&
      !hostname.endsWith('.local') &&
      !hostname.endsWith('.internal') &&
      !hostname.includes(':') &&
      !isBlockedIpv4(hostname)
    );
  } catch {
    return false;
  }
}

export async function readJsonResponseLimited<T>(
  response: Response,
  maxBytes = MAX_UPSTREAM_JSON_BYTES
): Promise<T> {
  return JSON.parse(await readTextResponseLimited(response, maxBytes)) as T;
}

export async function readTextResponseLimited(
  response: Response,
  maxBytes = MAX_UPSTREAM_JSON_BYTES
): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('上游响应过大');
  }
  if (!response.body) throw new Error('上游响应为空');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reading = true;
  while (reading) {
    const { done, value } = await reader.read();
    if (done) {
      reading = false;
      continue;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('上游响应过大');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
