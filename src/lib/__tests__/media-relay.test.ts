/** @jest-environment node */

import { webcrypto } from 'node:crypto';

import {
  createMediaRelayPath,
  DIRECT_HLS_REFERENCE_THRESHOLD,
  isSafeMediaUrl,
  MAX_MANIFEST_REFERENCES,
  relayMediaUrls,
  resolveScopedMediaUrl,
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

  it('reuses the imported HMAC key across media URLs', async () => {
    const importKey = jest.spyOn(webcrypto.subtle, 'importKey');
    const cacheSecret = `${secret}-cache-test`;

    await signMediaUrl('https://cdn.example.com/a/one.m3u8', cacheSecret);
    await signMediaUrl('https://cdn.example.com/a/two.m3u8', cacheSecret);

    expect(importKey).toHaveBeenCalledTimes(1);
    importKey.mockRestore();
  });

  it('signs one directory scope for many episode URLs', async () => {
    const sign = jest.spyOn(webcrypto.subtle, 'sign');
    const paths = await relayMediaUrls(
      [
        'https://cdn.example.com/show/one.m3u8',
        'https://cdn.example.com/show/two.m3u8',
      ],
      `${secret}-scope-test`
    );

    expect(sign).toHaveBeenCalledTimes(1);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain('scope=');
    expect(paths[0]).toContain('path=one.m3u8');
    sign.mockRestore();
  });

  it('does not allow a scoped path to escape its signed directory', () => {
    const scope = 'https://cdn.example.com/show/';
    expect(resolveScopedMediaUrl(scope, 'part/one.ts')).toBe(
      'https://cdn.example.com/show/part/one.ts'
    );
    expect(resolveScopedMediaUrl(scope, '../private.txt')).toBeNull();
    expect(
      resolveScopedMediaUrl(scope, 'https://other.example.com/x')
    ).toBeNull();
  });

  it('rejects manifests with excessive references before unbounded signing', async () => {
    const manifest = Array.from(
      { length: MAX_MANIFEST_REFERENCES + 1 },
      (_, index) => `segment-${index}.ts`
    ).join('\n');
    await expect(
      rewriteHlsManifest(
        manifest,
        'https://cdn.example.com/show/index.m3u8',
        `${secret}-manifest-budget`
      )
    ).rejects.toThrow('播放清单引用过多');
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

  it('keeps large VOD segment lists direct while relaying keys', async () => {
    const segments = Array.from(
      { length: DIRECT_HLS_REFERENCE_THRESHOLD + 1 },
      (_, index) => `segment-${index}.ts`
    );
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      ...segments,
    ].join('\n');

    const rewritten = await rewriteHlsManifest(
      manifest,
      'https://v11.adfg8.vip/show/index.m3u8',
      secret
    );

    expect(rewritten).toContain('https://v11.adfg8.vip/show/segment-0.ts');
    expect(rewritten).toContain(
      `https://v11.adfg8.vip/show/segment-${DIRECT_HLS_REFERENCE_THRESHOLD}.ts`
    );
    expect(rewritten.match(/\/api\/media\?/g)).toHaveLength(1);
    expect(rewritten).not.toContain('URI="key.bin"');
  });
});
