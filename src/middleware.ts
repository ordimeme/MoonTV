/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { isSameOriginMutation } from '@/lib/request-security';
import { buildContentSecurityPolicy } from '@/lib/security';
import { getSessionSecret } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') && !isSameOriginMutation(request)) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: 'Cross-site request blocked' },
        { status: 403 }
      )
    );
  }

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!getSessionSecret()) {
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return withSecurityHeaders(NextResponse.redirect(warningUrl));
  }

  const session = await getAuthInfoFromCookie(request);
  if (!session) {
    return handleAuthFailure(request, pathname);
  }
  return withSecurityHeaders(NextResponse.next());
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    'Content-Security-Policy',
    buildContentSecurityPolicy(process.env.NODE_ENV === 'development')
  );
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return response;
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return withSecurityHeaders(
      new NextResponse('Unauthorized', { status: 401 })
    );
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return withSecurityHeaders(NextResponse.redirect(loginUrl));
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const publicPaths = [
    '/login',
    '/warning',
    '/api/login',
    '/api/register',
    '/api/logout',
    '/api/server-config',
  ];
  if (publicPaths.includes(pathname)) return true;

  const publicPrefixes = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/sw.js',
    '/workbox-',
    '/worker-',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];

  return publicPrefixes.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
