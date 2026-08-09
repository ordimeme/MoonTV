/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  createSessionToken,
  getSessionSecret,
  parseSessionToken,
  verifySessionToken,
} from '../session';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('signed sessions', () => {
  it('requires an independent high-entropy session secret', () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'short';
    expect(getSessionSecret()).toBeNull();
    process.env.SESSION_SECRET = 'x'.repeat(32);
    expect(getSessionSecret()).toBe('x'.repeat(32));
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  it('verifies a valid unexpired session', async () => {
    const token = await createSessionToken(
      'test-secret',
      { username: 'alice', role: 'admin', mode: 'database' },
      1_000
    );
    await expect(
      verifySessionToken(token, 'test-secret', 2_000)
    ).resolves.toMatchObject({
      username: 'alice',
      role: 'admin',
      mode: 'database',
    });
  });

  it('rejects tampering and expiry', async () => {
    const token = await createSessionToken(
      'test-secret',
      { role: 'user', mode: 'localstorage' },
      1_000
    );
    await expect(
      verifySessionToken(`${token}x`, 'test-secret', 2_000)
    ).resolves.toBeNull();
    await expect(
      verifySessionToken(token, 'test-secret', 25 * 60 * 60 * 1000)
    ).resolves.toBeNull();
    expect(parseSessionToken('not-a-token')).toBeNull();
  });
});
