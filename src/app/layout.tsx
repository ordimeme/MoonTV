/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';

import './globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';

import { BRAND_DESCRIPTION } from '@/lib/brand';
import { getConfig } from '@/lib/config';

import { GlobalErrorIndicator } from '../components/GlobalErrorIndicator';
import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });
export const dynamic = 'force-dynamic';

// D1 环境下站点名称来自环境变量，无需为 metadata 重复读取数据库。
export const metadata: Metadata = {
  title: process.env.SITE_NAME || 'MoonTV',
  description: BRAND_DESCRIPTION,
  manifest: '/manifest.json',
  icons: { icon: '/brand-mark.svg' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let siteName = process.env.SITE_NAME || 'MoonTV';
  let announcement =
    process.env.ANNOUNCEMENT ||
    '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
  const config = await getConfig();
  siteName = config.SiteConfig.SiteName;
  announcement = config.SiteConfig.Announcement;
  const nonce = (await headers()).get('x-nonce') || undefined;

  return (
    <html lang='zh-CN' suppressHydrationWarning>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1.0, viewport-fit=cover'
        />
        {/* nonce 在浏览器 DOM 中会被隐藏，跳过该属性的水合比较。 */}
        <Script
          src='/api/runtime-config'
          strategy='beforeInteractive'
          nonce={nonce}
          suppressHydrationWarning
        />
      </head>
      <body
        className={`${inter.className} min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-200`}
      >
        <ThemeProvider>
          <SiteProvider siteName={siteName} announcement={announcement}>
            {children}
            <GlobalErrorIndicator />
          </SiteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
