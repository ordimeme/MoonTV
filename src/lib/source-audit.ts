export type SourceAuditStatus = 'pending' | 'clean' | 'filterable' | 'blocked';

export interface SourceAuditPolicy {
  status: SourceAuditStatus;
  defaultDisabled: boolean;
  note: string;
}

export const SOURCE_AUDIT_DATE = '2026-08-12';
export const SOURCE_AUDIT_MAX_AGE_DAYS = 30;

export function isSourceAuditFresh(
  auditDate: string | undefined,
  now = Date.now()
): boolean {
  if (!auditDate) return false;
  const timestamp = Date.parse(`${auditDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  const maxAge = SOURCE_AUDIT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return timestamp <= now && now - timestamp <= maxAge;
}

const CLEAN_NOTE = '复审取得可用播放样本，未发现独立插播广告段';
const PENDING_NOTE = '本次复审未取得有效播放样本，需由站长结合连通性决定';

const SOURCE_AUDIT_POLICIES: Record<string, SourceAuditPolicy> = {
  dyttzy: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  ruyi: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  zy360: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  maotaizy: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  jisu: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  dbzy: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  mdzy: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  zuid: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  yinghua: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  wujin: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  ikun: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  bfzy: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  ffzy: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  heimuer: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  mozhua: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  xiaomaomi: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  tyyszy: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  wolong: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  wwzy: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
  lzi: {
    status: 'pending',
    defaultDisabled: true,
    note: PENDING_NOTE,
  },
};

export function getSourceAuditPolicy(
  key: string
): SourceAuditPolicy | undefined {
  return SOURCE_AUDIT_POLICIES[key];
}
