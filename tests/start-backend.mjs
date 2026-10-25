// Starts a fully local stack: Bot API stub (:8789) + fresh local D1 + `wrangler pages dev` (:8788).
// No Cloudflare account, no login, no real token. Returns helpers to stop it.
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { startBotStub } from './bot-stub.mjs';
import { FAKE_BOT_TOKEN, WEBHOOK_SECRET, ADMIN_ID } from './helpers.mjs';

export const ROOT = new URL('..', import.meta.url).pathname;
export const PERSIST = '/tmp/tgb-wrangler-state';
export const API = 'http://127.0.0.1:8788';
const WR = ROOT + 'node_modules/wrangler/bin/wrangler.js';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_D1_WARNING: 'true' };

export async function startBackend({ fresh = true } = {}) {
  const stub = await startBotStub(8789);
  if (fresh) rmSync(PERSIST, { recursive: true, force: true });
  execFileSync(process.execPath, [WR, 'd1', 'migrations', 'apply', 'tg-booking-db', '--local', '--persist-to', PERSIST], { cwd: ROOT, env, stdio: 'pipe' });
  const bindings = { BOT_TOKEN: FAKE_BOT_TOKEN, WEBHOOK_SECRET, ADMIN_IDS: String(ADMIN_ID), OWNER_CHAT_ID: '700000001', TELEGRAM_API_BASE: 'http://127.0.0.1:8789', MINI_APP_URL: 'https://tg-booking-miniapp.pages.dev' };
  const args = [WR, 'pages', 'dev', 'dist', '--port', '8788', '--ip', '127.0.0.1', '--persist-to', PERSIST, '--d1', 'DB=00000000-0000-0000-0000-000000000000', ...Object.entries(bindings).flatMap(([k, v]) => ['--binding', `${k}=${v}`])];
  const proc = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(API + '/api/health'); if (r.ok && (await r.json()).ok) break; } catch {}
    if (proc.exitCode !== null) throw new Error('pages dev exited:\n' + log);
    await new Promise((r) => setTimeout(r, 500));
    if (i === 119) throw new Error('pages dev did not start:\n' + log);
  }
  return { stub, proc, log: () => log, stop: async () => { proc.kill('SIGTERM'); stub.close(); await new Promise((r) => setTimeout(r, 500)); } };
}
export function d1(sql) {
  try {
    return execFileSync(process.execPath, [WR, 'd1', 'execute', 'tg-booking-db', '--local', '--persist-to', PERSIST, '--json', '--command', sql], { cwd: ROOT, env, stdio: 'pipe' }).toString();
  } catch (e) { throw new Error(`d1 failed: ${e.stdout ?? ''}${e.stderr ?? ''}`); }
}
export { WR, env as wranglerEnv };
