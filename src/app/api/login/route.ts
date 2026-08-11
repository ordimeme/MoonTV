/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import {
  checkRateLimits,
  clearRateLimits,
  createRateLimitKeys,
  LOGIN_RATE_LIMIT,
  recordRateLimitAttempts,
} from '@/lib/auth-rate-limit';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  readLimitedJson,
  RequestValidationError,
} from '@/lib/request-security';
import {
  type SessionRole,
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

async function setSessionCookie(
  response: NextResponse,
  role: SessionRole,
  username?: string
) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  response.cookies.set(
    'auth',
    await createSessionToken(secret, {
      username,
      role,
      mode: STORAGE_TYPE === 'localstorage' ? 'localstorage' : 'database',
    }),
    authCookieOptions
  );
}

export async function POST(req: NextRequest) {
  let rateLimitKeys: string[] = [];
  try {
    const body = await readLimitedJson<{
      username?: unknown;
      password?: unknown;
    }>(req);
    const identity = typeof body.username === 'string' ? body.username : '';
    rateLimitKeys = await createRateLimitKeys(req, 'login', identity);
    const rateLimit = await checkRateLimits(rateLimitKeys, LOGIN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '尝试次数过多，请稍后再试' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    // 本地 / localStorage 模式——仅校验固定密码
    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      // 未配置 PASSWORD 时直接放行
      if (!envPassword) {
        const response = NextResponse.json({ ok: true });

        // 清除可能存在的认证cookie
        response.cookies.set('auth', '', {
          ...authCookieOptions,
          expires: new Date(0),
          maxAge: 0,
        });

        return response;
      }

      const { password } = body;
      if (typeof password !== 'string') {
        return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
      }

      if (password !== envPassword) {
        await recordRateLimitAttempts(rateLimitKeys, LOGIN_RATE_LIMIT);
        return NextResponse.json(
          { ok: false, error: '密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      await setSessionCookie(response, 'user');
      await clearRateLimits(rateLimitKeys);

      return response;
    }

    // 数据库 / redis 模式——校验用户名并尝试连接数据库
    const { username, password } = body;

    if (!username || typeof username !== 'string' || username.length > 64) {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length > 128) {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 可能是站长，直接读环境变量
    if (
      username === process.env.USERNAME &&
      password === process.env.PASSWORD
    ) {
      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      await setSessionCookie(response, 'owner', username);
      await clearRateLimits(rateLimitKeys);

      return response;
    } else if (username === process.env.USERNAME) {
      await recordRateLimitAttempts(rateLimitKeys, LOGIN_RATE_LIMIT);
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    if (user && user.banned) {
      await recordRateLimitAttempts(rateLimitKeys, LOGIN_RATE_LIMIT);
      return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
    }

    // 校验用户密码
    try {
      const pass = await db.verifyUser(username, password);
      if (!pass) {
        await recordRateLimitAttempts(rateLimitKeys, LOGIN_RATE_LIMIT);
        return NextResponse.json(
          { error: '用户名或密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      await setSessionCookie(response, user?.role || 'user', username);
      await clearRateLimits(rateLimitKeys);

      return response;
    } catch (err) {
      console.error('数据库验证失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
