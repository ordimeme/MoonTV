#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

const { rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const DATABASE = 'moonvideo';
const PROJECT_ROOT = resolve(__dirname, '..');
const STATE_DIRECTORY = resolve(PROJECT_ROOT, '.wrangler/state/v3/d1');
const REQUIRED_TABLES = [
  'admin_config',
  'auth_rate_limits',
  'favorites',
  'play_records',
  'search_history',
  'skip_configs',
  'users',
];

function runWrangler(args) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  return result.stdout;
}

function extractJson(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('Wrangler 未返回可识别的 JSON。');
  }
  return JSON.parse(output.slice(start, end + 1));
}

function verify() {
  const output = runWrangler([
    'd1',
    'execute',
    DATABASE,
    '--local',
    '--json',
    '--command',
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ]);
  const payload = extractJson(output);
  const rows = payload.flatMap((entry) => entry.results || []);
  const tables = new Set(rows.map((row) => row.name));
  const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));

  if (missing.length > 0) {
    throw new Error(`本地 D1 缺少数据表：${missing.join(', ')}`);
  }

  process.stdout.write(
    `本地 D1 校验通过：${REQUIRED_TABLES.length} 张业务表，数据目录 ${STATE_DIRECTORY}\n`
  );
}

function reset() {
  const confirmationIndex = process.argv.indexOf('--confirm');
  const confirmation = process.argv[confirmationIndex + 1];
  if (confirmation !== 'moonvideo-local') {
    process.stderr.write(
      '拒绝重置。仅在确认删除本地测试数据后运行：pnpm d1:local:reset -- --confirm moonvideo-local\n'
    );
    process.exit(2);
  }

  rmSync(STATE_DIRECTORY, { recursive: true, force: true });
  process.stdout.write('已删除本地 D1 测试数据，生产 D1 未受影响。\n');

  const result = spawnSync('pnpm', ['d1:local:migrate'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
  verify();
}

const command = process.argv[2];
if (command === 'verify') verify();
else if (command === 'reset') reset();
else {
  process.stderr.write('用法：node scripts/d1-local.js <verify|reset>\n');
  process.exit(2);
}
