import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const session = await getAuthInfoFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { username: session.username, role: session.role },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
