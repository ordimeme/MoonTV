import { render, screen, waitFor } from '@testing-library/react';

import DoubanPage from './page';

const getDoubanCategories = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('type=show'),
}));

jest.mock('@/lib/douban.client', () => ({
  getDoubanCategories: (...args: unknown[]) => getDoubanCategories(...args),
  getDoubanList: jest.fn(),
}));

jest.mock('@/components/PageLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/DoubanSelector', () => ({
  __esModule: true,
  default: () => <div>分类选择器</div>,
}));
jest.mock('@/components/DoubanCustomSelector', () => ({
  __esModule: true,
  default: () => <div>自定义分类选择器</div>,
}));
jest.mock('@/components/DoubanCardSkeleton', () => ({
  __esModule: true,
  default: () => <div>加载中</div>,
}));
jest.mock('@/components/VideoCard', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('douban category pagination', () => {
  let observerTriggered = false;
  let consoleError: jest.SpyInstance;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get: () => document.body,
    });
    global.IntersectionObserver = class {
      constructor(private readonly callback: IntersectionObserverCallback) {}

      observe = () => {
        if (!observerTriggered) {
          observerTriggered = true;
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
        }
      };
      disconnect = jest.fn();
      unobserve = jest.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = '';
      thresholds = [];
    };
  });

  beforeEach(() => {
    observerTriggered = false;
    getDoubanCategories.mockReset();
    consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('keeps existing cards and avoids a page-level alert when loading more fails', async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      id: String(index),
      title: `综艺 ${index + 1}`,
      poster: '',
      rate: '',
      year: '',
    }));
    getDoubanCategories
      .mockResolvedValueOnce({ code: 200, message: 'ok', list: firstPage })
      .mockRejectedValueOnce(new Error('获取豆瓣分类数据失败'));

    render(<DoubanPage />);

    expect(await screen.findByText('综艺 1')).toBeInTheDocument();
    expect(await screen.findByText('后续内容暂时加载失败')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('综艺 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试加载更多' })).toBeEnabled();
    await waitFor(() =>
      expect(getDoubanCategories).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageStart: 25, notifyError: false })
      )
    );
  });
});
