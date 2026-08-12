/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseMediaIdentity } from '@/lib/media-identity';
import { readLimitedJson } from '@/lib/request-security';
import { PRIVATE_DATA_HEADERS } from '@/lib/response-security';
import { SkipConfig } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const id = searchParams.get('id');

    if (source && id) {
      // 获取单个配置
      const config = await db.getSkipConfig(authInfo.username, source, id);
      return NextResponse.json(config, { headers: PRIVATE_DATA_HEADERS });
    } else {
      // 获取所有配置
      const configs = await db.getAllSkipConfigs(authInfo.username);
      return NextResponse.json(configs, { headers: PRIVATE_DATA_HEADERS });
    }
  } catch (error) {
    console.error('获取跳过片头片尾配置失败:', error);
    return NextResponse.json(
      { error: '获取跳过片头片尾配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await readLimitedJson<Record<string, any>>(request);
    const { config } = body;
    const identity = parseMediaIdentity(body);

    if (!identity || !config) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证配置格式
    const skipConfig: SkipConfig = {
      enable: Boolean(config.enable),
      intro_time: Number(config.intro_time) || 0,
      outro_time: Number(config.outro_time) || 0,
    };

    await db.setSkipConfig(
      authInfo.username,
      identity.source,
      identity.id,
      skipConfig
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存跳过片头片尾配置失败:', error);
    return NextResponse.json(
      { error: '保存跳过片头片尾配置失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const identity = parseMediaIdentity({
      source: searchParams.get('source'),
      id: searchParams.get('id'),
      key: searchParams.get('key'),
    });

    if (!identity) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    await db.deleteSkipConfig(authInfo.username, identity.source, identity.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除跳过片头片尾配置失败:', error);
    return NextResponse.json(
      { error: '删除跳过片头片尾配置失败' },
      { status: 500 }
    );
  }
}
