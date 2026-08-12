import { AdminConfig } from './admin.types';
import { isSafeUpstreamUrl } from './upstream-security';

export type DeleteSourceResult = 'deleted' | 'not_found' | 'owner_required';

export type SourceEnableResult = 'updated' | 'owner_required';

export function isSourceEnabledForRuntime(
  source: AdminConfig['SourceConfig'][number]
): boolean {
  return Boolean(
    !source.disabled &&
      !source.deleted &&
      isSafeUpstreamUrl(source.api) &&
      (!source.detail || isSafeUpstreamUrl(source.detail))
  );
}

export function setSourceEnabled(
  source: AdminConfig['SourceConfig'][number],
  enabled: boolean,
  isOwner: boolean
): SourceEnableResult {
  if (!isOwner) return 'owner_required';
  source.disabled = !enabled;
  return 'updated';
}

export function deleteSourceFromConfig(
  sources: AdminConfig['SourceConfig'],
  key: string,
  isOwner: boolean
): DeleteSourceResult {
  const index = sources.findIndex((source) => source.key === key);
  if (index === -1) return 'not_found';
  if (!isOwner) return 'owner_required';

  const source = sources[index];
  if (source.from === 'config') {
    source.deleted = true;
    source.disabled = true;
  } else {
    sources.splice(index, 1);
  }
  return 'deleted';
}
