const DISCONTINUITY = '#EXT-X-DISCONTINUITY';
const SHORT_BREAK_SECONDS = 30;
const LONG_CONTENT_SECONDS = 120;
const MAX_SAFE_GROUPS = 50;

function groupDuration(group: string[]): number {
  return group.reduce((total, line) => {
    if (!line.startsWith('#EXTINF:')) return total;
    const duration = Number.parseFloat(line.slice('#EXTINF:'.length));
    return total + (Number.isFinite(duration) ? duration : 0);
  }, 0);
}

function hasMedia(group: string[]): boolean {
  return group.some((line) => line.length > 0 && !line.startsWith('#'));
}

function retainedPlaylistMetadata(group: string[]): string[] {
  return group.filter((line) =>
    /^(#EXTM3U|#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE|PLAYLIST-TYPE|INDEPENDENT-SEGMENTS|START|ENDLIST))(?::|$)/.test(
      line
    )
  );
}

/**
 * 仅移除被 discontinuity 明确隔开的短插播组。
 * 高频断点清单不处理，避免把正常分片误判为广告。
 */
export function filterInterstitialAdsFromM3U8(content: string): string {
  if (!content.includes('#EXTM3U') || !content.includes(DISCONTINUITY)) {
    return content;
  }

  const groups: string[][] = [[]];
  content.split(/\r?\n/).forEach((line) => {
    if (line.trim() === DISCONTINUITY) {
      groups.push([]);
      return;
    }
    groups[groups.length - 1].push(line);
  });

  const mediaGroups = groups.filter(hasMedia);
  if (mediaGroups.length < 3 || mediaGroups.length > MAX_SAFE_GROUPS) {
    return content;
  }

  const longGroups = mediaGroups.filter(
    (group) => groupDuration(group) >= LONG_CONTENT_SECONDS
  );
  if (longGroups.length < 2) return content;

  const filtered = groups.map((group) => {
    if (!hasMedia(group)) return group;
    const duration = groupDuration(group);
    if (duration <= 0 || duration > SHORT_BREAK_SECONDS) return group;
    return retainedPlaylistMetadata(group);
  });

  if (filtered.every((group, index) => group.length === groups[index].length)) {
    return content;
  }
  return filtered
    .filter((group) => group.length > 0)
    .map((group) => group.join('\n'))
    .join(`\n${DISCONTINUITY}\n`);
}
