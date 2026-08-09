interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<unknown>;
}

interface RateLimitRow {
  attempts: number;
  window_start: number;
  blocked_until: number;
}

interface LocalBucket {
  attempts: number;
  windowStart: number;
  blockedUntil: number;
}

export interface RateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const LOGIN_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};

export const REGISTER_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000,
  blockMs: 60 * 60 * 1000,
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
)`;

const localBuckets = new Map<string, LocalBucket>();
let tableReady: Promise<void> | null = null;

function getD1(): D1Database | null {
  if ((process.env.NEXT_PUBLIC_STORAGE_TYPE || '') !== 'd1') return null;
  return (process.env as unknown as { DB?: D1Database }).DB || null;
}

async function ensureTable(db: D1Database): Promise<void> {
  if (!tableReady) {
    tableReady = db.exec(TABLE_SQL).then(() => undefined);
  }
  await tableReady;
}

async function hashIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createRateLimitKey(
  request: Request,
  scope: string,
  identity = ''
): Promise<string> {
  const clientAddress =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return hashIdentifier(
    `${scope}|${clientAddress}|${identity.trim().toLowerCase().slice(0, 64)}`
  );
}

export async function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now()
): Promise<RateLimitStatus> {
  const db = getD1();
  if (db) {
    await ensureTable(db);
    const row = await db
      .prepare(
        'SELECT attempts, window_start, blocked_until FROM auth_rate_limits WHERE key_hash = ?'
      )
      .bind(key)
      .first<RateLimitRow>();
    if (!row || row.window_start + policy.windowMs <= now) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (row.blocked_until > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((row.blocked_until - now) / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const bucket = localBuckets.get(key);
  if (!bucket || bucket.windowStart + policy.windowMs <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordRateLimitFailure(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now()
): Promise<void> {
  const db = getD1();
  if (db) {
    await ensureTable(db);
    const existing = await db
      .prepare(
        'SELECT attempts, window_start, blocked_until FROM auth_rate_limits WHERE key_hash = ?'
      )
      .bind(key)
      .first<RateLimitRow>();
    const withinWindow = Boolean(
      existing && existing.window_start + policy.windowMs > now
    );
    const attempts = existing && withinWindow ? existing.attempts + 1 : 1;
    const windowStart = existing && withinWindow ? existing.window_start : now;
    const blockedUntil =
      attempts >= policy.maxAttempts ? now + policy.blockMs : 0;
    await db
      .prepare(
        `INSERT INTO auth_rate_limits
          (key_hash, attempts, window_start, blocked_until, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key_hash) DO UPDATE SET
          attempts = excluded.attempts,
          window_start = excluded.window_start,
          blocked_until = excluded.blocked_until,
          updated_at = excluded.updated_at`
      )
      .bind(key, attempts, windowStart, blockedUntil, now)
      .run();
    return;
  }

  const existing = localBuckets.get(key);
  const withinWindow = Boolean(
    existing && existing.windowStart + policy.windowMs > now
  );
  const attempts = existing && withinWindow ? existing.attempts + 1 : 1;
  localBuckets.set(key, {
    attempts,
    windowStart: existing && withinWindow ? existing.windowStart : now,
    blockedUntil: attempts >= policy.maxAttempts ? now + policy.blockMs : 0,
  });
  if (localBuckets.size > 1000) {
    localBuckets.forEach((bucket, bucketKey) => {
      if (bucket.windowStart + policy.windowMs <= now) {
        localBuckets.delete(bucketKey);
      }
    });
  }
}

export async function clearRateLimit(key: string): Promise<void> {
  const db = getD1();
  if (db) {
    await ensureTable(db);
    await db
      .prepare('DELETE FROM auth_rate_limits WHERE key_hash = ?')
      .bind(key)
      .run();
    return;
  }
  localBuckets.delete(key);
}
