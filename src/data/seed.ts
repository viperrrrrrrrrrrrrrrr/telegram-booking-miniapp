// Deterministic "busy" appointments for demo mode, generated from the date + specialist (never stored).
import { demoSeed, slotRules } from '../../shared/config';
import { configCatalog, configSchedules } from '../../shared/catalog';
import { collides, type Busy } from '../../shared/slots';
import { weekdayOf, zonedToUtcMs } from '../../shared/time';
import type { Booking } from '../../shared/types';

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES = ['Sample client A.', 'Sample client B.', 'Sample client C.', 'Sample client D.', 'Sample client E.', 'Sample client F.'];

const cache = new Map<string, Booking[]>();
export function seedBookingsForDate(date: string): Booking[] {
  const hit = cache.get(date);
  if (hit) return hit;
  const out: Booking[] = [];
  const wd = weekdayOf(date);
  for (const s of configSchedules) {
    const w = s.windows[wd];
    if (!w) continue;
    const r = rng(hash(`${demoSeed.salt}|${date}|${s.id}`));
    const share = Math.min(0.85, demoSeed.busyShare + (wd === 6 ? demoSeed.saturdayBonus : 0) + (r() - 0.5) * 0.25);
    let busyMin = 0;
    const target = (w.end - w.start) * share;
    const busy: Busy[] = [];
    for (let attempt = 0; attempt < 40 && busyMin < target; attempt++) {
      const pick = s.services[Math.floor(r() * s.services.length)];
      const svc = configCatalog.services.find((x) => x.id === pick)!;
      const slots = Math.floor((w.end - w.start - svc.durationMin) / 30);
      if (slots < 0) continue;
      const startMin = w.start + Math.floor(r() * (slots + 1)) * 30;
      const start = zonedToUtcMs(date, startMin, configCatalog.timeZone);
      const end = start + svc.durationMin * 60000;
      if (collides(s.id, start, end, busy, slotRules.bufferMin)) continue;
      const id = `seed-${date}-${s.id}-${out.length}`;
      busy.push({ staffId: s.id, start, end, kind: 'booking', bookingId: id });
      busyMin += svc.durationMin;
      out.push({ id, serviceId: svc.id, staffId: s.id, start, end, durationMin: svc.durationMin, priceCents: svc.priceCents, status: 'confirmed', clientName: NAMES[Math.floor(r() * NAMES.length)], comment: '', createdAt: start - 3 * 86400000, source: 'demo-seed', customer: null });
    }
  }
  out.sort((a, b) => a.start - b.start);
  cache.set(date, out);
  return out;
}
