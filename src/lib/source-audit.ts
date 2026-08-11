export type SourceAuditStatus = 'clean' | 'filterable' | 'blocked';

export interface SourceAuditPolicy {
  status: SourceAuditStatus;
  defaultDisabled: boolean;
  note: string;
}

export const SOURCE_AUDIT_DATE = '2026-08-11';
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

const FILTERABLE_NOTE = '检测到可识别的短插播段，已启用清单级过滤';
const CLEAN_NOTE = '抽样播放清单未发现独立插播广告段';

const SOURCE_AUDIT_POLICIES: Record<string, SourceAuditPolicy> = {
  dyttzy: {
    status: 'filterable',
    defaultDisabled: false,
    note: FILTERABLE_NOTE,
  },
  zy360: {
    status: 'filterable',
    defaultDisabled: false,
    note: FILTERABLE_NOTE,
  },
  mdzy: { status: 'filterable', defaultDisabled: false, note: FILTERABLE_NOTE },
  ikun: { status: 'filterable', defaultDisabled: false, note: FILTERABLE_NOTE },
  jisu: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  wujin: { status: 'clean', defaultDisabled: false, note: CLEAN_NOTE },
  ruyi: {
    status: 'blocked',
    defaultDisabled: true,
    note: '播放清单存在高频断点，无法可靠区分正片和广告',
  },
  zuid: {
    status: 'blocked',
    defaultDisabled: true,
    note: '播放清单存在高频断点，无法可靠区分正片和广告',
  },
  bfzy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '播放清单连接异常，无法完成广告审计',
  },
  ffzy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '播放清单连接异常，无法完成广告审计',
  },
  heimuer: {
    status: 'blocked',
    defaultDisabled: true,
    note: '视频源 TLS 连接异常，无法完成广告审计',
  },
  mozhua: {
    status: 'blocked',
    defaultDisabled: true,
    note: '视频源 TLS 连接异常，无法完成广告审计',
  },
  xiaomaomi: {
    status: 'blocked',
    defaultDisabled: true,
    note: '视频源证书异常，无法安全完成广告审计',
  },
  tyyszy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '抽样查询无有效结果，暂时禁用',
  },
  maotaizy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '抽样查询无有效结果，暂时禁用',
  },
  wolong: {
    status: 'blocked',
    defaultDisabled: true,
    note: '抽样响应格式异常，无法完成广告审计',
  },
  dbzy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '抽样查询无有效结果，暂时禁用',
  },
  yinghua: {
    status: 'blocked',
    defaultDisabled: true,
    note: '视频源连接异常，无法完成广告审计',
  },
  wwzy: {
    status: 'blocked',
    defaultDisabled: true,
    note: '专用短剧源无法用统一样本完成广告审计',
  },
  lzi: {
    status: 'blocked',
    defaultDisabled: true,
    note: '视频源连接异常，无法完成广告审计',
  },
};

export function getSourceAuditPolicy(
  key: string
): SourceAuditPolicy | undefined {
  return SOURCE_AUDIT_POLICIES[key];
}
