/** @jest-environment node */

import {
  createLightweightSearchResult,
  matchPlayableSources,
} from '../media-match';
import { SearchResult } from '../types';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: '1',
    title: '换救计划',
    poster: '',
    episodes: ['https://media.example.com/1.m3u8'],
    source: 'test',
    source_name: '测试源',
    year: '2025',
    type_name: '动作片',
    ...overrides,
  };
}

describe('media source matching', () => {
  it('keeps episode counts without returning upstream media URLs', () => {
    const lightweight = createLightweightSearchResult(
      result({
        episodes: [
          'https://media.example.com/one.m3u8',
          'https://media.example.com/two.m3u8',
        ],
      })
    );

    expect(lightweight.episodes).toEqual(['', '']);
  });

  it('keeps an exact title when the source year differs', () => {
    expect(
      matchPlayableSources([result()], '换救计划', '2026', 'movie')
    ).toHaveLength(1);
  });

  it('accepts a common source title suffix and prefers the matching year', () => {
    const matches = matchPlayableSources(
      [
        result({ id: 'old', title: '换救计划国语版', year: '2024' }),
        result({ id: 'new', title: '换救计划', year: '2026' }),
      ],
      '换救计划',
      '2026',
      'movie'
    );
    expect(matches.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('rejects unrelated titles and entries without playable episodes', () => {
    expect(
      matchPlayableSources(
        [result({ title: '完全不同的电影' }), result({ episodes: [] })],
        '换救计划',
        '2026',
        'movie'
      )
    ).toEqual([]);
  });
});
