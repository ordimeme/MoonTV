/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  createMediaRelayPath,
  isSafeMediaUrl,
  rewriteHlsManifest,
  signMediaUrl,
  verifyMediaUrlSignature,
} from '../media-relay';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('media relay security', () => {
  const secret = 'a-secure-test-secret-with-at-least-32-characters';

  it('accepts only public HTTPS media URLs', () => {
    expect(isSafeMediaUrl('https://cdn.example.com/a/index.m3u8')).toBe(true);
    expect(isSafeMediaUrl('http://cdn.example.com/a.m3u8')).toBe(false);
    expect(isSafeMediaUrl('https://127.0.0.1/a.m3u8')).toBe(false);
    expect(isSafeMediaUrl('https://10.0.0.1/a.m3u8')).toBe(false);
    expect(isSafeMediaUrl('https://user:pass@example.com/a.m3u8')).toBe(false);
  });

  it('rejects altered signed URLs', async () => {
    const url = 'https://cdn.example.com/a/index.m3u8';
    const signature = await signMediaUrl(url, secret);
    await expect(verifyMediaUrlSignature(url, signature, secret)).resolves.toBe(
      true
    );
    await expect(
      verifyMediaUrlSignature(`${url}?changed=1`, signature, secret)
    ).resolves.toBe(false);
  });

  it('rewrites playlists, segments and encryption keys to same-origin paths', async () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXTINF:6,',
      'segment-1.ts',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000',
      'https://video.example.net/low.m3u8',
    ].join('\n');
    const rewritten = await rewriteHlsManifest(
      manifest,
      'https://cdn.example.com/show/index.m3u8',
      secret
    );
    expect(rewritten).not.toContain('URI="key.bin"');
    expect(rewritten).not.toContain('\nsegment-1.ts');
    expect(rewritten.match(/\/api\/media\?/g)).toHaveLength(3);
    await expect(
      createMediaRelayPath('https://127.0.0.1/a.m3u8', secret)
    ).rejects.toThrow('不安全的视频地址');
  });
});
