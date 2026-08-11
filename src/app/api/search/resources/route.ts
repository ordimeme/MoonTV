import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthInfoFromCookie(request);
    if (auth?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const apiSites = await getAvailableApiSites();

    return NextResponse.json(apiSites, {
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        Vary: 'Cookie',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
