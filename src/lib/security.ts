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
    "media-src 'self' blob:",
    `connect-src 'self'${isDevelopment ? ' ws:' : ''}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!isDevelopment) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
