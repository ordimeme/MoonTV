const DEFAULT_MAX_JSON_BYTES = 8 * 1024;

export class RequestValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RequestValidationError';
    this.status = status;
  }
}

export async function readLimitedJson<T>(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES
): Promise<T> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestValidationError('请求体过大', 413);
  }

  if (!request.body) throw new RequestValidationError('请求体不能为空');
  const reader = request.body.getReader();
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
      throw new RequestValidationError('请求体过大', 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    throw new RequestValidationError('JSON 格式错误');
  }
}

export function isSafeUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 64 &&
    /^[A-Za-z0-9_.-]+$/.test(value)
  );
}

export function isSafePassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

export function isSameOriginMutation(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
    return true;

  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    if (originUrl.origin === requestUrl.origin) return true;

    // In local development Next.js may bind to 0.0.0.0 while the browser uses
    // localhost. The Host header represents the browser-visible destination.
    const host = request.headers.get('host');
    const forwardedProtocol = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      .trim();
    const protocol = forwardedProtocol
      ? `${forwardedProtocol.replace(/:$/, '')}:`
      : requestUrl.protocol;

    return Boolean(
      host && originUrl.host === host && originUrl.protocol === protocol
    );
  } catch {
    return false;
  }
}
