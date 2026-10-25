import type { Env } from './env.ts';
import { HttpError, json } from './http.ts';

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs `fn` at most once per (user, Idempotency-Key). Replays return the stored response.
 * Same key + different request => 422. Same key while the first call is still running => 409.
 */
export async function idempotent(env: Env, req: Request, userId: string, requestFingerprint: string, fn: () => Promise<{ status: number; body: unknown }>): Promise<Response> {
  const header = req.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(header)) throw new HttpError(400, 'validation', 'Idempotency-Key header (8-100 chars, [A-Za-z0-9_-]) is required');
  const key = `${userId}:${header}`;
  const hash = await sha256(requestFingerprint);
  const now = Math.floor(Date.now() / 1000);
  const ins = await env.DB.prepare('INSERT INTO idempotency_keys (key, request_hash, status, created_at) VALUES (?1, ?2, 0, ?3) ON CONFLICT(key) DO NOTHING')
    .bind(key, hash, now).run();
  if (!ins.meta.changes) {
    const row = await env.DB.prepare('SELECT request_hash, status, body FROM idempotency_keys WHERE key = ?1').bind(key).first<{ request_hash: string; status: number; body: string | null }>();
    if (row && row.request_hash !== hash) throw new HttpError(422, 'validation', 'Idempotency-Key was already used for a different request');
    if (!row || row.status === 0) throw new HttpError(409, 'conflict', 'The same request is still being processed');
    return json(JSON.parse(row.body || 'null'), row.status, { 'idempotent-replay': 'true' });
  }
  try {
    const res = await fn();
    await env.DB.prepare('UPDATE idempotency_keys SET status = ?2, body = ?3 WHERE key = ?1').bind(key, res.status, JSON.stringify(res.body)).run();
    return json(res.body, res.status);
  } catch (e) {
    if (e instanceof HttpError && e.status < 500 && e.status !== 429) {
      const body = { error: { code: e.code, message: e.message } };
      await env.DB.prepare('UPDATE idempotency_keys SET status = ?2, body = ?3 WHERE key = ?1').bind(key, e.status, JSON.stringify(body)).run();
    } else {
      await env.DB.prepare('DELETE FROM idempotency_keys WHERE key = ?1').bind(key).run(); // let the client retry
    }
    throw e;
  }
}
