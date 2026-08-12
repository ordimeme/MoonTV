/** @jest-environment node */

import {
  isSourceEnabledForRuntime,
  setSourceEnabled,
} from '../source-management';

describe('owner-managed video sources', () => {
  const makeSource = () => ({
    key: 'custom',
    name: 'Custom',
    api: 'https://example.com/api.php/provide/vod/',
    from: 'custom' as const,
    disabled: true,
  });

  it('does not let a non-owner enable or disable a source', () => {
    const source = makeSource();
    expect(setSourceEnabled(source, true, false)).toBe('owner_required');
    expect(source.disabled).toBe(true);
    source.disabled = false;
    expect(setSourceEnabled(source, false, false)).toBe('owner_required');
    expect(source.disabled).toBe(false);
  });

  it('lets the owner enable and disable a source', () => {
    const source = makeSource();
    expect(setSourceEnabled(source, true, true)).toBe('updated');
    expect(source.disabled).toBe(false);
    expect(isSourceEnabledForRuntime(source)).toBe(true);
    expect(setSourceEnabled(source, false, true)).toBe('updated');
    expect(source.disabled).toBe(true);
  });

  it('still blocks unsafe upstream addresses regardless of owner choice', () => {
    const source = makeSource();
    source.disabled = false;
    source.api = 'http://127.0.0.1/private';
    expect(isSourceEnabledForRuntime(source)).toBe(false);
  });
});
