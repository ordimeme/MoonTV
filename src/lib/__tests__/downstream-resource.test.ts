/** @jest-environment node */

import { searchFromApi } from '../downstream';

describe('downstream search resource budgets', () => {
  const site = {
    key: 'test',
    name: '测试源',
    api: 'https://media.example.com/api.php/provide/vod',
  };

  beforeEach(() => {
    global.fetch = jest.fn(async () => {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          pagecount: 8,
          list: [
            {
              vod_id: '1',
              vod_name: '测试影片',
              vod_pic: 'https://img.example.com/1.jpg',
              vod_play_url: '第1集$https://video.example.com/show/one.m3u8',
              vod_year: '2026',
            },
          ],
        })
      );
      let delivered = false;
      return {
        ok: true,
        status: 200,
        headers: {
          get(name: string) {
            return name.toLowerCase() === 'content-type'
              ? 'application/json'
              : null;
          },
        } as Headers,
        body: {
          getReader() {
            return {
              async read() {
                if (delivered) return { done: true, value: undefined };
                delivered = true;
                return { done: false, value: bytes };
              },
              async cancel() {
                return undefined;
              },
            };
          },
        },
      } as Response;
    }) as typeof fetch;
  });

  it('uses only one upstream request when aggregate search requests one page', async () => {
    const results = await searchFromApi(site, '测试', {
      maxPages: 1,
      maxResults: 25,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });

  it('never exceeds the explicit page budget', async () => {
    await searchFromApi(site, '测试', { maxPages: 3, maxResults: 25 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('bounds parsed results and can skip expensive descriptions', async () => {
    const results = await searchFromApi(site, '测试', {
      includeDescriptions: false,
      maxPages: 1,
      maxResults: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0].desc).toBe('');
  });
});
