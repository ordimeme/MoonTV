const PREFIX = 'pbkdf2-sha256';
// Keep password hashing within the Cloudflare Pages Functions CPU budget.
// Verification still accepts existing hashes with higher iteration counts.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

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

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function isPasswordHash(value: string): boolean {
  return value.startsWith(`${PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePassword(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyStoredPassword(
  password: string,
  stored: string
): Promise<boolean> {
  if (!isPasswordHash(stored)) {
    return constantTimeEqual(
      new TextEncoder().encode(password),
      new TextEncoder().encode(stored)
    );
  }

  const [prefix, iterationsText, saltText, expectedText, extra] =
    stored.split('$');
  const iterations = Number(iterationsText);
  if (
    prefix !== PREFIX ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !expectedText ||
    extra
  ) {
    return false;
  }

  try {
    const actual = await derivePassword(
      password,
      fromBase64Url(saltText),
      iterations
    );
    return constantTimeEqual(actual, fromBase64Url(expectedText));
  } catch {
    return false;
  }
}
