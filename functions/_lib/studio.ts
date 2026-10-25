// Loads the catalog, schedules and slot rules from D1 (seeded from shared/config.ts).
import type { Busy, SlotRules, StaffSchedule } from '../../shared/slots.ts';
import type { Booking, Catalog } from '../../shared/types.ts';
import type { Env } from './env.ts';

export interface Studio {
  catalog: Catalog;
  schedules: StaffSchedule[];
  rules: SlotRules;
  tz: string;
  maxActive: number;
}
let cache: { at: number; v: Studio } | null = null;
const CATEGORY_NAMES: Record<string, string> = { hands: 'Hands', feet: 'Feet', extras: 'Nail art & brows' };

export async function loadStudio(env: Env): Promise<Studio> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const [st, sv, sf, ss, wh] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM settings WHERE id = 1'),
    env.DB.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort_order'),
    env.DB.prepare('SELECT * FROM staff WHERE active = 1 ORDER BY sort_order'),
    env.DB.prepare('SELECT staff_id, service_id FROM staff_services'),
    env.DB.prepare('SELECT staff_id, weekday, start_min, end_min FROM working_hours'),
  ]);
  const s = st.results[0] as Record<string, any>;
  if (!s) throw new Error('settings row missing: apply migrations');
  const services = (sv.results as any[]).map((r) => ({ id: r.id, name: r.name, category: r.category, durationMin: r.duration_min, priceCents: r.price_cents, description: r.description }));
  const links = ss.results as { staff_id: string; service_id: string }[];
  const staff = (sf.results as any[]).map((r) => ({ id: r.id, name: r.name, role: r.role, colors: [r.color_a, r.color_b] as [string, string], services: links.filter((l) => l.staff_id === r.id).map((l) => l.service_id) }));
  const schedules: StaffSchedule[] = staff.map((p) => ({
    id: p.id,
    services: p.services,
    windows: Object.fromEntries((wh.results as any[]).filter((w) => w.staff_id === p.id).map((w) => [w.weekday, { start: w.start_min, end: w.end_min }])),
  }));
  const cats = [...new Set(services.map((x) => x.category))];
  const v: Studio = {
    catalog: { studioName: s.studio_name, timeZone: s.time_zone, currency: s.currency, categories: cats.map((id) => ({ id, name: CATEGORY_NAMES[id] ?? id })), services, staff, horizonDays: s.horizon_days, commentMax: s.comment_max },
    schedules,
    rules: { stepMin: s.step_min, bufferMin: s.buffer_min, minNoticeMin: s.min_notice_min, horizonDays: s.horizon_days },
    tz: s.time_zone,
    maxActive: s.max_active_per_customer,
  };
  cache = { at: Date.now(), v };
  return v;
}
export const resetStudioCache = () => { cache = null; };

/** Confirmed bookings + time off overlapping [fromMs, toMs), as busy intervals in ms. */
export async function loadBusy(env: Env, fromMs: number, toMs: number): Promise<Busy[]> {
  const from = Math.floor(fromMs / 1000) - 3600, to = Math.ceil(toMs / 1000) + 3600;
  const [b, t] = await env.DB.batch([
    env.DB.prepare("SELECT id, staff_id, start_at, end_at FROM bookings WHERE status = 'confirmed' AND start_at < ?2 AND end_at > ?1").bind(from, to),
    env.DB.prepare('SELECT staff_id, start_at, end_at FROM time_off WHERE start_at < ?2 AND end_at > ?1').bind(from, to),
  ]);
  return [
    ...(b.results as any[]).map((r) => ({ staffId: r.staff_id, start: r.start_at * 1000, end: r.end_at * 1000, kind: 'booking' as const, bookingId: r.id })),
    ...(t.results as any[]).map((r) => ({ staffId: r.staff_id ?? null, start: r.start_at * 1000, end: r.end_at * 1000, kind: 'timeoff' as const })),
  ];
}

export function rowToBooking(r: any, withCustomer = false): Booking {
  return {
    id: r.id, serviceId: r.service_id, staffId: r.staff_id, start: r.start_at * 1000, end: r.end_at * 1000,
    durationMin: r.duration_min, priceCents: r.price_cents, status: r.status, clientName: r.client_name, comment: r.comment,
    createdAt: r.created_at * 1000, source: r.source,
    ...(withCustomer ? { customer: { id: r.customer_id, firstName: r.c_first_name ?? '', username: r.c_username || undefined } } : {}),
  };
}
