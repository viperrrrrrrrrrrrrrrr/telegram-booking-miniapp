// Time-zone helpers with no dependencies (Intl only). Work the same in the browser, Workers and Node.
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dtfCache.set(tz, f);
  }
  return f;
}
function parts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, min: o.minute, s: o.second };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the instant in the zone. */
export function dateKeyInTz(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
/** Minutes since local midnight of the instant in the zone. */
export function minutesInTz(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return p.h * 60 + p.min;
}
/** Zone offset (minutes, east positive) at the instant. */
export function tzOffsetMin(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
/** UTC epoch ms of a wall-clock time (dateKey + minutes) in the zone. */
export function zonedToUtcMs(dateKey: string, minutes: number, tz: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const off1 = tzOffsetMin(guess, tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMin(t, tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return t;
}
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
export function fmtHm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export const isDateKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
