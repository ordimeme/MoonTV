import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const migration = readFileSync(
  resolve(root, 'migrations/0001_initial.sql'),
  'utf8'
);
const wrangler = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8');
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
);
const localHelper = readFileSync(resolve(root, 'scripts/d1-local.js'), 'utf8');

describe('本地 D1 环境契约', () => {
  const tables = [
    'users',
    'play_records',
    'favorites',
    'search_history',
    'admin_config',
    'skip_configs',
    'auth_rate_limits',
  ];

  it.each(tables)('迁移包含 %s 表', (table) => {
    expect(migration).toMatch(
      new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, 'i')
    );
  });

  it('迁移是可重复执行且不包含破坏性删除', () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|DATABASE)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS\s+favorites/i);
    expect(migration).toMatch(/search_title TEXT/i);
  });

  it('Wrangler 将 DB 绑定到 moonvideo D1', () => {
    expect(wrangler).toContain('"binding": "DB"');
    expect(wrangler).toContain('"database_name": "moonvideo"');
  });

  it('本地命令只使用 Wrangler 的 local 模式', () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(scripts['d1:local:migrate']).toContain('--local');
    expect(scripts['d1:local:dev']).toContain('--local');
    expect(scripts['d1:local:migrate']).not.toContain('--remote');
    expect(scripts['d1:local:dev']).not.toContain('--remote');
  });

  it('Cloudflare 构建固定启用 D1，避免生产包退回 localstorage', () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(scripts['cloudflare:build']).toBe(
      'NEXT_PUBLIC_STORAGE_TYPE=d1 opennextjs-cloudflare build'
    );
    expect(scripts['cloudflare:deploy']).toContain('cloudflare:build');
  });

  it('重置本地数据需要明确确认词且删除范围固定', () => {
    expect(localHelper).toContain("confirmation !== 'moonvideo-local'");
    expect(localHelper).toContain(
      "resolve(PROJECT_ROOT, '.wrangler/state/v3/d1')"
    );
    expect(localHelper).not.toContain("resolve('/')");
  });
});
