/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-var-requires */

const webStreams = require('stream/web');
Object.assign(globalThis, {
  ReadableStream: webStreams.ReadableStream,
  TransformStream: webStreams.TransformStream,
  WritableStream: webStreams.WritableStream,
});
const edgeFetch = require('next/dist/compiled/@edge-runtime/primitives/fetch');
Object.assign(globalThis, {
  Request: edgeFetch.Request,
  Response: edgeFetch.Response,
  Headers: edgeFetch.Headers,
});

jest.mock('@/lib/config', () => ({
  getCacheTime: jest.fn().mockResolvedValue(300),
}));

const { GET } = require('./route') as typeof import('./route');

describe('douban categories route', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('falls back to search_subjects when recent_hot is unavailable', async () => {
    const fetchMock = (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subjects: [
              {
                id: '1295644',
                title: '这个杀手不太冷',
                cover: 'https://img.example/poster.jpg',
                rate: '9.4',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const response = await GET(
      new Request(
        'http://localhost/api/douban/categories?kind=movie&category=%E7%83%AD%E9%97%A8&type=%E5%85%A8%E9%83%A8&limit=20&start=0'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code: 200,
      list: [{ id: '1295644', title: '这个杀手不太冷' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('j/search_subjects');
  });

  it('rejects invalid numeric pagination before making an upstream request', async () => {
    const fetchMock = global.fetch as jest.Mock;
    const response = await GET(
      new Request(
        'http://localhost/api/douban/categories?kind=movie&category=hot&type=all&limit=oops'
      )
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
