import { AdminConfig } from './admin.types';

export type DeleteSourceResult = 'deleted' | 'not_found' | 'owner_required';

export type SourceEnableResult = 'updated' | 'owner_required';

export function setSourceEnabled(
  source: AdminConfig['SourceConfig'][number],
  enabled: boolean,
  isOwner: boolean
): SourceEnableResult {
  // 管理员可以在发现异常时立即停用；只有站长能作出最终启用决定。
  if (enabled && !isOwner) return 'owner_required';
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

  const source = sources[index];
  if (source.from === 'config') {
    if (!isOwner) return 'owner_required';
    source.deleted = true;
    source.disabled = true;
  } else {
    sources.splice(index, 1);
  }
  return 'deleted';
}
