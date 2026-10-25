// Telegram Mini App initData validation (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
// secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token)
// hash       = hex(HMAC_SHA256(key = secret_key, msg = data_check_string))
// data_check_string = all fields except `hash`, sorted by key, "key=value" joined with "\n".
const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export interface TgUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string; allows_write_to_pm?: boolean; is_bot?: boolean }
export type InitDataResult =
  | { ok: true; user: TgUser; authDate: number; queryId?: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_hash' | 'expired' | 'future' | 'no_user' };

export async function validateInitData(raw: string | null | undefined, botToken: string, maxAgeSec: number, now = Math.floor(Date.now() / 1000)): Promise<InitDataResult> {
  if (!raw) return { ok: false, reason: 'missing' };
  if (raw.length > 4096) return { ok: false, reason: 'malformed' };
  let params: URLSearchParams;
  try { params = new URLSearchParams(raw); } catch { return { ok: false, reason: 'malformed' }; }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'malformed' };
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = hex(await hmac(secret, pairs.join('\n')));
  if (!timingSafeEqual(expected, hash)) return { ok: false, reason: 'bad_hash' };
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (authDate > now + 60) return { ok: false, reason: 'future' };
  if (now - authDate > maxAgeSec) return { ok: false, reason: 'expired' };
  let user: TgUser;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return { ok: false, reason: 'malformed' }; }
  if (!user || typeof user.id !== 'number' || user.is_bot) return { ok: false, reason: 'no_user' };
  return { ok: true, user, authDate, queryId: params.get('query_id') ?? undefined };
}
