import { NextRequest } from 'next/server';

import { AdminConfig } from './admin.types';
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
  const database = (process.env as unknown as { DB?: D1Database }).DB;
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

  // D1 is the Cloudflare production mode. Read it directly here so the Edge
  // middleware does not import Node-only configuration code.
  if (storageType !== 'd1') return session;
  const config = await getD1AdminConfig();
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
