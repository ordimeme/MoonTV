/** @jest-environment node */

import {
  extractPlayableEpisodes,
  getDetailFromApi,
  searchFromApi,
} from '../downstream';

describe('downstream search resource budgets', () => {
  const site = {
    key: 'test',
    name: '测试源',
    api: 'https://media.example.com/api.php/provide/vod',
  };

  const responseWithBody = (body: string, contentType: string): Response => {
    const bytes = new TextEncoder().encode(body);
    let delivered = false;
    return {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'content-type' ? contentType : null;
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

  it('selects the best safe playback group instead of assuming the first group', () => {
    const episodes = extractPlayableEpisodes(
      '第1集$http://legacy.example.com/one.m3u8$$$' +
        '第1集$https://cdn.example.com/one.m3u8#' +
        '第2集$https://cdn.example.com/two.m3u8'
    );
    expect(episodes).toEqual([
      'https://cdn.example.com/one.m3u8',
      'https://cdn.example.com/two.m3u8',
    ]);
  });

  it('falls back to the JSON catalog when a special detail page is blocked', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        responseWithBody(
          '<a href="/WAF/VERIFY/CAPTCHA">Temporary Redirect</a>',
          'text/html'
        )
      )
      .mockResolvedValueOnce(
        responseWithBody(
          JSON.stringify({
            list: [
              {
                vod_id: '1',
                vod_name: '测试影片',
                vod_pic: 'https://img.example.com/1.jpg',
                vod_play_url: '正片$https://video.example.com/show/index.m3u8',
                vod_year: '2026',
              },
            ],
          }),
          'application/json'
        )
      ) as typeof fetch;

    const detail = await getDetailFromApi(
      { ...site, detail: 'https://media.example.com' },
      '1'
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(detail.episodes).toEqual([
      'https://video.example.com/show/index.m3u8',
    ]);
  });
});
