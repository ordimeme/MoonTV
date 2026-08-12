/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseMediaIdentity } from '@/lib/media-identity';
import { readLimitedJson } from '@/lib/request-security';
import { PRIVATE_DATA_HEADERS } from '@/lib/response-security';
import { PlayRecord } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const records = await db.getAllPlayRecords(authInfo.username);
    return NextResponse.json(records, {
      status: 200,
      headers: PRIVATE_DATA_HEADERS,
    });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readLimitedJson<{
      key?: string;
      source?: string;
      id?: string;
      record?: PlayRecord;
    }>(request, 32 * 1024);
    const { record } = body;
    const identity = parseMediaIdentity(body);

    if (!identity || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 }
      );
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 }
      );
    }

    const finalRecord = {
      ...record,
      save_time: record.save_time ?? Date.now(),
    } as PlayRecord;

    await db.savePlayRecord(
      authInfo.username,
      identity.source,
      identity.id,
      finalRecord
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const hasIdentity =
      Boolean(key) || searchParams.has('source') || searchParams.has('id');
    const identity = parseMediaIdentity({
      source: searchParams.get('source'),
      id: searchParams.get('id'),
      key,
    });

    if (hasIdentity) {
      // 如果提供了 key，删除单条播放记录
      if (!identity) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }

      await db.deletePlayRecord(username, identity.source, identity.id);
    } else {
      await db.deleteAllPlayRecords(username);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
