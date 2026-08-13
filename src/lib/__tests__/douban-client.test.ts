import { fetchDoubanList, getDoubanCategories } from '../douban.client';

describe('douban client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('maps the search_subjects response used by a local proxy', async () => {
    localStorage.setItem('enableDoubanProxy', 'true');
    localStorage.setItem('doubanProxyUrl', '/api/proxy?url=');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        subjects: [
          {
            id: '1295644',
            title: '这个杀手不太冷',
            cover: 'https://img.example/poster.jpg',
            rate: '9.4',
          },
        ],
      }),
    } as Response);

    await expect(
      fetchDoubanList({ tag: '热门', type: 'movie' })
    ).resolves.toEqual({
      code: 200,
      message: '获取成功',
      list: [
        {
          id: '1295644',
          title: '这个杀手不太冷',
          poster: 'https://img.example/poster.jpg',
          rate: '9.4',
          year: '',
        },
      ],
    });
  });

  it('can keep a non-critical home category failure silent', async () => {
    const dispatch = jest.spyOn(window, 'dispatchEvent');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await expect(
      getDoubanCategories({
        kind: 'movie',
        category: '热门',
        type: '全部',
        notifyError: false,
      })
    ).rejects.toThrow('获取豆瓣分类数据失败');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('falls back to search_subjects when a configured proxy cannot load recent_hot', async () => {
    localStorage.setItem('enableDoubanProxy', 'true');
    localStorage.setItem('doubanProxyUrl', '/api/proxy?url=');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 502 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subjects: [
            {
              id: '42',
              title: '备用内容',
              cover: 'https://img.example/fallback.jpg',
              rate: '8.8',
            },
          ],
        }),
      } as Response);

    const result = await getDoubanCategories({
      kind: 'movie',
      category: '热门',
      type: '全部',
    });

    expect(result.list).toEqual([
      {
        id: '42',
        title: '备用内容',
        poster: 'https://img.example/fallback.jpg',
        rate: '8.8',
        year: '',
      },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps an inline-handled list failure out of the global error toast', async () => {
    const dispatch = jest.spyOn(window, 'dispatchEvent');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false } as Response);

    await expect(
      fetchDoubanList({
        tag: '综艺',
        type: 'tv',
        notifyError: false,
      })
    ).rejects.toThrow('获取豆瓣分类数据失败');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
