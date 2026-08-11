/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig, AdminConfigConflictError } from './admin.types';
import runtimeConfig from './runtime';
import {
  getSourceAuditPolicy,
  isSourceAuditFresh,
  SOURCE_AUDIT_DATE,
} from './source-audit';
import { isSafeUpstreamUrl } from './upstream-security';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
};

// 在模块加载时根据环境决定配置来源
let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

type SourceConfigEntry = AdminConfig['SourceConfig'][number];

function buildRuntimeSource(
  key: string,
  site: ApiSite,
  existing?: SourceConfigEntry
): SourceConfigEntry {
  const policy = getSourceAuditPolicy(key);
  const useExistingAudit = Boolean(
    existing?.auditStatus && isSourceAuditFresh(existing.auditDate)
  );
  const auditDate = useExistingAudit
    ? existing?.auditDate
    : policy
    ? SOURCE_AUDIT_DATE
    : existing?.auditDate;
  const auditIsFresh = isSourceAuditFresh(auditDate);
  const auditStatus = useExistingAudit ? existing?.auditStatus : policy?.status;
  const auditNote = useExistingAudit ? existing?.auditNote : policy?.note;
  return {
    ...existing,
    key,
    name: site.name,
    api: site.api,
    detail: site.detail,
    from: 'config',
    disabled: Boolean(
      existing?.disabled ||
        auditStatus === 'blocked' ||
        auditStatus === 'pending' ||
        !auditIsFresh
    ),
    deleted: existing?.deleted || false,
    auditStatus: auditIsFresh ? auditStatus : 'pending',
    auditNote: auditIsFresh
      ? auditNote
      : '审核已过期或尚未审核，需重新验证后才能启用',
    auditDate,
  };
}

