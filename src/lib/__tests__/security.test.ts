import { TextDecoder, TextEncoder } from 'node:util';

import {
  isSafePassword,
  isSafeUsername,
  isSameOriginMutation,
  readLimitedJson,
  RequestValidationError,
} from '../request-security';
import {
  buildContentSecurityPolicy,
  getSafeRedirect,
  serializeForInlineScript,
} from '../security';
import {
  isSafeUpstreamUrl,
  readJsonResponseLimited,
  readTextResponseLimited,
} from '../upstream-security';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });

function headers(values: Record<string, string> = {}) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  } as Headers;
}

function bodyStream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  }) as unknown as ReadableStream<Uint8Array>;
}

function requestWithBody(value: string): Request {
  return {
    body: bodyStream(value),
    headers: headers(),
    method: 'POST',
    url: 'https://example.com/api/test',
  } as unknown as Request;
}

function responseWithBody(value: string): Response {
  return {
    body: bodyStream(value),
    headers: headers(),
  } as unknown as Response;
}

describe('security helpers', () => {
  it('accepts only same-origin redirect paths', () => {
    expect(getSafeRedirect('/search?q=test')).toBe('/search?q=test');
    expect(getSafeRedirect('https://example.com')).toBe('/');
    expect(getSafeRedirect('//example.com')).toBe('/');
    expect(getSafeRedirect(null)).toBe('/');
  });

  it('escapes characters that can break an inline script', () => {
    const serialized = serializeForInlineScript({ value: '</script>&' });
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e\\u0026');
  });

  it('allows eval only for the local development bundle', () => {
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).not.toContain(
      "script-src 'self' 'unsafe-inline'"
    );
    expect(buildContentSecurityPolicy(false)).toContain("connect-src 'self'");
  });

  it('allows only nonce-bearing inline scripts in production', () => {
    const policy = buildContentSecurityPolicy(false, 'test-nonce');
    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('limits and validates JSON request bodies', async () => {
    const request = requestWithBody(JSON.stringify({ ok: true }));
    await expect(readLimitedJson(request, 64)).resolves.toEqual({ ok: true });

    const oversized = requestWithBody('x'.repeat(65));
    await expect(readLimitedJson(oversized, 64)).rejects.toBeInstanceOf(
      RequestValidationError
    );
  });

  it('rejects cross-site mutations and unsafe credentials', () => {
    expect(
      isSameOriginMutation({
        method: 'POST',
        url: 'https://example.com/api/test',
        headers: headers({ origin: 'https://evil.example' }),
      } as Request)
    ).toBe(false);
    expect(isSafeUsername('henrywu2030')).toBe(true);
    expect(isSafeUsername('../owner')).toBe(false);
    expect(isSafePassword('long-enough-password')).toBe(true);
    expect(isSafePassword('short')).toBe(false);
  });

  it('accepts localhost mutations when Next.js binds to 0.0.0.0', () => {
    expect(
      isSameOriginMutation({
        method: 'POST',
        url: 'http://0.0.0.0:3000/api/login',
        headers: headers({
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
        }),
      } as Request)
    ).toBe(true);

    expect(
      isSameOriginMutation({
        method: 'POST',
        url: 'http://0.0.0.0:3000/api/login',
        headers: headers({
          host: 'localhost:3000',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        }),
      } as Request)
    ).toBe(false);
  });

  it('allows only credential-free public HTTPS upstream URLs', () => {
    expect(isSafeUpstreamUrl('https://api.example.com/vod')).toBe(true);
    expect(isSafeUpstreamUrl('http://api.example.com/vod')).toBe(false);
    expect(isSafeUpstreamUrl('https://127.0.0.1/vod')).toBe(false);
    expect(isSafeUpstreamUrl('https://user:pass@example.com/vod')).toBe(false);
    expect(isSafeUpstreamUrl('https://api.example.com/vod?token=secret')).toBe(
      false
    );
  });

  it('caps upstream JSON responses', async () => {
    await expect(
      readJsonResponseLimited(
        responseWithBody(JSON.stringify({ ok: true })),
        64
      )
    ).resolves.toEqual({ ok: true });
    await expect(
      readJsonResponseLimited(responseWithBody('x'.repeat(65)), 64)
    ).rejects.toThrow('上游响应过大');
  });

  it('caps upstream text responses', async () => {
    await expect(
      readTextResponseLimited(responseWithBody('safe'), 8)
    ).resolves.toBe('safe');
    await expect(
      readTextResponseLimited(responseWithBody('x'.repeat(9)), 8)
    ).rejects.toThrow('上游响应过大');
  });
});
/** @jest-environment node */

import { ReadableStream } from 'node:stream/web';
