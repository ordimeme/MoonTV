/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启图片代理，则不使用代理
  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return isSafeLocalProxyPath(localImageProxy)
      ? localImageProxy.trim()
      : null;
  }

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return isSafeLocalProxyPath(serverImageProxy)
    ? serverImageProxy.trim()
    : null;
}

function isSafeLocalProxyPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  return (
    path.startsWith('/api/') && !path.startsWith('//') && !path.includes('\\')
  );
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;

  if (proxyUrl.includes('/api/image-proxy')) {
    try {
      const hostname = new URL(originalUrl).hostname.toLowerCase();
      if (
        !['douban.com', 'doubanio.com'].some(
          (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
        )
      ) {
        return originalUrl;
      }
    } catch {
      return originalUrl;
    }
  }

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启豆瓣代理，则不使用代理
  const enableDoubanProxy = localStorage.getItem('enableDoubanProxy');
  if (enableDoubanProxy !== null) {
    if (!JSON.parse(enableDoubanProxy) as boolean) {
      return null;
    }
  }

  const localDoubanProxy = localStorage.getItem('doubanProxyUrl');
  if (localDoubanProxy != null) {
    return isSafeLocalProxyPath(localDoubanProxy)
      ? localDoubanProxy.trim()
      : null;
  }

  // 如果未设置，则使用全局对象
  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return isSafeLocalProxyPath(serverDoubanProxy)
    ? serverDoubanProxy.trim()
    : null;
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string; // 如720p、1080p等
  loadSpeed: string; // 自动转换为KB/s或MB/s
  pingTime: number; // 网络延迟（毫秒）
}> {
  if (!m3u8Url.startsWith('/api/media?')) {
    throw new Error('只允许测量站内安全视频地址');
  }

  const pingStart = performance.now();
  const pingResponse = await fetch(m3u8Url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/vnd.apple.mpegurl' },
  });
  const pingTime = performance.now() - pingStart;
  if (!pingResponse.ok) throw new Error('播放清单不可用');
  await pingResponse.body?.cancel();

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    const hls = new Hls();
    const samples: number[] = [];
    let hasMetadata = false;
    let completed = false;

    const cleanup = () => {
      hls.destroy();
      video.remove();
    };
    const finish = () => {
      if (completed || !hasMetadata || samples.length < 2) return;
      completed = true;
      clearTimeout(timeout);
      const sorted = [...samples].sort((a, b) => a - b);
      const medianKBps = sorted[Math.floor(sorted.length / 2)];
      const loadSpeed =
        medianKBps >= 1024
          ? `${(medianKBps / 1024).toFixed(1)} MB/s`
          : `${medianKBps.toFixed(1)} KB/s`;
      const width = video.videoWidth;
      const quality =
        width >= 3840
          ? '4K'
          : width >= 2560
          ? '2K'
          : width >= 1920
          ? '1080p'
          : width >= 1280
          ? '720p'
          : width >= 854
          ? '480p'
          : width > 0
          ? 'SD'
          : '未知';
      cleanup();
      resolve({ quality, loadSpeed, pingTime: Math.round(pingTime) });
    };
    const fail = (message: string) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error(message));
    };
    const timeout = setTimeout(() => fail('视频测速超时'), 8000);

    hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
      const start = data.frag.stats.loading.start;
      const end = data.frag.stats.loading.end;
      const elapsedMs = end - start;
      const bytes = data.frag.stats.loaded;
      // 极短的缓存命中会夸大速度，不纳入网络测速。
      if (elapsedMs >= 50 && bytes > 0) {
        samples.push(bytes / 1024 / (elapsedMs / 1000));
        if (samples.length > 3) samples.shift();
        finish();
      }
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) fail(`视频加载失败：${data.type}`);
    });
    video.onloadedmetadata = () => {
      hasMetadata = true;
      finish();
    };
    video.onerror = () => fail('视频元数据加载失败');
    hls.loadSource(m3u8Url);
    hls.attachMedia(video);
  });
}
