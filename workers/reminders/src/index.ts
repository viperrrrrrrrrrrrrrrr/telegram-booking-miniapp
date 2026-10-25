// Reminders Worker (Cron Trigger). Sends Telegram reminders 24 h and 2 h before each confirmed appointment.
// Idempotent: each reminder is "claimed" with an atomic UPDATE … WHERE reminder_X_at IS NULL RETURNING,
// so overlapping cron runs or retries can never send the same reminder twice.
import { clientText, sendMessage, type BookingInfo, type TgEnv } from '../../../functions/_lib/telegram.ts';

export interface Env extends TgEnv { DB: D1Database }

const WINDOWS = [
  // kind, column, lead time; a reminder is due when start - now <= lead (and the next tighter window hasn't started)
  { kind: 'reminder24' as const, col: 'reminder_24h_at', lead: 24 * 3600, floor: 2 * 3600 },
  { kind: 'reminder2' as const, col: 'reminder_2h_at', lead: 2 * 3600, floor: 0 },
];

export async function runReminders(env: Env, now = Math.floor(Date.now() / 1000)) {
  const settings = await env.DB.prepare('SELECT time_zone, currency FROM settings WHERE id = 1').first<{ time_zone: string; currency: string }>();
  if (!settings) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (const w of WINDOWS) {
    // Claim due reminders atomically. Bookings created inside the window (e.g. 5 h ahead) skip the 24 h one:
    // created_at must be before the reminder moment, otherwise it is marked as handled without sending.
    const claimed = await env.DB.prepare(
      `UPDATE bookings SET ${w.col} = ?1
       WHERE status = 'confirmed' AND ${w.col} IS NULL AND start_at > ?1 + ?3 AND start_at <= ?1 + ?2
       RETURNING id, customer_id, service_id, staff_id, start_at, duration_min, price_cents, client_name, created_at`,
    ).bind(now, w.lead, w.floor).all<any>();
    for (const b of claimed.results) {
      if (b.created_at > b.start_at - w.lead + 300) continue; // booked inside this window: the confirmation is enough
      const [svc, st] = await env.DB.batch([
        env.DB.prepare('SELECT name FROM services WHERE id = ?1').bind(b.service_id),
        env.DB.prepare('SELECT name FROM staff WHERE id = ?1').bind(b.staff_id),
      ]);
      const info: BookingInfo = { id: b.id, serviceName: (svc.results[0] as any)?.name ?? '', staffName: (st.results[0] as any)?.name ?? '', startAt: b.start_at, durationMin: b.duration_min, priceCents: b.price_cents, clientName: b.client_name, customerId: b.customer_id, currency: settings.currency, tz: settings.time_zone };
      const r = await sendMessage(env, b.customer_id, clientText(w.kind, info));
      if (r.ok) sent++; else failed++; // a failed send (user blocked the bot) is not retried: no spam loops
    }
  }
  // Housekeeping
  await env.DB.batch([
    env.DB.prepare('DELETE FROM idempotency_keys WHERE created_at < ?1').bind(now - 48 * 3600),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - 3600),
  ]);
  return { sent, failed };
}

export default {
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runReminders(env).then((r) => console.log('reminders', r)));
  },
  async fetch() {
    return new Response('reminders worker: cron only', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
