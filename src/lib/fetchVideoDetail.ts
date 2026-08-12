import { getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

import { getDetailFromApi, searchFromApi } from './downstream';

interface FetchVideoDetailOptions {
  source: string;
  id: string;
  fallbackTitle?: string;
}

/**
 * 根据 source 与 id 获取视频详情。
 * 1. 优先用稳定的 source + id 直接获取详情。
 * 2. 只有详情失败时才用标题搜索兜底，避免定时任务为每条记录翻多页。
 */
export async function fetchVideoDetail({
  source,
  id,
  fallbackTitle = '',
}: FetchVideoDetailOptions): Promise<SearchResult> {
  const apiSites = await getAvailableApiSites();
  const apiSite = apiSites.find((site) => site.key === source);
  if (!apiSite) {
    throw new Error('无效的API来源');
  }
  try {
    return await getDetailFromApi(apiSite, id);
  } catch (detailError) {
    if (!fallbackTitle) throw detailError;
  }

  if (fallbackTitle) {
    try {
      const searchData = await searchFromApi(apiSite, fallbackTitle.trim(), {
        maxPages: 1,
        maxResults: 25,
      });
      const exactMatch = searchData.find(
        (item: SearchResult) =>
          item.source.toString() === source.toString() &&
          item.id.toString() === id.toString()
      );
      if (exactMatch) {
        return exactMatch;
      }
    } catch (error) {
      // do nothing
    }
  }

  throw new Error('获取视频详情失败');
}
