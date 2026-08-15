import { normalizeMediaTitle } from './media-match';
import { SearchResult } from './types';

export const MAX_AUTOMATIC_SOURCE_SWITCHES = 3;

export interface PlaybackSourceSwitchPlan {
  source: SearchResult;
  switchCount: number;
}

export interface PlaybackMediaIdentity {
  title: string;
  year?: string;
}

export function createPlaybackSourceKey(source: string, id: string): string {
  return `${source}::${id}`;
}

function extractYear(value = ''): string {
  return value.match(/\d{4}/)?.[0] || '';
}

function normalizeIdentityTitle(value: string): string {
  return normalizeMediaTitle(value).replace(/\d{4}$/u, '');
}

export function isSamePlaybackMedia(
  source: SearchResult,
  identity: PlaybackMediaIdentity
): boolean {
  const expectedTitle = normalizeIdentityTitle(identity.title);
  const actualTitle = normalizeIdentityTitle(source.title);
  if (!expectedTitle || actualTitle !== expectedTitle) return false;

  const expectedYear = extractYear(identity.year);
  const actualYear = extractYear(source.year);
  return !expectedYear || !actualYear || expectedYear === actualYear;
}

export function findNextPlaybackSource(
  sources: SearchResult[],
  attemptedSourceKeys: ReadonlySet<string>,
  identity: PlaybackMediaIdentity
): SearchResult | null {
  return (
    sources.find(
      (source) =>
        isSamePlaybackMedia(source, identity) &&
        !attemptedSourceKeys.has(
          createPlaybackSourceKey(source.source, source.id)
        )
    ) || null
  );
}

export function planNextPlaybackSourceSwitch(
  sources: SearchResult[],
  attemptedSourceKeys: ReadonlySet<string>,
  switchCount: number,
  identity: PlaybackMediaIdentity
): PlaybackSourceSwitchPlan | null {
  if (switchCount >= MAX_AUTOMATIC_SOURCE_SWITCHES) return null;
  const source = findNextPlaybackSource(sources, attemptedSourceKeys, identity);
  return source ? { source, switchCount: switchCount + 1 } : null;
}
