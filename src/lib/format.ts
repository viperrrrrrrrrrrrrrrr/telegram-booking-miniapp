import { studio } from '../../shared/config';
import { minutesInTz } from '../../shared/time';

const cache = new Map<string, Intl.DateTimeFormat>();
function f(tz: string, o: Intl.DateTimeFormatOptions) {
  const k = tz + JSON.stringify(o);
  let x = cache.get(k);
  if (!x) { x = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o }); cache.set(k, x); }
  return x;
}
export const fmtTime = (ms: number, tz: string) => f(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const noon = (dateKey: string) => Date.parse(dateKey + 'T12:00:00Z');
export const fmtWeekday = (dateKey: string) => f('UTC', { weekday: 'short' }).format(noon(dateKey));
export const fmtDayNum = (dateKey: string) => f('UTC', { day: 'numeric' }).format(noon(dateKey));
export const fmtMonth = (dateKey: string) => f('UTC', { month: 'short' }).format(noon(dateKey));
export const fmtDayLong = (dateKey: string) => f('UTC', { weekday: 'long', day: 'numeric', month: 'long' }).format(noon(dateKey));
export const fmtDayShort = (dateKey: string) => f('UTC', { weekday: 'short', day: 'numeric', month: 'short' }).format(noon(dateKey));
export const fmtWhen = (ms: number, tz: string) => f(tz, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
export function money(cents: number, currency: string = studio.currency) {
  return new Intl.NumberFormat(studio.locale, { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
export function duration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
export function partOfDay(ms: number, tz: string): 'Morning' | 'Afternoon' | 'Evening' {
  const m = minutesInTz(ms, tz);
  return m < 12 * 60 ? 'Morning' : m < 17 * 60 ? 'Afternoon' : 'Evening';
}
export function tzCity(tz: string) { return tz.split('/').pop()!.replaceAll('_', ' '); }
export function deviceTzDiffers(tz: string) {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone !== tz; } catch { return false; }
}
