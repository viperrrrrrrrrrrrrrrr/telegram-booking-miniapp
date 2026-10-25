import type { Env } from './env.ts';
import { HttpError } from './http.ts';

/** Fixed one-minute window per user + bucket, stored in D1 (atomic UPSERT … RETURNING). */
export async function rateLimit(env: Env, userId: string, bucket: 'r' | 'w') {
  const limit = Number(bucket === 'r' ? env.RATE_LIMIT_READS_PER_MIN || 120 : env.RATE_LIMIT_WRITES_PER_MIN || 20);
  const now = Math.floor(Date.now() / 1000);
  const window = now - (now % 60);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
                                    window_start = excluded.window_start
     RETURNING count`,
  ).bind(`${bucket}:${userId}`, window).first<{ count: number }>();
  if (row && row.count > limit) throw new HttpError(429, 'rate_limited', 'Too many requests, please slow down.', { 'retry-after': String(60 - (now % 60)) });
}
