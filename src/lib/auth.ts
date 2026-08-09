import { NextRequest } from 'next/server';

import { parseSessionToken, SessionPayload } from './session';

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(
  request: NextRequest
): SessionPayload | null {
  const authCookie = request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    return parseSessionToken(authCookie.value);
  } catch {
    return null;
  }
}
