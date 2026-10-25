// Pure slot engine shared by demo mode (browser) and the API (Workers). No I/O.
import { addDays, dateKeyInTz, minutesInTz, parseHm, weekdayOf, zonedToUtcMs } from './time.ts';
import type { DayAvailability, Slot } from './types.ts';

export interface StaffSchedule {
  id: string;
  services: string[];
  /** Working window per weekday (0 = Sunday) in minutes from local midnight; null/absent = day off. */
  windows: Partial<Record<number, { start: number; end: number } | null>>;
}
export interface Busy { staffId: string | null; start: number; end: number; kind: 'booking' | 'timeoff'; bookingId?: string }
export interface SlotRules { stepMin: number; bufferMin: number; minNoticeMin: number; horizonDays: number }

/** Build per-staff weekly windows: the studio hours intersected with personal hours and days off. */
export function buildSchedules(
  staff: { id: string; services: string[]; daysOff: number[]; hours?: { start: string; end: string } }[],
  studioHours: Record<number, { start: string; end: string } | null>,
): StaffSchedule[] {
  return staff.map((s) => {
    const windows: StaffSchedule['windows'] = {};
    for (let wd = 0; wd < 7; wd++) {
      const h = studioHours[wd];
      if (!h || s.daysOff.includes(wd)) { windows[wd] = null; continue; }
      const start = Math.max(parseHm(h.start), s.hours ? parseHm(s.hours.start) : 0);
      const end = Math.min(parseHm(h.end), s.hours ? parseHm(s.hours.end) : 24 * 60);
      windows[wd] = end > start ? { start, end } : null;
    }
    return { id: s.id, services: s.services, windows };
  });
}

/** True if [start,end) collides with a busy interval for this staff member (bookings get the buffer). */
export function collides(staffId: string, start: number, end: number, busy: Busy[], bufferMin: number, excludeBookingId?: string): boolean {
  const buf = bufferMin * 60000;
  for (const b of busy) {
    if (b.staffId !== null && b.staffId !== staffId) continue;
    if (excludeBookingId && b.bookingId === excludeBookingId) continue;
    const pad = b.kind === 'booking' ? buf : 0;
    if (start < b.end + pad && b.start < end + pad) return true;
  }
  return false;
}

export interface DayQuery {
  date: string;
  tz: string;
  durationMin: number;
  serviceId: string;
  staffChoice: 'any' | string;
  schedules: StaffSchedule[];
  busy: Busy[];
  now: number;
  rules: SlotRules;
  excludeBookingId?: string;
}

/** Free start times for one day. Past slots and those inside the notice window are hidden. */
export function computeDaySlots(q: DayQuery): Slot[] {
  const wd = weekdayOf(q.date);
  const durMs = q.durationMin * 60000;
  const earliest = q.now + q.rules.minNoticeMin * 60000;
  const eligible = q.schedules.filter((s) => s.services.includes(q.serviceId) && (q.staffChoice === 'any' || s.id === q.staffChoice));
  const byStart = new Map<number, string[]>();
  for (const s of eligible) {
    const w = s.windows[wd];
    if (!w) continue;
    for (let m = w.start; m + q.durationMin <= w.end; m += q.rules.stepMin) {
      const start = zonedToUtcMs(q.date, m, q.tz);
      if (start < earliest) continue;
      if (collides(s.id, start, start + durMs, q.busy, q.rules.bufferMin, q.excludeBookingId)) continue;
      const arr = byStart.get(start) ?? [];
      arr.push(s.id);
      byStart.set(start, arr);
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staffIds]) => ({ start, staffIds }));
}

export function computeRange(q: Omit<DayQuery, 'date'> & { from: string; days: number }): DayAvailability[] {
  const out: DayAvailability[] = [];
  for (let i = 0; i < q.days; i++) {
    const date = addDays(q.from, i);
    out.push({ date, slots: computeDaySlots({ ...q, date }) });
  }
  return out;
}

/** Is `start` a valid bookable slot right now (working hours, step grid, notice, horizon, free)? */
export function isBookable(q: Omit<DayQuery, 'date' | 'staffChoice'> & { start: number; staffId: string }): boolean {
  const today = dateKeyInTz(q.now, q.tz);
  const date = dateKeyInTz(q.start, q.tz);
  if (date < today || date > addDays(today, q.rules.horizonDays - 1)) return false;
  if ((minutesInTz(q.start, q.tz) % q.rules.stepMin) !== 0) return false;
  return computeDaySlots({ ...q, date, staffChoice: q.staffId }).some((s) => s.start === q.start);
}

/** For "any specialist": pick the least-loaded free person that day (ties: config order). */
export function pickStaff(staffIds: string[], busy: Busy[], dayStart: number, dayEnd: number): string {
  let best = staffIds[0], bestLoad = Infinity;
  for (const id of staffIds) {
    const load = busy.filter((b) => b.kind === 'booking' && b.staffId === id && b.start < dayEnd && b.end > dayStart).reduce((s, b) => s + (b.end - b.start), 0);
    if (load < bestLoad) { best = id; bestLoad = load; }
  }
  return best;
}
