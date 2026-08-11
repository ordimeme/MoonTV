/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfigConflictError } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';
import {
  readLimitedJson,
  RequestValidationError,
} from '@/lib/request-security';
import { auditVideoSource } from '@/lib/source-auditor';
import {
  deleteSourceFromConfig,
  setSourceEnabled,
} from '@/lib/source-management';
import { IStorage } from '@/lib/types';
import { isSafeUpstreamUrl } from '@/lib/upstream-security';

// 支持的操作类型
type Action = 'add' | 'audit' | 'disable' | 'enable' | 'delete' | 'sort';

interface BaseBody {
  action?: Action;
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = await readLimitedJson<BaseBody & Record<string, any>>(
      request,
      16 * 1024
    );
    const { action } = body;

    const authInfo = await getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    // 基础校验
    const ACTIONS: Action[] = [
      'add',
      'audit',
      'disable',
      'enable',
      'delete',
      'sort',
    ];
    if (!username || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 获取配置与存储
    const adminConfig = await getConfig();
    const storage: IStorage | null = getStorage();

    // 权限与身份校验
    const isOwner = username === process.env.USERNAME;
    if (!isOwner) {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    switch (action) {
      case 'add': {
        const { key, name, api, detail } = body as {
          key?: string;
          name?: string;
          api?: string;
          detail?: string;
        };
        if (!key || !name || !api) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || name.length > 100) {
          return NextResponse.json(
            { error: '视频源名称或 key 格式错误' },
            { status: 400 }
          );
        }
        if (!isSafeUpstreamUrl(api) || (detail && !isSafeUpstreamUrl(detail))) {
          return NextResponse.json(
            { error: '仅允许无凭据、无查询参数的公网 HTTPS 视频源' },
            { status: 400 }
          );
        }
        if (adminConfig.SourceConfig.some((s) => s.key === key)) {
          return NextResponse.json({ error: '该源已存在' }, { status: 400 });
        }
        adminConfig.SourceConfig.push({
          key,
          name,
          api,
          detail,
          from: 'custom',
          disabled: true,
          auditStatus: 'pending',
          auditNote:
            '新视频源处于隔离状态，请先运行服务器抽检，再由站长决定是否启用',
        });
        break;
      }
      case 'disable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = true;
        break;
      }
      case 'audit': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        const result = await auditVideoSource(entry.api);
        entry.auditStatus = result.status;
        entry.auditNote = result.note;
        entry.auditDate = result.auditDate;
        break;
      }
      case 'enable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        if (setSourceEnabled(entry, true, isOwner) === 'owner_required') {
          return NextResponse.json(
            { error: '服务器抽检仅提供建议，只有站长可以最终启用视频源' },
            { status: 403 }
          );
        }
        break;
      }
      case 'delete': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const result = deleteSourceFromConfig(
          adminConfig.SourceConfig,
          key,
          isOwner
        );
        if (result === 'not_found') {
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        }
        if (result === 'owner_required')
          return NextResponse.json(
            { error: '仅站长可以删除内置视频源' },
            { status: 403 }
          );
        break;
      }
      case 'sort': {
        const { order } = body as { order?: string[] };
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序列表格式错误' },
            { status: 400 }
          );
        }
        const map = new Map(adminConfig.SourceConfig.map((s) => [s.key, s]));
        const newList: typeof adminConfig.SourceConfig = [];
        order.forEach((k) => {
          const item = map.get(k);
          if (item) {
            newList.push(item);
            map.delete(k);
          }
        });
        // 未在 order 中的保持原顺序
        adminConfig.SourceConfig.forEach((item) => {
          if (map.has(item.key)) newList.push(item);
        });
        adminConfig.SourceConfig = newList;
        break;
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 持久化到存储
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof AdminConfigConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('视频源管理操作失败:', error);
    return NextResponse.json(
      {
        error: '视频源管理操作失败',
      },
      { status: 500 }
    );
  }
}
