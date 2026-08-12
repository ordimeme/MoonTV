/** @jest-environment node */

import { fetchMedia } from '../media-fetch';

describe('media proxy redirects', () => {
  it('returns the final redirect URL for resolving relative HLS segments', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location'
              ? 'https://cdn.example.net/final/index.m3u8'
              : null,
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => null },
      } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    const result = await fetchMedia(
      'https://origin.example.com/start/index.m3u8',
      null
    );

    expect(result.response.status).toBe(200);
    expect(result.finalUrl).toBe('https://cdn.example.net/final/index.m3u8');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
