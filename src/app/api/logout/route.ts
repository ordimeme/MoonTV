import { NextResponse } from 'next/server';

import { authCookieOptions } from '@/lib/session';

export const runtime = 'edge';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // 清除认证cookie
  response.cookies.set('auth', '', {
    ...authCookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}
