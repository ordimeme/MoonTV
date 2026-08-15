/** @jest-environment node */

import {
  createPlaybackSourceKey,
  findNextPlaybackSource,
  isSamePlaybackMedia,
  MAX_AUTOMATIC_SOURCE_SWITCHES,
  planNextPlaybackSourceSwitch,
} from '../playback-failover';
import { SearchResult } from '../types';

function source(
  sourceName: string,
  id: string,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    id,
    title: '测试影片',
    poster: '',
    episodes: ['https://media.example.com/index.m3u8'],
    source: sourceName,
    source_name: `${sourceName}资源`,
    year: '2026',
    ...overrides,
  };
}

describe('playback source failover', () => {
  it('selects the first source that has not already failed', () => {
    const attempted = new Set([
      createPlaybackSourceKey('first', '1'),
      createPlaybackSourceKey('second', '2'),
    ]);

    expect(
      findNextPlaybackSource(
        [source('first', '1'), source('second', '2'), source('third', '3')],
        attempted,
        { title: '测试影片', year: '2026' }
      )?.source
    ).toBe('third');
  });

  it('does not bounce back to a source that already failed', () => {
    const attempted = new Set([
      createPlaybackSourceKey('first', '1'),
      createPlaybackSourceKey('second', '2'),
    ]);

    expect(
      findNextPlaybackSource(
        [source('second', '2'), source('first', '1')],
        attempted,
        { title: '测试影片', year: '2026' }
      )
    ).toBeNull();
  });

  it('rejects a similar title or a different year during automatic switching', () => {
    expect(
      isSamePlaybackMedia(source('old', '1', { year: '2025' }), {
        title: '测试影片',
        year: '2026',
      })
    ).toBe(false);
    expect(
      isSamePlaybackMedia(source('similar', '2', { title: '寻找测试影片' }), {
        title: '测试影片',
        year: '2026',
      })
    ).toBe(false);
    expect(
      isSamePlaybackMedia(source('suffix', '3', { title: '测试影片2026' }), {
        title: '测试影片',
        year: '2026',
      })
    ).toBe(true);
  });

  it('keeps automatic switching strictly bounded', () => {
    expect(MAX_AUTOMATIC_SOURCE_SWITCHES).toBe(3);

    const sources = [
      source('first', '1'),
      source('second', '2'),
      source('third', '3'),
      source('fourth', '4'),
      source('fifth', '5'),
    ];
    const attempted = new Set([createPlaybackSourceKey('first', '1')]);
    let switchCount = 0;
    const selected: string[] = [];

    const identity = { title: '测试影片', year: '2026' };
    let plan = planNextPlaybackSourceSwitch(
      sources,
      attempted,
      switchCount,
      identity
    );
    while (plan) {
      selected.push(plan.source.source);
      attempted.add(
        createPlaybackSourceKey(plan.source.source, plan.source.id)
      );
      switchCount = plan.switchCount;
      plan = planNextPlaybackSourceSwitch(
        sources,
        attempted,
        switchCount,
        identity
      );
    }

    expect(selected).toEqual(['second', 'third', 'fourth']);
    expect(switchCount).toBe(3);
  });
});
