export type SessionRole = 'owner' | 'admin' | 'user';

export interface SessionPayload {
  username?: string;
  role: SessionRole;
  mode: 'localstorage' | 'database';
  issuedAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_SESSION_SECRET_LENGTH = 32;

export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim() || '';
  return secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

export async function createSessionToken(
  secret: string,
  input: Pick<SessionPayload, 'username' | 'role' | 'mode'>,
  now = Date.now()
): Promise<string> {
  if (!secret) throw new Error('Session signing secret is not configured');

  const payload: SessionPayload = {
    ...input,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importSigningKey(secret),
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export function parseSessionToken(token: string): SessionPayload | null {
  try {
    const [encodedPayload, signature, extra] = token.split('.');
    if (!encodedPayload || !signature || extra) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload))
    ) as SessionPayload;
    if (
      !['owner', 'admin', 'user'].includes(payload.role) ||
      !['localstorage', 'database'].includes(payload.mode) ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      (payload.username !== undefined && typeof payload.username !== 'string')
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now()
): Promise<SessionPayload | null> {
  if (!secret) return null;
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importSigningKey(secret),
      fromBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload)
    );
    if (!valid) return null;

    const payload = parseSessionToken(token);
    if (!payload || payload.issuedAt > now || payload.expiresAt <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const authCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS / 1000,
};
