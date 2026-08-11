import { getConfig } from '@/lib/config';
import { serializeForInlineScript } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = await getConfig();
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    ENABLE_REGISTER: config.UserConfig.AllowRegister,
    IMAGE_PROXY: config.SiteConfig.ImageProxy,
    DOUBAN_PROXY: config.SiteConfig.DoubanProxy,
    DISABLE_YELLOW_FILTER: config.SiteConfig.DisableYellowFilter,
    CUSTOM_CATEGORIES: config.CustomCategories.filter(
      (category) => !category.disabled
    ).map((category) => ({
      name: category.name || '',
      type: category.type,
      query: category.query,
    })),
  };

  return new Response(
    `window.RUNTIME_CONFIG=${serializeForInlineScript(runtimeConfig)};`,
    {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
