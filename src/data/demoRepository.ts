// Demo mode: everything stays in this browser's localStorage. No network at all.
import { slotRules } from '../../shared/config';
import { configCatalog, configSchedules } from '../../shared/catalog';
import { computeDaySlots, computeRange, pickStaff, type Busy } from '../../shared/slots';
import { addDays, dateKeyInTz, zonedToUtcMs } from '../../shared/time';
import type { Booking, Me, TimeOff } from '../../shared/types';
import { RepoError, type BookingRepository, type CreateBookingInput } from './repository';
import { seedBookingsForDate } from './seed';

const KEY = 'petalune.demo.v1';
interface Store { bookings: Booking[]; timeOff: TimeOff[]; seedStatus: Record<string, 'no_show'>; idem: Record<string, string> }
const tz = configCatalog.timeZone;

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.bookings)) return { timeOff: [], seedStatus: {}, idem: {}, ...s };
  } catch { /* corrupted: start fresh */ }
  return { bookings: [], timeOff: [], seedStatus: {}, idem: {} };
}
function save(s: Store) {
  const keys = Object.keys(s.idem);
  if (keys.length > 100) for (const k of keys.slice(0, keys.length - 100)) delete s.idem[k];
  localStorage.setItem(KEY, JSON.stringify(s));
}
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export class DemoRepository implements BookingRepository {
  readonly mode = 'demo' as const;
  constructor(private me: () => Me) {}

  private seeds(date: string): Booking[] {
    const st = load().seedStatus;
    return seedBookingsForDate(date).map((b) => (st[b.id] ? { ...b, status: st[b.id] } : b));
  }
  private busy(from: string, days: number, s = load()): Busy[] {
    const out: Busy[] = [];
    for (let i = -1; i <= days; i++) for (const b of this.seeds(addDays(from, i))) if (b.status === 'confirmed') out.push({ staffId: b.staffId, start: b.start, end: b.end, kind: 'booking', bookingId: b.id });
    for (const b of s.bookings) if (b.status === 'confirmed') out.push({ staffId: b.staffId, start: b.start, end: b.end, kind: 'booking', bookingId: b.id });
    for (const t of s.timeOff) out.push({ staffId: t.staffId, start: t.start, end: t.end, kind: 'timeoff' });
    return out;
  }
  private today() { return dateKeyInTz(Date.now(), tz); }

  async getCatalog() { return configCatalog; }
  async getMe() { return this.me(); }

  async getAvailability(q: { serviceId: string; staffId: string; from?: string; days?: number; excludeBookingId?: string }) {
    await delay(90);
    const svc = configCatalog.services.find((s) => s.id === q.serviceId);
    if (!svc) throw new RepoError('validation', 'Unknown service');
    const today = this.today();
    const from = q.from && q.from > today ? q.from : today;
    const days = Math.min(q.days ?? slotRules.horizonDays, slotRules.horizonDays);
    return computeRange({ from, days, tz, durationMin: svc.durationMin, serviceId: svc.id, staffChoice: q.staffId, schedules: configSchedules, busy: this.busy(from, days), now: Date.now(), rules: slotRules, excludeBookingId: q.excludeBookingId });
  }

  async listMyBookings() {
    await delay(60);
    return load().bookings.slice().sort((a, b) => b.start - a.start);
  }

  /** Same rules as the server: real slot, still free, then an atomic write (single-threaded localStorage). */
  private resolve(serviceId: string, staffChoice: string, start: number, excludeBookingId?: string) {
    const svc = configCatalog.services.find((s) => s.id === serviceId);
    if (!svc) throw new RepoError('validation', 'Unknown service');
    const date = dateKeyInTz(start, tz);
    const today = this.today();
    if (date < today || date > addDays(today, slotRules.horizonDays - 1)) throw new RepoError('validation', 'That date is outside the booking window');
    const busy = this.busy(date, 1);
    const slot = computeDaySlots({ date, tz, durationMin: svc.durationMin, serviceId, staffChoice, schedules: configSchedules, busy, now: Date.now(), rules: slotRules, excludeBookingId }).find((s) => s.start === start);
    if (!slot) throw new RepoError('slot_taken', 'Sorry, that time was just taken. Please pick another one.');
    const staffId = pickStaff(slot.staffIds, busy, zonedToUtcMs(date, 0, tz), zonedToUtcMs(addDays(date, 1), 0, tz));
    return { svc, staffId };
  }

  async createBooking(input: CreateBookingInput, key: string) {
    await delay(260);
    const s = load();
    if (s.idem[key]) { const b = s.bookings.find((x) => x.id === s.idem[key]); if (b) return b; }
    const active = s.bookings.filter((b) => b.status === 'confirmed' && b.start > Date.now()).length;
    if (active >= slotRules.maxActiveBookings) throw new RepoError('limit_reached', `You can hold up to ${slotRules.maxActiveBookings} upcoming bookings on this device.`);
    const { svc, staffId } = this.resolve(input.serviceId, input.staffId, input.start);
    const b: Booking = {
      id: `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      serviceId: svc.id, staffId, start: input.start, end: input.start + svc.durationMin * 60000, durationMin: svc.durationMin, priceCents: svc.priceCents,
      status: 'confirmed', clientName: input.clientName.slice(0, 60) || 'Guest', comment: input.comment.slice(0, slotRules.commentMax), createdAt: Date.now(), source: 'miniapp',
    };
    s.bookings.push(b); s.idem[key] = b.id; save(s);
    return b;
  }

  async cancelBooking(id: string) {
    await delay(200);
    const s = load();
    const b = s.bookings.find((x) => x.id === id);
    if (!b) throw new RepoError('not_found', 'Booking not found');
    if (b.status !== 'confirmed') return b;
    b.status = 'cancelled'; save(s);
    return b;
  }

  async rescheduleBooking(id: string, to: { start: number; staffId: string }, key: string) {
    await delay(260);
    const s = load();
    const b = s.bookings.find((x) => x.id === id);
    if (!b) throw new RepoError('not_found', 'Booking not found');
    if (s.idem[key] === id) return b;
    if (b.status !== 'confirmed' || b.start <= Date.now()) throw new RepoError('conflict', 'This booking can no longer be changed');
    const { staffId } = this.resolve(b.serviceId, to.staffId, to.start, id);
    Object.assign(b, { start: to.start, end: to.start + b.durationMin * 60000, staffId });
    s.idem[key] = id; save(s);
    return b;
  }

  admin = {
    schedule: async (date: string) => {
      await delay(80);
      const s = load();
      const d0 = zonedToUtcMs(date, 0, tz), d1 = zonedToUtcMs(addDays(date, 1), 0, tz);
      const mine = s.bookings.filter((b) => b.start >= d0 && b.start < d1 && b.status !== 'cancelled').map((b) => ({ ...b, customer: { id: 'you', firstName: b.clientName } }));
      return {
        bookings: [...this.seeds(date), ...mine].sort((a, b) => a.start - b.start),
        timeOff: s.timeOff.filter((t) => t.start < d1 && t.end > d0),
      };
    },
    upcoming: async (days: number) => {
      const out: Booking[] = [];
      const today = this.today();
      for (let i = 0; i < days; i++) out.push(...(await this.admin.schedule(addDays(today, i))).bookings);
      return out.filter((b) => b.status === 'confirmed' && b.end > Date.now());
    },
    blockTime: async (input: { staffId: string | null; start: number; end: number; reason: string }) => {
      if (!(input.end > input.start)) throw new RepoError('validation', 'End must be after start');
      const s = load();
      const t: TimeOff = { id: `to-${Date.now().toString(36)}`, staffId: input.staffId, start: input.start, end: input.end, reason: input.reason.slice(0, 120) };
      s.timeOff.push(t); save(s);
      return t;
    },
    unblock: async (id: string) => { const s = load(); s.timeOff = s.timeOff.filter((t) => t.id !== id); save(s); },
    markNoShow: async (id: string) => {
      const s = load();
      const mine = s.bookings.find((b) => b.id === id);
      if (mine) { if (mine.start > Date.now()) throw new RepoError('conflict', 'Only started appointments can be marked as no-show'); mine.status = 'no_show'; save(s); return mine; }
      const date = id.slice(5, 15);
      const seed = seedBookingsForDate(date).find((b) => b.id === id);
      if (!seed) throw new RepoError('not_found', 'Not found');
      if (seed.start > Date.now()) throw new RepoError('conflict', 'Only started appointments can be marked as no-show');
      s.seedStatus[id] = 'no_show'; save(s);
      return { ...seed, status: 'no_show' as const };
    },
  };
}
