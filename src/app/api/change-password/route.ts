/* eslint-disable no-console*/

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfigConflictError } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';
import {
  isSafePassword,
  readLimitedJson,
  RequestValidationError,
} from '@/lib/request-security';
import { IStorage } from '@/lib/types';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  // 不支持 localstorage 模式
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储模式修改密码',
      },
      { status: 400 }
    );
  }

  try {
    const body = await readLimitedJson<{ newPassword?: unknown }>(request);
    const { newPassword } = body;

    // 获取认证信息
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 验证新密码
    if (!isSafePassword(newPassword)) {
      return NextResponse.json(
        { error: '新密码长度须为 10-128 位' },
        { status: 400 }
      );
    }

    const username = authInfo.username;

    // 不允许站长修改密码（站长用户名等于 process.env.USERNAME）
    if (username === process.env.USERNAME) {
      return NextResponse.json(
        { error: '站长不能通过此接口修改密码' },
        { status: 403 }
      );
    }

    // 获取存储实例
    const storage: IStorage | null = getStorage();
    if (!storage || typeof storage.changePassword !== 'function') {
      return NextResponse.json(
        { error: '存储服务不支持修改密码' },
        { status: 500 }
      );
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find(
      (entry) => entry.username === username
    );
    const previousInvalidBefore = user?.authInvalidBefore;
    if (user) {
      user.authInvalidBefore = Date.now();
      await storage.setAdminConfig(config);
    }
    try {
      await storage.changePassword(username, newPassword);
    } catch (error) {
      if (user) {
        user.authInvalidBefore = previousInvalidBefore;
        await storage.setAdminConfig(config);
      }
      throw error;
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete('auth');
    return response;
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof AdminConfigConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('修改密码失败:', error);
    return NextResponse.json(
      {
        error: '修改密码失败',
      },
      { status: 500 }
    );
  }
}
