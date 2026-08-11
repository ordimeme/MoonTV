/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfigConflictError } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';
import { readLimitedJson } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      16 * 1024
    );

    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    const {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      ImageProxy,
      DoubanProxy,
      DisableYellowFilter,
    } = body as {
      SiteName: string;
      Announcement: string;
      SearchDownstreamMaxPage: number;
      SiteInterfaceCacheTime: number;
      ImageProxy: string;
      DoubanProxy: string;
      DisableYellowFilter: boolean;
    };

    // 参数校验
    if (
      typeof SiteName !== 'string' ||
      typeof Announcement !== 'string' ||
      typeof SearchDownstreamMaxPage !== 'number' ||
      typeof SiteInterfaceCacheTime !== 'number' ||
      typeof ImageProxy !== 'string' ||
      typeof DoubanProxy !== 'string' ||
      typeof DisableYellowFilter !== 'boolean'
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }
    if (
      SiteName.length > 100 ||
      Announcement.length > 5000 ||
      SearchDownstreamMaxPage < 1 ||
      SearchDownstreamMaxPage > 10 ||
      SiteInterfaceCacheTime < 0 ||
      SiteInterfaceCacheTime > 86400 ||
      ImageProxy.length > 2048 ||
      DoubanProxy.length > 2048
    ) {
      return NextResponse.json({ error: '参数超出允许范围' }, { status: 400 });
    }
    const isSafeProxyPath = (value: string) =>
      value === '' ||
      (value.startsWith('/api/') &&
        !value.startsWith('//') &&
        !value.includes('\\'));
    if (!isSafeProxyPath(ImageProxy) || !isSafeProxyPath(DoubanProxy)) {
      return NextResponse.json(
        { error: '代理地址仅允许使用本站 /api/ 路径' },
        { status: 400 }
      );
    }

    const adminConfig = await getConfig();
    const storage = getStorage();

    // 权限校验
    if (username !== process.env.USERNAME) {
      // 管理员
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 更新缓存中的站点设置
    adminConfig.SiteConfig = {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      ImageProxy,
      DoubanProxy,
      DisableYellowFilter,
    };

    // 写入数据库
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store', // 不缓存结果
        },
      }
    );
  } catch (error) {
    if (error instanceof AdminConfigConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('更新站点配置失败:', error);
    return NextResponse.json(
      {
        error: '更新站点配置失败',
      },
      { status: 500 }
    );
  }
}
