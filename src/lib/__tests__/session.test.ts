/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  createSessionToken,
  parseSessionToken,
  verifySessionToken,
} from '../session';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('signed sessions', () => {
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
      verifySessionToken(token, 'test-secret', 8 * 24 * 60 * 60 * 1000)
    ).resolves.toBeNull();
    expect(parseSessionToken('not-a-token')).toBeNull();
  });
});
