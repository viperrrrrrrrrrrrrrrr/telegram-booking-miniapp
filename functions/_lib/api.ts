// API router. Every route except /api/health and the bot webhook requires valid Telegram initData:
//   Authorization: tma <window.Telegram.WebApp.initData>
import { computeDaySlots, computeRange, pickStaff } from '../../shared/slots.ts';
import { addDays, dateKeyInTz, isDateKey, zonedToUtcMs } from '../../shared/time.ts';
import type { Env } from './env.ts';
import { HttpError, errorResponse, json, nowSec, readJson, str } from './http.ts';
import { idempotent } from './idempotency.ts';
import { validateInitData, timingSafeEqual, type TgUser } from './initdata.ts';
import { rateLimit } from './ratelimit.ts';
import { loadBusy, loadStudio, rowToBooking, type Studio } from './studio.ts';
import { clientText, esc, openAppButton, ownerText, sendMessage, type BookingInfo } from './telegram.ts';

type Ctx = { req: Request; env: Env; url: URL; waitUntil: (p: Promise<unknown>) => void };
interface Auth { user: TgUser; id: string; isAdmin: boolean }

export async function handle(req: Request, env: Env, waitUntil: Ctx['waitUntil']): Promise<Response> {
  const url = new URL(req.url);
  const ctx: Ctx = { req, env, url, waitUntil };
  try {
    const p = url.pathname.replace(/\/+$/, '');
    if (p === '/api/health' && req.method === 'GET') return json({ ok: true, service: 'tg-booking-miniapp', mode: 'api' });
    if (p === '/api/telegram/webhook' && req.method === 'POST') return await webhook(ctx);

    const auth = await authenticate(ctx);
    const write = req.method !== 'GET';
    await rateLimit(env, auth.id, write ? 'w' : 'r');
    let m: RegExpMatchArray | null;
    if (p === '/api/me' && req.method === 'GET') return json({ id: auth.id, firstName: auth.user.first_name, isAdmin: auth.isAdmin });
    if (p === '/api/catalog' && req.method === 'GET') return json((await loadStudio(env)).catalog);
    if (p === '/api/availability' && req.method === 'GET') return await availability(ctx);
    if (p === '/api/bookings' && req.method === 'GET') return await myBookings(ctx, auth);
    if (p === '/api/bookings' && req.method === 'POST') return await createBooking(ctx, auth);
    if ((m = p.match(/^\/api\/bookings\/([\w-]{1,64})\/cancel$/)) && req.method === 'POST') return await cancelBooking(ctx, auth, m[1]);
    if ((m = p.match(/^\/api\/bookings\/([\w-]{1,64})\/reschedule$/)) && req.method === 'POST') return await reschedule(ctx, auth, m[1]);
    if (p.startsWith('/api/admin/')) {
      if (!auth.isAdmin) throw new HttpError(403, 'forbidden', 'Admins only');
      if (p === '/api/admin/schedule' && req.method === 'GET') return await adminSchedule(ctx);
      if (p === '/api/admin/upcoming' && req.method === 'GET') return await adminUpcoming(ctx);
      if (p === '/api/admin/time-off' && req.method === 'POST') return await adminBlock(ctx, auth);
      if ((m = p.match(/^\/api\/admin\/time-off\/([\w-]{1,64})$/)) && req.method === 'DELETE') return await adminUnblock(ctx, m[1]);
      if ((m = p.match(/^\/api\/admin\/bookings\/([\w-]{1,64})\/no-show$/)) && req.method === 'POST') return await adminNoShow(ctx, m[1]);
    }
    throw new HttpError(404, 'not_found', 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    console.error('api error', e);
    return errorResponse(new HttpError(500, 'server_error', 'Something went wrong'));
  }
}

async function authenticate({ req, env }: Ctx): Promise<Auth> {
  if (!env.BOT_TOKEN) throw new HttpError(503, 'server_error', 'BOT_TOKEN is not configured');
  const h = req.headers.get('authorization') || '';
  const raw = h.startsWith('tma ') ? h.slice(4) : null;
  const r = await validateInitData(raw, env.BOT_TOKEN, Number(env.INITDATA_MAX_AGE_SEC || 86400));
  if (!r.ok) throw new HttpError(401, 'unauthorized', `Telegram authentication failed (${r.reason})`);
  const id = String(r.user.id);
  const admins = (env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return { user: r.user, id, isAdmin: admins.includes(id) };
}

const ownerChats = (env: Env) => (env.OWNER_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);

async function upsertCustomer(env: Env, u: TgUser) {
  const now = nowSec();
  await env.DB.prepare(
    `INSERT INTO customers (id, first_name, last_name, username, language_code, allows_write_to_pm, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name, username = excluded.username,
       language_code = excluded.language_code, allows_write_to_pm = MAX(allows_write_to_pm, excluded.allows_write_to_pm), updated_at = excluded.updated_at`,
  ).bind(String(u.id), u.first_name || '', u.last_name || '', u.username || '', u.language_code || '', u.allows_write_to_pm ? 1 : 0, now).run();
}

function dayBounds(studio: Studio, date: string) {
  return [zonedToUtcMs(date, 0, studio.tz), zonedToUtcMs(addDays(date, 1), 0, studio.tz)] as const;
}

// ── availability ────────────────────────────────────────────────────────────
async function availability({ env, url }: Ctx) {
  const studio = await loadStudio(env);
  const serviceId = url.searchParams.get('serviceId') || '';
  const staffId = url.searchParams.get('staffId') || 'any';
  const service = studio.catalog.services.find((s) => s.id === serviceId);
  if (!service) throw new HttpError(400, 'validation', 'Unknown serviceId');
  if (staffId !== 'any' && !studio.catalog.staff.some((s) => s.id === staffId && s.services.includes(serviceId))) throw new HttpError(400, 'validation', 'Unknown staffId for this service');
  const now = Date.now();
  const today = dateKeyInTz(now, studio.tz);
  const from = url.searchParams.get('from') || today;
  if (!isDateKey(from)) throw new HttpError(400, 'validation', 'from must be YYYY-MM-DD');
  const last = addDays(today, studio.rules.horizonDays - 1);
  const start = from < today ? today : from;
  const days = Math.max(0, Math.min(Number(url.searchParams.get('days') || studio.rules.horizonDays), studio.rules.horizonDays));
  const n = Math.max(0, Math.min(days, Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1));
  const busy = await loadBusy(env, zonedToUtcMs(start, 0, studio.tz), zonedToUtcMs(addDays(start, n), 0, studio.tz));
  const out = computeRange({ from: start, days: n, tz: studio.tz, durationMin: service.durationMin, serviceId, staffChoice: staffId, schedules: studio.schedules, busy, now, rules: studio.rules, excludeBookingId: url.searchParams.get('exclude') || undefined });
  return json({ timeZone: studio.tz, days: out });
}

// ── bookings ────────────────────────────────────────────────────────────────
async function myBookings({ env }: Ctx, auth: Auth) {
  const r = await env.DB.prepare('SELECT * FROM bookings WHERE customer_id = ?1 ORDER BY start_at DESC LIMIT 50').bind(auth.id).all();
  return json({ bookings: r.results.map((x) => rowToBooking(x)) });
}

/** Resolve staff + validate the slot against the live schedule. Returns candidate staff ordered by preference. */
async function resolveSlot(env: Env, studio: Studio, serviceId: string, staffChoice: string, start: number, excludeBookingId?: string) {
  const service = studio.catalog.services.find((s) => s.id === serviceId);
  if (!service) throw new HttpError(400, 'validation', 'Unknown serviceId');
  if (!Number.isInteger(start)) throw new HttpError(400, 'validation', 'start must be an epoch-ms integer');
  if (staffChoice !== 'any' && !studio.catalog.staff.some((s) => s.id === staffChoice && s.services.includes(serviceId))) throw new HttpError(400, 'validation', 'Unknown staffId for this service');
  const now = Date.now();
  const date = dateKeyInTz(start, studio.tz);
  const today = dateKeyInTz(now, studio.tz);
  if (date < today || date > addDays(today, studio.rules.horizonDays - 1)) throw new HttpError(422, 'validation', 'That date is outside the booking window');
  const [d0, d1] = dayBounds(studio, date);
  const base = { date, tz: studio.tz, durationMin: service.durationMin, serviceId, staffChoice, schedules: studio.schedules, now, rules: studio.rules, excludeBookingId };
  // Is it a real slot at all (hours / grid / notice)? Then: is it free?
  if (!computeDaySlots({ ...base, busy: [] }).some((s) => s.start === start)) throw new HttpError(422, 'validation', 'That time is not bookable');
  const busy = await loadBusy(env, d0, d1);
  const slot = computeDaySlots({ ...base, busy }).find((s) => s.start === start);
  if (!slot) throw new HttpError(409, 'slot_taken', 'Sorry, that time was just taken. Please pick another one.');
  const ids = [...slot.staffIds];
  const first = pickStaff(ids, busy, d0, d1);
  return { service, candidates: [first, ...ids.filter((i) => i !== first)] };
}

const isSlotTaken = (e: unknown) => /slot_taken|UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

function info(studio: Studio, row: any, auth?: Auth): BookingInfo {
  const svc = studio.catalog.services.find((s) => s.id === row.service_id);
  const st = studio.catalog.staff.find((s) => s.id === row.staff_id);
  return { id: row.id, serviceName: svc?.name ?? row.service_id, staffName: st?.name ?? row.staff_id, startAt: row.start_at, durationMin: row.duration_min, priceCents: row.price_cents, clientName: row.client_name, customerId: row.customer_id, username: auth?.user.username, comment: row.comment, currency: studio.catalog.currency, tz: studio.tz };
}
function notify(ctx: Ctx, kind: 'new' | 'cancelled' | 'rescheduled', b: BookingInfo, oldStart?: number) {
  const jobs: Promise<unknown>[] = ownerChats(ctx.env).map((c) => sendMessage(ctx.env, c, ownerText(kind, b, oldStart)));
  jobs.push(sendMessage(ctx.env, b.customerId, clientText(kind, b), kind === 'cancelled' ? openAppButton(ctx.env, 'Book again') : openAppButton(ctx.env, 'My bookings')));
  ctx.waitUntil(Promise.allSettled(jobs));
}

async function createBooking(ctx: Ctx, auth: Auth) {
  const { env, req } = ctx;
  const body = await readJson(req);
  const serviceId = str(body.serviceId, 64), staffChoice = str(body.staffId, 64) || 'any', start = Number(body.start);
  const studio = await loadStudio(env);
  const comment = str(body.comment, studio.catalog.commentMax);
  const clientName = str(body.clientName, 60) || auth.user.first_name || 'Guest';
  return idempotent(env, req, auth.id, JSON.stringify(['create', serviceId, staffChoice, start, comment, clientName]), async () => {
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ?1 AND status = 'confirmed' AND start_at > ?2").bind(auth.id, nowSec()).first<{ n: number }>();
    if ((active?.n ?? 0) >= studio.maxActive) throw new HttpError(409, 'limit_reached', `You can hold up to ${studio.maxActive} upcoming bookings.`);
    const { service, candidates } = await resolveSlot(env, studio, serviceId, staffChoice, start);
    await upsertCustomer(env, auth.user);
    const id = crypto.randomUUID();
    const now = nowSec(), startAt = Math.floor(start / 1000), endAt = startAt + service.durationMin * 60;
    for (const staffId of candidates) {
      try {
        // The DB trigger + partial unique index make this INSERT the final arbiter under concurrency.
        await env.DB.prepare(
          `INSERT INTO bookings (id, customer_id, service_id, staff_id, start_at, end_at, duration_min, price_cents, status, client_name, comment, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'confirmed', ?9, ?10, 'miniapp', ?11, ?11)`,
        ).bind(id, auth.id, service.id, staffId, startAt, endAt, service.durationMin, service.priceCents, clientName, comment, now).run();
        const row = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?1').bind(id).first();
        notify(ctx, 'new', info(studio, row, auth));
        return { status: 201, body: { booking: rowToBooking(row) } };
      } catch (e) {
        if (!isSlotTaken(e)) throw e;
        if (staffChoice !== 'any') break;
      }
    }
    throw new HttpError(409, 'slot_taken', 'Sorry, that time was just taken. Please pick another one.');
  });
}

async function ownedFutureBooking(env: Env, auth: Auth, id: string) {
  const row = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?1').bind(id).first<any>();
  if (!row || row.customer_id !== auth.id) throw new HttpError(404, 'not_found', 'Booking not found');
  if (row.status !== 'confirmed') throw new HttpError(409, 'conflict', 'This booking is no longer active');
  if (row.start_at <= nowSec()) throw new HttpError(409, 'conflict', 'This appointment has already started');
  return row;
}

async function cancelBooking(ctx: Ctx, auth: Auth, id: string) {
  const { env, req } = ctx;
  return idempotent(env, req, auth.id, JSON.stringify(['cancel', id]), async () => {
    const studio = await loadStudio(env);
    const row = await ownedFutureBooking(env, auth, id);
    const now = nowSec();
    const r = await env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'confirmed'").bind(id, now).run();
    if (!r.meta.changes) throw new HttpError(409, 'conflict', 'This booking is no longer active');
    const updated = { ...row, status: 'cancelled', cancelled_at: now, updated_at: now };
    notify(ctx, 'cancelled', info(studio, updated, auth));
    return { status: 200, body: { booking: rowToBooking(updated) } };
  });
}

async function reschedule(ctx: Ctx, auth: Auth, id: string) {
  const { env, req } = ctx;
  const body = await readJson(req);
  const start = Number(body.start), staffChoice = str(body.staffId, 64) || 'any';
  return idempotent(env, req, auth.id, JSON.stringify(['reschedule', id, start, staffChoice]), async () => {
    const studio = await loadStudio(env);
    const row = await ownedFutureBooking(env, auth, id);
    const { candidates } = await resolveSlot(env, studio, row.service_id, staffChoice, start, id);
    const startAt = Math.floor(start / 1000), endAt = startAt + row.duration_min * 60, now = nowSec();
    for (const staffId of candidates) {
      try {
        const r = await env.DB.prepare(
          `UPDATE bookings SET start_at = ?2, end_at = ?3, staff_id = ?4, updated_at = ?5, reminder_24h_at = NULL, reminder_2h_at = NULL
           WHERE id = ?1 AND status = 'confirmed'`,
        ).bind(id, startAt, endAt, staffId, now).run();
        if (!r.meta.changes) throw new HttpError(409, 'conflict', 'This booking is no longer active');
        const updated = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?1').bind(id).first();
        notify(ctx, 'rescheduled', info(studio, updated, auth), row.start_at);
        return { status: 200, body: { booking: rowToBooking(updated) } };
      } catch (e) {
        if (!isSlotTaken(e)) throw e;
        if (staffChoice !== 'any') break;
      }
    }
    throw new HttpError(409, 'slot_taken', 'Sorry, that time was just taken. Please pick another one.');
  });
}

// ── admin ───────────────────────────────────────────────────────────────────
const ADMIN_SELECT = 'SELECT b.*, c.first_name AS c_first_name, c.username AS c_username FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id';

async function adminSchedule({ env, url }: Ctx) {
  const studio = await loadStudio(env);
  const date = url.searchParams.get('date') || dateKeyInTz(Date.now(), studio.tz);
  if (!isDateKey(date)) throw new HttpError(400, 'validation', 'date must be YYYY-MM-DD');
  const [d0, d1] = dayBounds(studio, date).map((x) => x / 1000);
  const [b, t] = await env.DB.batch([
    env.DB.prepare(`${ADMIN_SELECT} WHERE b.start_at >= ?1 AND b.start_at < ?2 AND b.status <> 'cancelled' ORDER BY b.start_at`).bind(d0, d1),
    env.DB.prepare('SELECT * FROM time_off WHERE start_at < ?2 AND end_at > ?1 ORDER BY start_at').bind(d0, d1),
  ]);
  return json({
    date, timeZone: studio.tz,
    bookings: b.results.map((r) => rowToBooking(r, true)),
    timeOff: (t.results as any[]).map((r) => ({ id: r.id, staffId: r.staff_id, start: r.start_at * 1000, end: r.end_at * 1000, reason: r.reason })),
  });
}
async function adminUpcoming({ env, url }: Ctx) {
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 31);
  const now = nowSec();
  const r = await env.DB.prepare(`${ADMIN_SELECT} WHERE b.status = 'confirmed' AND b.end_at > ?1 AND b.start_at < ?2 ORDER BY b.start_at LIMIT 200`).bind(now, now + days * 86400).all();
  return json({ bookings: r.results.map((x) => rowToBooking(x, true)) });
}
async function adminBlock({ env, req }: Ctx, auth: Auth) {
  const studio = await loadStudio(env);
  const body = await readJson(req);
  const staffId = body.staffId === null || body.staffId === '' || body.staffId === undefined ? null : str(body.staffId, 64);
  const start = Number(body.start), end = Number(body.end);
  if (staffId && !studio.catalog.staff.some((s) => s.id === staffId)) throw new HttpError(400, 'validation', 'Unknown staffId');
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start || end - start > 14 * 86400000) throw new HttpError(400, 'validation', 'start/end must be epoch ms, end > start, max 14 days');
  const id = crypto.randomUUID();
  const s = Math.floor(start / 1000), e = Math.floor(end / 1000);
  await env.DB.prepare('INSERT INTO time_off (id, staff_id, start_at, end_at, reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, staffId, s, e, str(body.reason, 120), auth.id, nowSec()).run();
  const clash = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND start_at < ?2 AND end_at > ?1" + (staffId ? ' AND staff_id = ?3' : ''))
    .bind(s, e, ...(staffId ? [staffId] : [])).first<{ n: number }>();
  return json({ timeOff: { id, staffId, start: s * 1000, end: e * 1000, reason: str(body.reason, 120) }, overlappingBookings: clash?.n ?? 0 }, 201);
}
async function adminUnblock({ env }: Ctx, id: string) {
  const r = await env.DB.prepare('DELETE FROM time_off WHERE id = ?1').bind(id).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found', 'Not found');
  return json({ ok: true });
}
async function adminNoShow({ env }: Ctx, id: string) {
  const r = await env.DB.prepare("UPDATE bookings SET status = 'no_show', updated_at = ?2 WHERE id = ?1 AND status = 'confirmed' AND start_at <= ?2").bind(id, nowSec()).run();
  if (!r.meta.changes) throw new HttpError(409, 'conflict', 'Only a confirmed appointment that has started can be marked as no-show');
  const row = await env.DB.prepare(`${ADMIN_SELECT} WHERE b.id = ?1`).bind(id).first();
  return json({ booking: rowToBooking(row, true) });
}

// ── bot webhook ─────────────────────────────────────────────────────────────
async function webhook(ctx: Ctx) {
  const { env, req } = ctx;
  const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!env.WEBHOOK_SECRET || !timingSafeEqual(got, env.WEBHOOK_SECRET)) throw new HttpError(401, 'unauthorized', 'Bad webhook secret');
  const update = await readJson<any>(req, 65536);
  const msg = update.message;
  if (msg?.chat?.type === 'private' && typeof msg.text === 'string' && msg.from && !msg.from.is_bot) {
    const cmd = msg.text.split(/[\s@]/)[0];
    if (cmd === '/start') {
      await upsertCustomer(env, msg.from);
      await env.DB.prepare('UPDATE customers SET bot_started = 1 WHERE id = ?1').bind(String(msg.from.id)).run();
      const studio = await loadStudio(env);
      ctx.waitUntil(sendMessage(env, msg.chat.id, `Hi, ${esc(msg.from.first_name || 'there')}! 💅\nBook a visit to <b>${esc(studio.catalog.studioName)}</b> in a few taps.`, openAppButton(env)));
    } else if (cmd === '/help') {
      ctx.waitUntil(sendMessage(env, msg.chat.id, 'Tap the button to book, reschedule or cancel. You will get a reminder 24 h and 2 h before your visit.', openAppButton(env)));
    }
  }
  return json({ ok: true }); // always 200 so Telegram doesn't retry valid updates
}
