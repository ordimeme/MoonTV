import { NextRequest, NextResponse } from 'next/server';

import { mapWithConcurrency } from '@/lib/async-utils';
import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  checkRateLimits,
  createRateLimitKeys,
  recordRateLimitAttempts,
  SEARCH_RATE_LIMIT,
} from '@/lib/auth-rate-limit';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { createLightweightSearchResult } from '@/lib/media-match';
import { yellowWords } from '@/lib/yellow';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (query && query.length > 100) {
    return NextResponse.json({ error: '搜索词过长' }, { status: 400 });
  }

  if (!query) {
    await getCacheTime();
    return NextResponse.json(
      { results: [] },
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
    'search',
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
    // 普通搜索只取每个源的第一页，并限制同时请求的源数量。20 个源从
    // 最坏约 100 个上游请求降为最多 20 个、同时不超过 4 个。
    const results = await mapWithConcurrency(apiSites, 4, (site) =>
      searchFromApi(site, query, {
        includeDescriptions: false,
        maxPages: 1,
        maxResults: 25,
        timeoutMs: 3_000,
      })
    );
    let flattenedResults = results.flat();
    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    flattenedResults = flattenedResults
      .slice(0, 250)
      .map(createLightweightSearchResult);
    await getCacheTime();

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'CDN-Cache-Control': 'no-store',
          Vary: 'Cookie',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
