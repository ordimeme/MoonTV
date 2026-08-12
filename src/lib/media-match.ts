import { SearchResult } from './types';

export type MediaSearchType = 'movie' | 'tv' | '';

export function createLightweightSearchResult(
  result: SearchResult
): SearchResult {
  return {
    ...result,
    // 搜索列表只需要集数，真正选中播放源后再生成安全播放短链。
    episodes: result.episodes.map(() => ''),
    // 播放简介由详情接口按需返回，避免聚合搜索响应携带大量正文。
    desc: '',
  };
}

export function normalizeMediaTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function inferMediaType(result: SearchResult): MediaSearchType {
  const label = `${result.type_name || ''} ${result.class || ''}`;
  if (/综艺|电视剧|连续剧|动漫|动画|纪录片|短剧|剧集/i.test(label)) {
    return 'tv';
  }
  if (/电影|动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片/i.test(label)) {
    return 'movie';
  }
  return '';
}

function scoreResult(
  result: SearchResult,
  requestedTitle: string,
  requestedYear: string,
  requestedType: MediaSearchType
): number {
  if (!result.episodes?.length) return -1;
  const expected = normalizeMediaTitle(requestedTitle);
  const actual = normalizeMediaTitle(result.title);
  if (!expected || !actual) return -1;

  let score = -1;
  if (actual === expected) {
    score = 100;
  } else if (
    Math.min(actual.length, expected.length) >= 3 &&
    (actual.includes(expected) || expected.includes(actual))
  ) {
    score = 72 - Math.abs(actual.length - expected.length);
  }
  if (score < 0) return score;

  const expectedYear = requestedYear.match(/\d{4}/)?.[0];
  const actualYear = result.year?.match(/\d{4}/)?.[0];
  if (expectedYear && actualYear) {
    score += expectedYear === actualYear ? 15 : -8;
  }

  const actualType = inferMediaType(result);
  if (requestedType && actualType) {
    score += requestedType === actualType ? 8 : -4;
  }
  return score;
}

export function matchPlayableSources(
  results: SearchResult[],
  requestedTitle: string,
  requestedYear = '',
  requestedType: MediaSearchType = ''
): SearchResult[] {
  return results
    .map((result, index) => ({
      result,
      index,
      score: scoreResult(result, requestedTitle, requestedYear, requestedType),
    }))
    .filter(({ score }) => score >= 60)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ result }) => result);
}
