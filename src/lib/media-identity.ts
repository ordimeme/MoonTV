const SOURCE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface MediaIdentity {
  source: string;
  id: string;
}

function isValidIdentity(source: unknown, id: unknown): source is string {
  return (
    typeof source === 'string' &&
    typeof id === 'string' &&
    SOURCE_PATTERN.test(source) &&
    ID_PATTERN.test(id)
  );
}

/**
 * Prefer explicit source/id fields. The legacy compound key fallback also
 * accepts a space because URLSearchParams decodes `+` as a space on some
 * Cloudflare/OpenNext request paths.
 */
export function parseMediaIdentity(input: {
  source?: unknown;
  id?: unknown;
  key?: unknown;
}): MediaIdentity | null {
  if (isValidIdentity(input.source, input.id)) {
    return { source: input.source, id: input.id as string };
  }
  if (typeof input.key !== 'string') return null;

  const match = input.key.match(
    /^([A-Za-z0-9_-]{1,64})[+ ]([A-Za-z0-9_-]{1,128})$/
  );
  return match ? { source: match[1], id: match[2] } : null;
}

export function buildMediaIdentityQuery(source: string, id: string): string {
  if (!isValidIdentity(source, id)) {
    throw new Error('无效的视频标识');
  }
  return new URLSearchParams({ source, id }).toString();
}
