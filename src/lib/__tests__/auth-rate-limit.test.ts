/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  checkRateLimit,
  checkRateLimitTargets,
  clearRateLimit,
  createLoginRateLimitTargets,
  createRateLimitKey,
  createRateLimitKeys,
  LOGIN_ADDRESS_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  recordRateLimitFailure,
  recordRateLimitTargetFailures,
} from '../auth-rate-limit';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('authentication rate limiting', () => {
  it('hashes client identifiers and blocks repeated failures', async () => {
    const request = {
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'cf-connecting-ip'
            ? '203.0.113.7'
            : null;
        },
      },
    } as Request;
    const key = await createRateLimitKey(request, 'login', 'alice');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('203.0.113.7');

    await clearRateLimit(key);
    for (
      let attempt = 0;
      attempt < LOGIN_RATE_LIMIT.maxAttempts;
      attempt += 1
    ) {
      await recordRateLimitFailure(key, LOGIN_RATE_LIMIT, 1_000);
    }
    await expect(
      checkRateLimit(key, LOGIN_RATE_LIMIT, 2_000)
    ).resolves.toMatchObject({ allowed: false });
    await clearRateLimit(key);
  });

  it('creates a shared per-address bucket in addition to an identity bucket', async () => {
    const request = {
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'cf-connecting-ip'
            ? '203.0.113.8'
            : null;
        },
      },
    } as Request;
    const alice = await createRateLimitKeys(request, 'login', 'alice');
    const bob = await createRateLimitKeys(request, 'login', 'bob');
    expect(alice).toHaveLength(2);
    expect(bob).toHaveLength(2);
    expect(alice[0]).toBe(bob[0]);
    expect(alice[1]).not.toBe(bob[1]);
  });

  it('does not let one account exhaust every account on the same address', async () => {
    const request = {
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'cf-connecting-ip'
            ? '203.0.113.9'
            : null;
        },
      },
    } as Request;
    const alice = await createLoginRateLimitTargets(request, 'alice');
    const bob = await createLoginRateLimitTargets(request, 'bob');

    expect(alice.map((target) => target.policy.maxAttempts)).toEqual([
      LOGIN_ADDRESS_RATE_LIMIT.maxAttempts,
      LOGIN_RATE_LIMIT.maxAttempts,
    ]);
    expect(alice[0].key).toBe(bob[0].key);
    expect(alice[1].key).not.toBe(bob[1].key);

    for (
      let attempt = 0;
      attempt < LOGIN_RATE_LIMIT.maxAttempts;
      attempt += 1
    ) {
      await recordRateLimitTargetFailures(alice);
    }

    await expect(checkRateLimitTargets(alice)).resolves.toMatchObject({
      allowed: false,
    });
    await expect(checkRateLimitTargets(bob)).resolves.toMatchObject({
      allowed: true,
    });

    await Promise.all(
      [...alice, ...bob].map((target) => clearRateLimit(target.key))
    );
  });
});
