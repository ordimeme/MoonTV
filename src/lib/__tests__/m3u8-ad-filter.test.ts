import { filterInterstitialAdsFromM3U8 } from '../m3u8-ad-filter';
import { deleteSourceFromConfig } from '../source-management';

describe('M3U8 interstitial filtering', () => {
  it('removes a short discontinuity-bounded break between long content groups', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:100',
      '#EXTINF:150,',
      'content-a.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:15,',
      'interstitial-ad.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:200,',
      'content-b.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const filtered = filterInterstitialAdsFromM3U8(manifest);
    expect(filtered).toContain('content-a.ts');
    expect(filtered).toContain('content-b.ts');
    expect(filtered).not.toContain('interstitial-ad.ts');
  });

  it('does not modify high-frequency discontinuity playlists', () => {
    const groups = Array.from({ length: 60 }, (_, index) =>
      [`#EXTINF:20,`, `segment-${index}.ts`].join('\n')
    );
    const manifest = ['#EXTM3U', ...groups].join('\n#EXT-X-DISCONTINUITY\n');
    expect(filterInterstitialAdsFromM3U8(manifest)).toBe(manifest);
  });

  it('keeps playlist headers when a leading short break is removed', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:200',
      '#EXTINF:10,',
      'pre-roll.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:150,',
      'content-a.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:180,',
      'content-b.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const filtered = filterInterstitialAdsFromM3U8(manifest);
    expect(filtered.startsWith('#EXTM3U')).toBe(true);
    expect(filtered).toContain('#EXT-X-TARGETDURATION:200');
    expect(filtered).not.toContain('pre-roll.ts');
  });

  it('leaves ordinary playlists unchanged', () => {
    const manifest = '#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST';
    expect(filterInterstitialAdsFromM3U8(manifest)).toBe(manifest);
  });
});

describe('source deletion', () => {
  it('allows the owner to tombstone a built-in source', () => {
    const sources = [
      {
        key: 'built-in',
        name: '内置源',
        api: 'https://example.com/vod',
        from: 'config' as const,
      },
    ];
    expect(deleteSourceFromConfig(sources, 'built-in', true)).toBe('deleted');
    expect(sources[0]).toMatchObject({ deleted: true, disabled: true });
  });

  it('keeps all sources protected from non-owner admins', () => {
    const sources = [
      {
        key: 'built-in',
        name: '内置源',
        api: 'https://example.com/vod',
        from: 'config' as const,
      },
    ];
    expect(deleteSourceFromConfig(sources, 'built-in', false)).toBe(
      'owner_required'
    );
    expect(sources[0]).not.toHaveProperty('deleted');
  });

  it('removes custom sources from the list', () => {
    const sources = [
      {
        key: 'custom',
        name: '自定义源',
        api: 'https://example.com/vod',
        from: 'custom' as const,
      },
    ];
    expect(deleteSourceFromConfig(sources, 'custom', true)).toBe('deleted');
    expect(sources).toHaveLength(0);
  });
});
