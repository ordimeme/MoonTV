export function getSafeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const DIRECT_MEDIA_DOMAINS = [
  'adfg8.vip',
  'baofeng11.com',
  'bfikuncdn.com',
  'bvvvvvvv7f.com',
  'fengbao11.com',
  'ffzy-online6.com',
  'ffzy-plays.com',
  'jisuzyv.com',
  'maowushi.com',
  'modujx11.com',
  'modujx16.com',
  'modujx17.com',
  'ppqrrs.com',
  'qwe132456.cc',
  'rrcdnbf6.com',
  'ryiplay18.com',
  'ryiplay19.com',
  'ryplay1.com',
  'zuidazym3u8.com',
] as const;

const DIRECT_MEDIA_PORT_SOURCES = ['https://*.jisuts.com:999'] as const;

export const DIRECT_MEDIA_CSP_SOURCES = [
  ...DIRECT_MEDIA_DOMAINS.map((domain) => `https://*.${domain}`),
  ...DIRECT_MEDIA_PORT_SOURCES,
];

export function isDirectMediaUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return false;
    if (hostname === 'jisuts.com' || hostname.endsWith('.jisuts.com')) {
      return url.port === '999';
    }
    return DIRECT_MEDIA_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function buildContentSecurityPolicy(
  isDevelopment: boolean,
  nonce?: string
): string {
  const scriptSources = ["'self'"];
  if (nonce) {
    scriptSources.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  }
  if (isDevelopment) {
    // Next.js React Refresh uses eval in the local development bundle.
    scriptSources.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `media-src 'self' blob: ${DIRECT_MEDIA_CSP_SOURCES.join(' ')}`,
    `connect-src 'self' ${DIRECT_MEDIA_CSP_SOURCES.join(' ')}${
      isDevelopment ? ' ws:' : ''
    }`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!isDevelopment) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
