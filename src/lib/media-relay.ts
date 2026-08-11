const MAX_MEDIA_URL_LENGTH = 4096;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(bytes))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

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
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isSafeMediaUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_MEDIA_URL_LENGTH
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

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signMediaUrl(
  url: string,
  secret: string
): Promise<string> {
  if (!isSafeMediaUrl(url)) throw new Error('不安全的视频地址');
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importSigningKey(secret),
    new TextEncoder().encode(url)
  );
  return base64Url(signature);
}

export async function verifyMediaUrlSignature(
  url: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!isSafeMediaUrl(url) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return false;
  }
  try {
    return crypto.subtle.verify(
      'HMAC',
      await importSigningKey(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(url)
    );
  } catch {
    return false;
  }
}

export async function createMediaRelayPath(
  url: string,
  secret: string
): Promise<string> {
  const params = new URLSearchParams({
    url,
    sig: await signMediaUrl(url, secret),
  });
  return `/api/media?${params.toString()}`;
}

export async function relayMediaUrls(
  urls: string[],
  secret: string
): Promise<string[]> {
  const safeUrls = Array.from(new Set(urls)).filter(isSafeMediaUrl);
  return Promise.all(safeUrls.map((url) => createMediaRelayPath(url, secret)));
}

function resolveMediaUrl(value: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(value, baseUrl).toString();
    return isSafeMediaUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export async function rewriteHlsManifest(
  manifest: string,
  manifestUrl: string,
  secret: string
): Promise<string> {
  const lines = manifest.split(/\r?\n/);
  const rewritten: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      rewritten.push(line);
      continue;
    }
    if (!trimmed.startsWith('#')) {
      const resolved = resolveMediaUrl(trimmed, manifestUrl);
      rewritten.push(
        resolved ? await createMediaRelayPath(resolved, secret) : '# blocked'
      );
      continue;
    }

    let nextLine = line;
    const uriMatches = Array.from(line.matchAll(/URI="([^"]+)"/g));
    for (const match of uriMatches) {
      const resolved = resolveMediaUrl(match[1], manifestUrl);
      if (!resolved) {
        nextLine = nextLine.replace(match[0], 'URI=""');
        continue;
      }
      nextLine = nextLine.replace(
        match[0],
        `URI="${await createMediaRelayPath(resolved, secret)}"`
      );
    }
    rewritten.push(nextLine);
  }
  return rewritten.join('\n');
}

export function limitResponseStream(
  body: ReadableStream<Uint8Array>,
  maxBytes = MAX_MEDIA_BYTES
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('media response too large');
        controller.error(new Error('视频分片过大'));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
