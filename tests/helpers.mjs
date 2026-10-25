import crypto from 'node:crypto';
export const FAKE_BOT_TOKEN = '123456:LOCAL-FAKE-TOKEN-for-tests-only';
export const WEBHOOK_SECRET = 'test-webhook-secret-0123456789';
export const ADMIN_ID = 900000001;

/** Build initData exactly like Telegram does, signed with a FAKE bot token. */
export function signInitData(user, { botToken = FAKE_BOT_TOKEN, authDate = Math.floor(Date.now() / 1000) } = {}) {
  const params = new URLSearchParams({ query_id: 'AAE' + crypto.randomBytes(6).toString('hex'), user: JSON.stringify(user), auth_date: String(authDate) });
  const dcs = [...params].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}
export const user = (id, first_name = 'Test', extra = {}) => ({ id, first_name, username: `u${id}`, language_code: 'en', allows_write_to_pm: true, ...extra });
export const idem = () => crypto.randomUUID();
