import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DoubanItem, DoubanResult } from '@/lib/types';
import { readJsonResponseLimited } from '@/lib/upstream-security';

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

interface DoubanListApiResponse {
  subjects: Array<{
    id: string;
    title: string;
    cover?: string;
    rate?: string;
  }>;
}

async function fetchDoubanData<T>(url: string): Promise<T> {
  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 设置请求选项，包括信号和头部
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://movie.douban.com',
    },
  };

  try {
    // 尝试直接访问豆瓣API
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await readJsonResponseLimited<T>(response, 512 * 1024);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const kind = searchParams.get('kind') || 'movie';
  const category = searchParams.get('category');
  const type = searchParams.get('type');
  const pageLimit = parseInt(searchParams.get('limit') || '20');
  const pageStart = parseInt(searchParams.get('start') || '0');

  // 验证参数
  if (!kind || !category || !type) {
    return NextResponse.json(
      { error: '缺少必要参数: kind 或 category 或 type' },
      { status: 400 }
    );
  }

  if (!['tv', 'movie'].includes(kind)) {
    return NextResponse.json(
      { error: 'kind 参数必须是 tv 或 movie' },
      { status: 400 }
    );
  }

  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    return NextResponse.json(
      { error: 'pageSize 必须在 1-100 之间' },
      { status: 400 }
    );
  }

  if (!Number.isInteger(pageStart) || pageStart < 0) {
    return NextResponse.json(
      { error: 'pageStart 不能小于 0' },
      { status: 400 }
    );
  }

  if (category.length > 64 || type.length > 64) {
    return NextResponse.json({ error: '分类参数过长' }, { status: 400 });
  }

  const categoryParams = new URLSearchParams({
    start: String(pageStart),
    limit: String(pageLimit),
    category,
    type,
  });
  const target = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?${categoryParams}`;

  try {
    // 调用豆瓣 API
    let list: DoubanItem[] = [];
    try {
      const doubanData = await fetchDoubanData<DoubanCategoryApiResponse>(
        target
      );
      list = (doubanData.items || []).map((item) => ({
        id: item.id,
        title: item.title,
        poster: item.pic?.normal || item.pic?.large || '',
        rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
        year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
      }));
      if (list.length === 0) throw new Error('豆瓣热门接口返回空列表');
    } catch {
      const fallbackTag = category === 'show' ? '综艺' : '热门';
      const fallbackParams = new URLSearchParams({
        type: kind,
        tag: fallbackTag,
        sort: 'recommend',
        page_limit: String(pageLimit),
        page_start: String(pageStart),
      });
      const fallbackData = await fetchDoubanData<DoubanListApiResponse>(
        `https://movie.douban.com/j/search_subjects?${fallbackParams}`
      );
      list = (fallbackData.subjects || []).map((item) => ({
        id: item.id,
        title: item.title,
        poster: item.cover || '',
        rate: item.rate || '',
        year: '',
      }));
    }

    if (list.length === 0) throw new Error('豆瓣接口返回空列表');

    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    const cacheTime = await getCacheTime();
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch {
    return NextResponse.json({ error: '获取豆瓣数据失败' }, { status: 500 });
  }
}
