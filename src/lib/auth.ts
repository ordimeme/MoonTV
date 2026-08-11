import { NextRequest } from 'next/server';

import { AdminConfig } from './admin.types';
import { getCloudflareBinding } from './cloudflare-context';
import {
  getSessionSecret,
  SessionPayload,
  verifySessionToken,
} from './session';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

async function getD1AdminConfig(): Promise<AdminConfig | null> {
  const database = await getCloudflareBinding<D1Database>('DB');
  if (!database) return null;
  const row = await database
    .prepare('SELECT config FROM admin_config WHERE id = 1')
    .first<{ config: string }>();
  if (!row?.config) return null;
  try {
    return JSON.parse(row.config) as AdminConfig;
  } catch {
    return null;
  }
}

async function getUpstashAdminConfig(): Promise<AdminConfig | null> {
  const baseUrl = process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_TOKEN;
  if (!baseUrl || !token) return null;
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/get/${encodeURIComponent('admin:config')}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: unknown };
    const value = payload.result;
    if (!value) return null;
    return typeof value === 'string'
      ? (JSON.parse(value) as AdminConfig)
      : (value as AdminConfig);
  } catch {
    return null;
  }
}

// 从cookie获取认证信息 (服务端使用)
export async function getAuthInfoFromCookie(
  request: NextRequest
): Promise<SessionPayload | null> {
  const authCookie = request.cookies.get('auth');
  const secret = getSessionSecret();
  if (!authCookie || !secret) return null;

  const session = await verifySessionToken(authCookie.value, secret);
  if (!session) return null;

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const expectedMode =
    storageType === 'localstorage' ? 'localstorage' : 'database';
  if (session.mode !== expectedMode) return null;
  if (expectedMode === 'localstorage') return session;
  if (!session.username) return null;

  const ownerUsername = process.env.USERNAME || '';
  if (session.username === ownerUsername) {
    return session.role === 'owner' ? session : null;
  }

  // 会话必须实时复核封禁、角色和密码失效时间。D1 直接读取绑定，
  // Upstash 通过 REST 读取；不具备 Edge 可读状态的存储模式一律失败关闭。
  const config =
    storageType === 'd1'
      ? await getD1AdminConfig()
      : storageType === 'upstash'
      ? await getUpstashAdminConfig()
      : null;
  if (!config) return null;
  const user = config.UserConfig.Users.find(
    (entry) => entry.username === session.username
  );
  if (!user || user.banned || user.role !== session.role) return null;
  if (user.authInvalidBefore && session.issuedAt <= user.authInvalidBefore) {
    return null;
  }
  return session;
}
