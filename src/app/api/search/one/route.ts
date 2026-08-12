import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  checkRateLimits,
  createRateLimitKeys,
  recordRateLimitAttempts,
  SEARCH_RATE_LIMIT,
} from '@/lib/auth-rate-limit';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { relayMediaUrls } from '@/lib/media-relay';
import { getSessionSecret } from '@/lib/session';
import { yellowWords } from '@/lib/yellow';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const resourceId = searchParams.get('resourceId');

  if (
    (query && query.length > 100) ||
    (resourceId && !/^[A-Za-z0-9_-]{1,64}$/.test(resourceId))
  ) {
    return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
  }

  if (!query || !resourceId) {
    return NextResponse.json(
      { result: null, error: '缺少必要参数: q 或 resourceId' },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'CDN-Cache-Control': 'no-store',
          Vary: 'Cookie',
        },
      }
    );
  }

  const authInfo = await getAuthInfoFromCookie(request);
  if (!authInfo) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rateLimitKeys = await createRateLimitKeys(
    request,
    'search-one',
    authInfo.username || authInfo.role
  );
  const rateLimit = await checkRateLimits(rateLimitKeys, SEARCH_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: '搜索过于频繁，请稍后再试' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }
  await recordRateLimitAttempts(rateLimitKeys, SEARCH_RATE_LIMIT);

  const config = await getConfig();
  const apiSites = await getAvailableApiSites();

  try {
    // 根据 resourceId 查找对应的 API 站点
    const targetSite = apiSites.find((site) => site.key === resourceId);
    if (!targetSite) {
      return NextResponse.json(
        {
          error: `未找到指定的视频源: ${resourceId}`,
          result: null,
        },
        { status: 404 }
      );
    }

    const results = await searchFromApi(targetSite, query, {
      maxPages: Math.min(
        5,
        Math.max(1, Number(config.SiteConfig.SearchDownstreamMaxPage) || 1)
      ),
      maxResults: 50,
    });
    let result = results.filter((r) => r.title === query);
    if (!config.SiteConfig.DisableYellowFilter) {
      result = result.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    if (result.length === 0) {
      return NextResponse.json(
        {
          error: '未找到结果',
          result: null,
        },
        { status: 404 }
      );
    } else {
      const secret = getSessionSecret();
      if (!secret) throw new Error('服务器未配置会话密钥');
      const safeResults = await Promise.all(
        result.slice(0, 5).map(async (item) => ({
          ...item,
          episodes: await relayMediaUrls(item.episodes, secret),
        }))
      );
      return NextResponse.json(
        { results: safeResults },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            'CDN-Cache-Control': 'no-store',
            Vary: 'Cookie',
          },
        }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: '搜索失败',
        result: null,
      },
      { status: 500 }
    );
  }
}
