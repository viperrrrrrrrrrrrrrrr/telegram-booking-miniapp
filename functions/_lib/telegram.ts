// Minimal Telegram Bot API client + message templates. Shared by the Pages Functions and the reminders Worker.
export interface TgEnv { BOT_TOKEN?: string; TELEGRAM_API_BASE?: string; OWNER_CHAT_ID?: string; MINI_APP_URL?: string }

export async function tgCall(env: TgEnv, method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; description?: string }> {
  if (!env.BOT_TOKEN) return { ok: false, status: 0, description: 'BOT_TOKEN not configured' };
  const base = (env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !body.ok) console.warn(`telegram ${method} failed`, res.status, body.description);
    return { ok: res.ok && !!body.ok, status: res.status, description: body.description };
  } catch (e) {
    console.warn(`telegram ${method} error`, (e as Error).message);
    return { ok: false, status: 0, description: (e as Error).message };
  }
}

export const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const sendMessage = (env: TgEnv, chatId: string | number, html: string, extra: Record<string, unknown> = {}) =>
  tgCall(env, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export function openAppButton(env: TgEnv, text = 'Book an appointment') {
  return env.MINI_APP_URL ? { reply_markup: { inline_keyboard: [[{ text, web_app: { url: env.MINI_APP_URL } }]] } } : {};
}

export function fmtWhen(startSec: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(startSec * 1000));
}

export interface BookingInfo { id: string; serviceName: string; staffName: string; startAt: number; durationMin: number; priceCents: number; clientName: string; customerId: string; username?: string; comment?: string; currency: string; tz: string }
const money = (c: number, cur: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);

export function ownerText(kind: 'new' | 'cancelled' | 'rescheduled', b: BookingInfo, oldStartAt?: number) {
  const head = { new: '🆕 <b>New booking</b>', cancelled: '❌ <b>Booking cancelled</b>', rescheduled: '🔁 <b>Booking rescheduled</b>' }[kind];
  const who = `${esc(b.clientName || 'Client')}${b.username ? ` (@${esc(b.username)})` : ''} · id ${esc(b.customerId)}`;
  return [
    head,
    `${esc(b.serviceName)} with ${esc(b.staffName)}`,
    kind === 'rescheduled' && oldStartAt ? `<s>${fmtWhen(oldStartAt, b.tz)}</s> → <b>${fmtWhen(b.startAt, b.tz)}</b>` : `<b>${fmtWhen(b.startAt, b.tz)}</b> · ${b.durationMin} min · ${money(b.priceCents, b.currency)}`,
    who,
    b.comment ? `💬 ${esc(b.comment)}` : '',
  ].filter(Boolean).join('\n');
}
export function clientText(kind: 'new' | 'cancelled' | 'rescheduled' | 'reminder24' | 'reminder2', b: BookingInfo) {
  const when = `<b>${fmtWhen(b.startAt, b.tz)}</b>`;
  switch (kind) {
    case 'new': return `✅ You're booked!\n${esc(b.serviceName)} with ${esc(b.staffName)}\n${when} · ${b.durationMin} min`;
    case 'rescheduled': return `🔁 Your appointment was moved.\n${esc(b.serviceName)} with ${esc(b.staffName)}\nNew time: ${when}`;
    case 'cancelled': return `Your booking for ${esc(b.serviceName)} on ${when} is cancelled.`;
    case 'reminder24': return `⏰ Reminder: ${esc(b.serviceName)} with ${esc(b.staffName)} tomorrow, ${when}.`;
    case 'reminder2': return `⏰ See you soon: ${esc(b.serviceName)} with ${esc(b.staffName)} at ${when}.`;
  }
}
