/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { AdminConfigConflictError } from '@/lib/admin.types';
import {
  checkRateLimits,
  clearRateLimits,
  createRateLimitKeys,
  recordRateLimitAttempts,
  REGISTER_RATE_LIMIT,
} from '@/lib/auth-rate-limit';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  isSafePassword,
  isSafeUsername,
  readLimitedJson,
  RequestValidationError,
} from '@/lib/request-security';
import {
  authCookieOptions,
  createSessionToken,
  getSessionSecret,
} from '@/lib/session';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

export async function POST(req: NextRequest) {
  let rateLimitKeys: string[] = [];
  try {
    // localstorage 模式下不支持注册
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { error: '当前模式不支持注册' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    // 校验是否开放注册
    if (!config.UserConfig.AllowRegister) {
      return NextResponse.json({ error: '当前未开放注册' }, { status: 400 });
    }

    const { username, password } = await readLimitedJson<{
      username?: unknown;
      password?: unknown;
    }>(req);
    rateLimitKeys = await createRateLimitKeys(
      req,
      'register',
      typeof username === 'string' ? username : ''
    );
    const rateLimit = await checkRateLimits(rateLimitKeys, REGISTER_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '注册尝试次数过多，请稍后再试' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    if (!isSafeUsername(username)) {
      return NextResponse.json(
        { error: '用户名须为 3-64 位字母、数字、点、横线或下划线' },
        { status: 400 }
      );
    }
    if (!isSafePassword(password)) {
      return NextResponse.json(
        { error: '密码长度须为 10-128 位' },
        { status: 400 }
      );
    }

    // 检查是否和管理员重复
    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '用户已存在' }, { status: 400 });
    }

    try {
      // 检查用户是否已存在
      const exist = await db.checkUserExist(username);
      if (exist) {
        await recordRateLimitAttempts(rateLimitKeys, REGISTER_RATE_LIMIT);
        return NextResponse.json({ error: '用户已存在' }, { status: 400 });
      }

      // 先用带版本号的配置写入占位；用户创建失败时立即补偿回滚，
      // 避免出现用户表与权限配置永久不一致。
      config.UserConfig.Users.push({
        username,
        role: 'user',
      });
      await db.saveAdminConfig(config);
      try {
        await db.registerUser(username, password);
      } catch (error) {
        config.UserConfig.Users = config.UserConfig.Users.filter(
          (entry) => entry.username !== username
        );
        await db.saveAdminConfig(config);
        throw error;
      }

      // 注册成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const secret = getSessionSecret();
      if (!secret) throw new Error('SESSION_SECRET is not configured');
      response.cookies.set(
        'auth',
        await createSessionToken(secret, {
          username,
          role: 'user',
          mode: 'database',
        }),
        authCookieOptions
      );
      await clearRateLimits(rateLimitKeys);

      return response;
    } catch (err) {
      if (err instanceof AdminConfigConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      console.error('数据库注册失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
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
    console.error('注册接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
