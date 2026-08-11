/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  hashPassword,
  isPasswordHash,
  verifyStoredPassword,
} from '../password';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('password storage', () => {
  it('hashes and verifies passwords without retaining plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(isPasswordHash(hash)).toBe(true);
    expect(hash.split('$')[1]).toBe('100000');
    expect(hash).not.toContain('correct horse battery staple');
    await expect(
      verifyStoredPassword('correct horse battery staple', hash)
    ).resolves.toBe(true);
    await expect(verifyStoredPassword('wrong', hash)).resolves.toBe(false);
  });

  it('accepts legacy plaintext only for migration', async () => {
    expect(isPasswordHash('legacy-password')).toBe(false);
    await expect(
      verifyStoredPassword('legacy-password', 'legacy-password')
    ).resolves.toBe(true);
    await expect(
      verifyStoredPassword('wrong', 'legacy-password')
    ).resolves.toBe(false);
  });
});
