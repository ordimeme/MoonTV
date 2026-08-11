/** @jest-environment node */

import { isSourceAuditFresh } from '../source-audit';
import { setSourceEnabled } from '../source-management';

describe('source audit expiry', () => {
  it('expires stale or future audit snapshots', () => {
    const now = Date.parse('2026-08-11T12:00:00Z');
    expect(isSourceAuditFresh('2026-08-11', now)).toBe(true);
    expect(isSourceAuditFresh('2026-06-01', now)).toBe(false);
    expect(isSourceAuditFresh('2026-08-12', now)).toBe(false);
    expect(isSourceAuditFresh(undefined, now)).toBe(false);
  });
});

describe('source owner decision', () => {
  const makeSource = () => ({
    key: 'custom',
    name: 'Custom',
    api: 'https://example.com/api.php/provide/vod/',
    from: 'custom' as const,
    disabled: true,
    auditStatus: 'blocked' as const,
  });

  it('allows an admin to disable but not enable a source', () => {
    const source = makeSource();
    expect(setSourceEnabled(source, true, false)).toBe('owner_required');
    expect(source.disabled).toBe(true);
    source.disabled = false;
    expect(setSourceEnabled(source, false, false)).toBe('updated');
    expect(source.disabled).toBe(true);
  });

  it('lets the owner make the final decision despite automated advice', () => {
    const source = makeSource();
    expect(setSourceEnabled(source, true, true)).toBe('updated');
    expect(source.disabled).toBe(false);
  });
});
