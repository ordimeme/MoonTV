/**
 * Cloudflare 资源绑定不属于普通 Node 环境变量。OpenNext 运行时必须通过
 * Cloudflare 上下文读取；Node/Jest 环境保留 process.env 兼容回退。
 */
export async function getCloudflareBinding<T>(
  name: string
): Promise<T | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = getCloudflareContext();
    const value = (context.env as unknown as Record<string, unknown>)[name];
    if (value !== undefined) return value as T;
  } catch {
    // 非 Cloudflare 运行时会走兼容回退。
  }
  return (process.env as unknown as Record<string, unknown>)[name] as
    | T
    | undefined;
}
