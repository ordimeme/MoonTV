import { type AdminConfig, AdminConfigConflictError } from '../admin.types';

const storedConfig: AdminConfig = {
  Revision: 7,
  SiteConfig: {
    SiteName: '站长自定义名称',
    Announcement: '站长公告',
    SearchDownstreamMaxPage: 2,
    SiteInterfaceCacheTime: 600,
    ImageProxy: '/api/image-proxy',
    DoubanProxy: '/api/douban-proxy',
    DisableYellowFilter: true,
  },
  UserConfig: {
    AllowRegister: true,
    Users: [{ username: 'existing-user', role: 'admin' }],
  },
  SourceConfig: [],
  CustomCategories: [
    {
      name: '我的分类',
      type: 'movie',
      query: 'custom-query',
      from: 'custom',
      disabled: false,
    },
  ],
};

const getAdminConfig = jest.fn<Promise<AdminConfig | null>, []>(
  async () => JSON.parse(JSON.stringify(storedConfig)) as AdminConfig
);
const setAdminConfig = jest.fn();

jest.mock('@/lib/db', () => ({
  getStorage: () => ({
    getAdminConfig,
    setAdminConfig,
    getAllUsers: async () => ['existing-user'],
  }),
}));

jest.mock('@/lib/runtime', () => ({
  __esModule: true,
  default: {
    cache_time: 7200,
    api_site: {},
    custom_category: [],
  },
}));

describe('database-backed config', () => {
  const originalStorage = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  const originalOwner = process.env.USERNAME;

  beforeEach(() => {
    jest.resetModules();
    getAdminConfig.mockClear();
    setAdminConfig.mockClear();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'd1';
    process.env.USERNAME = 'owner';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorage;
    process.env.USERNAME = originalOwner;
  });

  it('preserves settings and categories saved by the administrator', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getConfig } = require('../config') as typeof import('../config.js');
    const config = await getConfig();

    expect(config.SiteConfig.SiteName).toBe('站长自定义名称');
    expect(config.SiteConfig.Announcement).toBe('站长公告');
    expect(config.UserConfig.AllowRegister).toBe(true);
    expect(config.CustomCategories).toEqual(storedConfig.CustomCategories);
    expect(config.Revision).toBe(7);
    expect(config.UserConfig.Users[0]).toEqual({
      username: 'owner',
      role: 'owner',
    });
    expect(setAdminConfig).not.toHaveBeenCalled();
  });

  it('recovers when another request wins initial config creation', async () => {
    // getConfig 初查、initConfig 复查均为空，冲突后应读取并采用已落库配置。
    getAdminConfig
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.parse(JSON.stringify(storedConfig)) as AdminConfig
      );
    setAdminConfig.mockRejectedValueOnce(new AdminConfigConflictError());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getConfig } = require('../config') as typeof import('../config.js');
    const config = await getConfig();

    expect(config.Revision).toBe(7);
    expect(config.SiteConfig.SiteName).toBe('站长自定义名称');
    expect(setAdminConfig).toHaveBeenCalledTimes(1);
    expect(getAdminConfig).toHaveBeenCalledTimes(3);
  });
});