function mergeRuntimeSources(
  existingSources: SourceConfigEntry[] | undefined,
  apiSiteEntries: [string, ApiSite][]
): SourceConfigEntry[] {
  const sourceConfigMap = new Map(
    (existingSources || []).map((source) => [source.key, source])
  );

  apiSiteEntries.forEach(([key, site]) => {
    sourceConfigMap.set(
      key,
      buildRuntimeSource(key, site, sourceConfigMap.get(key))
    );
  });

  const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
  sourceConfigMap.forEach((source) => {
    if (!apiSiteKeys.has(source.key)) source.from = 'custom';
  });

  return Array.from(sourceConfigMap.values());
}

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  if (process.env.DOCKER_ENV === 'true') {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    // 数据库存储，读取并补全管理员配置
    const storage = getStorage();

    try {
      // 尝试从数据库获取管理员配置
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      // 获取所有用户名，用于补全 Users
      let userNames: string[] = [];
      if (storage && typeof (storage as any).getAllUsers === 'function') {
        try {
          userNames = await (storage as any).getAllUsers();
        } catch (e) {
          console.error('获取用户列表失败:', e);
        }
      }

      // 从文件中获取源信息，用于补全源
      const apiSiteEntries = Object.entries(fileConfig.api_site);
      const customCategories = fileConfig.custom_category || [];

      const shouldCreateAdminConfig = !adminConfig;
      if (adminConfig) {
        adminConfig.SourceConfig = mergeRuntimeSources(
          adminConfig.SourceConfig,
          apiSiteEntries
        );

        // 确保 CustomCategories 被初始化
        if (!adminConfig.CustomCategories) {
          adminConfig.CustomCategories = [];
        }

        // 补全 CustomCategories
        const customCategoriesMap = new Map(
          adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
        );

        customCategories.forEach((category) => {
          customCategoriesMap.set(category.query + category.type, {
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          });
        });

        // 检查现有 CustomCategories 是否在 fileConfig.custom_category 中，如果不在则标记为 custom
        const customCategoriesKeys = new Set(
          customCategories.map((c) => c.query + c.type)
        );
        customCategoriesMap.forEach((category) => {
          if (!customCategoriesKeys.has(category.query + category.type)) {
            category.from = 'custom';
          }
        });

        // 将 Map 转换回数组
        adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

        const existedUsers = new Set(
          (adminConfig.UserConfig.Users || []).map((u) => u.username)
        );
        userNames.forEach((uname) => {
          if (!existedUsers.has(uname)) {
            adminConfig!.UserConfig.Users.push({
              username: uname,
              role: 'user',
            });
          }
        });
        // 站长
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
            (u) => u.username !== ownerUser
          );
          adminConfig!.UserConfig.Users.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
      } else {
        // 数据库中没有配置，创建新的管理员配置
        let allUsers = userNames.map((uname) => ({
          username: uname,
          role: 'user',
        }));
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          allUsers = allUsers.filter((u) => u.username !== ownerUser);
          allUsers.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
        adminConfig = {
          SiteConfig: {
            SiteName: process.env.SITE_NAME || 'MoonTV',
            Announcement:
              process.env.ANNOUNCEMENT ||
              '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
            SearchDownstreamMaxPage:
              Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
            SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
            ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
            DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
            DisableYellowFilter:
              process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
          },
          UserConfig: {
            AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
            Users: allUsers as any,
          },
          SourceConfig: mergeRuntimeSources([], apiSiteEntries),
          CustomCategories: customCategories.map((category) => ({
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          })),
        };
      }

      // 写回数据库（更新/创建）
      if (
        shouldCreateAdminConfig &&
        storage &&
        typeof (storage as any).setAdminConfig === 'function'
      ) {
        try {
          await (storage as any).setAdminConfig(adminConfig);
        } catch (error) {
          // 多个冷启动请求可能同时创建初始配置；输掉竞争的一方读取胜者，
          // 不应把正常并发暴露成“数据库错误”。
          const isConflict =
            error instanceof AdminConfigConflictError ||
            (error instanceof Error &&
              error.name === 'AdminConfigConflictError');
          if (
            !isConflict ||
            typeof (storage as any).getAdminConfig !== 'function'
          ) {
            throw error;
          }
          const persisted = await (storage as any).getAdminConfig();
          if (!persisted) throw error;
          adminConfig = persisted;
        }
      }

      // 更新缓存
      if (!adminConfig) throw new Error('管理员配置初始化失败');
      cachedConfig = adminConfig;
    } catch (err) {
      console.error('加载管理员配置失败:', err);
      throw err;
    }
  } else {
    // 本地存储直接使用文件配置
    cachedConfig = {
      SiteConfig: {
        SiteName: process.env.SITE_NAME || 'MoonTV',
        Announcement:
          process.env.ANNOUNCEMENT ||
          '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
        SearchDownstreamMaxPage:
          Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
        SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
        ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
        DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
        DisableYellowFilter:
          process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
      },
      UserConfig: {
        AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
        Users: [],
      },
      SourceConfig: mergeRuntimeSources(
        [],
        Object.entries(fileConfig.api_site)
      ),
      CustomCategories:
        fileConfig.custom_category?.map((category) => ({
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        })) || [],
    } as AdminConfig;
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }
  // 非 docker 环境且 DB 存储，直接读 db 配置
  const storage = getStorage();
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }
  if (adminConfig) {
    // 确保 CustomCategories 被初始化
    if (!adminConfig.CustomCategories) {
      adminConfig.CustomCategories = [];
    }

    // 合并文件中的源信息
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
    const apiSiteEntries = Object.entries(fileConfig.api_site);
    adminConfig.SourceConfig = mergeRuntimeSources(
      adminConfig.SourceConfig,
      apiSiteEntries
    );

    const ownerUser = process.env.USERNAME || '';
    // 检查配置中的站长用户是否和 USERNAME 匹配，如果不匹配则降级为普通用户
    let containOwner = false;
    adminConfig.UserConfig.Users.forEach((user) => {
      if (user.username !== ownerUser && user.role === 'owner') {
        user.role = 'user';
      }
      if (user.username === ownerUser) {
        containOwner = true;
        user.role = 'owner';
      }
    });

    // 如果不在则添加
    if (ownerUser && !containOwner) {
      adminConfig.UserConfig.Users.unshift({
        username: ownerUser,
        role: 'owner',
      });
    }
    cachedConfig = adminConfig;
  } else {
    // DB 无配置，执行一次初始化
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const storage = getStorage();
  // 获取所有用户名，用于补全 Users
  let userNames: string[] = [];
  if (storage && typeof (storage as any).getAllUsers === 'function') {
    try {
      userNames = await (storage as any).getAllUsers();
    } catch (e) {
      console.error('获取用户列表失败:', e);
    }
  }

  if (process.env.DOCKER_ENV === 'true') {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const apiSiteEntries = Object.entries(fileConfig.api_site);
  const customCategories = fileConfig.custom_category || [];
  let allUsers = userNames.map((uname) => ({
    username: uname,
    role: 'user',
  }));
  const ownerUser = process.env.USERNAME;
  if (ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== ownerUser);
    allUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }
  const adminConfig = {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'MoonTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      DisableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: allUsers as any,
    },
    SourceConfig: mergeRuntimeSources([], apiSiteEntries),
    CustomCategories:
      storageType === 'redis'
        ? customCategories?.map((category) => ({
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          })) || []
        : [],
  } as AdminConfig;

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }
  if (cachedConfig == null) {
    // serverless 环境，直接使用 adminConfig
    cachedConfig = adminConfig;
  }
  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.SourceConfig = adminConfig.SourceConfig;
  cachedConfig.CustomCategories = adminConfig.CustomCategories;
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  return config.SourceConfig.filter(
    (s) =>
      !s.disabled &&
      !s.deleted &&
      (s.auditStatus === 'clean' || s.auditStatus === 'filterable') &&
      isSourceAuditFresh(s.auditDate) &&
      isSafeUpstreamUrl(s.api) &&
      (!s.detail || isSafeUpstreamUrl(s.detail))
  ).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
    detail: s.detail,
  }));
}
