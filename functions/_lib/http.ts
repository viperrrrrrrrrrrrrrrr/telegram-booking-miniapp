import type { ApiErrorCode } from '../../shared/types.ts';

export class HttpError extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string, public headers: Record<string, string> = {}) { super(message); }
}
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const errorResponse = (e: HttpError) => json({ error: { code: e.code, message: e.message } }, e.status, e.headers);

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 8192): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'validation', 'Body too large');
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch { throw new HttpError(400, 'validation', 'Invalid JSON body'); }
}
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const nowSec = () => Math.floor(Date.now() / 1000);
