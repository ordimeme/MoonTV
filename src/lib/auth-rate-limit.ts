import { getCloudflareBinding } from './cloudflare-context';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
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

export interface RateLimitTarget {
  key: string;
  kind: 'address' | 'identity';
  policy: RateLimitPolicy;
}

export const LOGIN_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};

export const LOGIN_ADDRESS_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 30,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};

export const REGISTER_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000,
  blockMs: 60 * 60 * 1000,
};

export const SEARCH_RATE_LIMIT: RateLimitPolicy = {
  maxAttempts: 30,
  windowMs: 60 * 1000,
  blockMs: 60 * 1000,
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

async function getD1(): Promise<D1Database | null> {
  if ((process.env.NEXT_PUBLIC_STORAGE_TYPE || '') !== 'd1') return null;
  return (await getCloudflareBinding<D1Database>('DB')) || null;
}

async function ensureTable(db: D1Database): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .prepare(TABLE_SQL)
      .run()
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  await tableReady;
}

function checkLocalRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now: number
): RateLimitStatus {
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

function recordLocalFailure(
  key: string,
  policy: RateLimitPolicy,
  now: number
): void {
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

export async function createRateLimitKeys(
  request: Request,
  scope: string,
  identity = ''
): Promise<string[]> {
  const [addressKey, identityKey] = await Promise.all([
    createRateLimitKey(request, scope),
    identity.trim() ? createRateLimitKey(request, scope, identity) : null,
  ]);
  if (!identityKey) return [addressKey];
  return identityKey === addressKey ? [addressKey] : [addressKey, identityKey];
}

export async function createLoginRateLimitTargets(
  request: Request,
  identity = ''
): Promise<RateLimitTarget[]> {
  const normalizedIdentity = identity.trim();
  const addressTarget: RateLimitTarget = {
    key: await createRateLimitKey(request, 'login-v2-address'),
    kind: 'address',
    policy: normalizedIdentity ? LOGIN_ADDRESS_RATE_LIMIT : LOGIN_RATE_LIMIT,
  };
  if (!normalizedIdentity) return [addressTarget];
  return [
    addressTarget,
    {
      key: await createRateLimitKey(
        request,
        'login-v2-identity',
        normalizedIdentity
      ),
      kind: 'identity',
      policy: LOGIN_RATE_LIMIT,
    },
  ];
}

export async function checkRateLimitTargets(
  targets: RateLimitTarget[]
): Promise<RateLimitStatus> {
  const statuses = await Promise.all(
    targets.map((target) => checkRateLimit(target.key, target.policy))
  );
  return statuses.reduce<RateLimitStatus>(
    (result, status) =>
      status.allowed
        ? result
        : {
            allowed: false,
            retryAfterSeconds: Math.max(
              result.retryAfterSeconds,
              status.retryAfterSeconds
            ),
          },
    { allowed: true, retryAfterSeconds: 0 }
  );
}

export async function recordRateLimitTargetFailures(
  targets: RateLimitTarget[]
): Promise<void> {
  await Promise.all(
    targets.map((target) => recordRateLimitFailure(target.key, target.policy))
  );
}

export async function clearSuccessfulLoginRateLimits(
  targets: RateLimitTarget[]
): Promise<void> {
  const identityTargets = targets.filter(
    (target) => target.kind === 'identity'
  );
  await Promise.all(
    (identityTargets.length > 0 ? identityTargets : targets).map((target) =>
      clearRateLimit(target.key)
    )
  );
}

export async function checkRateLimits(
  keys: string[],
  policy: RateLimitPolicy
): Promise<RateLimitStatus> {
  const statuses = await Promise.all(
    keys.map((key) => checkRateLimit(key, policy))
  );
  return statuses.reduce<RateLimitStatus>(
    (result, status) =>
      status.allowed
        ? result
        : {
            allowed: false,
            retryAfterSeconds: Math.max(
              result.retryAfterSeconds,
              status.retryAfterSeconds
            ),
          },
    { allowed: true, retryAfterSeconds: 0 }
  );
}

export async function recordRateLimitAttempts(
  keys: string[],
  policy: RateLimitPolicy
): Promise<void> {
  await Promise.all(keys.map((key) => recordRateLimitFailure(key, policy)));
}

export async function clearRateLimits(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => clearRateLimit(key)));
}

export async function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now()
): Promise<RateLimitStatus> {
  const db = await getD1();
  if (db) {
    try {
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
    } catch {
      return checkLocalRateLimit(key, policy, now);
    }
  }
  return checkLocalRateLimit(key, policy, now);
}

export async function recordRateLimitFailure(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now()
): Promise<void> {
  const db = await getD1();
  if (db) {
    try {
      await ensureTable(db);
      await db
        .prepare(
          `INSERT INTO auth_rate_limits
          (key_hash, attempts, window_start, blocked_until, updated_at)
         VALUES (?, 1, ?, ?, ?)
         ON CONFLICT(key_hash) DO UPDATE SET
          attempts = CASE
            WHEN auth_rate_limits.window_start + ? <= excluded.updated_at THEN 1
            ELSE auth_rate_limits.attempts + 1
          END,
          window_start = CASE
            WHEN auth_rate_limits.window_start + ? <= excluded.updated_at
              THEN excluded.updated_at
            ELSE auth_rate_limits.window_start
          END,
          blocked_until = CASE
            WHEN (
              CASE
                WHEN auth_rate_limits.window_start + ? <= excluded.updated_at
                  THEN 1
                ELSE auth_rate_limits.attempts + 1
              END
            ) >= ? THEN excluded.updated_at + ?
            ELSE 0
          END,
          updated_at = excluded.updated_at`
        )
        .bind(
          key,
          now,
          policy.maxAttempts === 1 ? now + policy.blockMs : 0,
          now,
          policy.windowMs,
          policy.windowMs,
          policy.windowMs,
          policy.maxAttempts,
          policy.blockMs
        )
        .run();
      return;
    } catch {
      recordLocalFailure(key, policy, now);
      return;
    }
  }
  recordLocalFailure(key, policy, now);
}

export async function clearRateLimit(key: string): Promise<void> {
  const db = await getD1();
  if (db) {
    try {
      await ensureTable(db);
      await db
        .prepare('DELETE FROM auth_rate_limits WHERE key_hash = ?')
        .bind(key)
        .run();
      return;
    } catch {
      localBuckets.delete(key);
      return;
    }
  }
  localBuckets.delete(key);
}
