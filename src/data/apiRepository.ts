// Live mode: Cloudflare Pages Functions + D1. Every request carries the raw Telegram initData,
// which the server validates (HMAC-SHA256, "WebAppData" key) before doing anything.
import type { ApiErrorBody, Booking, Catalog, DayAvailability, Me, TimeOff } from '../../shared/types';
import { RepoError, type BookingRepository, type CreateBookingInput } from './repository';

export class ApiRepository implements BookingRepository {
  readonly mode = 'api' as const;
  constructor(private initData: string, private base = '') {}

  private async req<T>(method: string, path: string, body?: unknown, idem?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { authorization: `tma ${this.initData}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(idem ? { 'idempotency-key': idem } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new RepoError('network', 'No connection. Please try again.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data as ApiErrorBody | null)?.error;
      throw new RepoError(e?.code ?? 'server_error', e?.message ?? `Request failed (${res.status})`);
    }
    return data as T;
  }

  getCatalog() { return this.req<Catalog>('GET', '/api/catalog'); }
  getMe() { return this.req<Me>('GET', '/api/me'); }
  async getAvailability(q: { serviceId: string; staffId: string; from?: string; days?: number; excludeBookingId?: string }): Promise<DayAvailability[]> {
    const p = new URLSearchParams({ serviceId: q.serviceId, staffId: q.staffId });
    if (q.from) p.set('from', q.from);
    if (q.days) p.set('days', String(q.days));
    if (q.excludeBookingId) p.set('exclude', q.excludeBookingId);
    return (await this.req<{ days: DayAvailability[] }>('GET', `/api/availability?${p}`)).days;
  }
  async listMyBookings() { return (await this.req<{ bookings: Booking[] }>('GET', '/api/bookings')).bookings; }
  async createBooking(input: CreateBookingInput, key: string) { return (await this.req<{ booking: Booking }>('POST', '/api/bookings', input, key)).booking; }
  async cancelBooking(id: string, key: string) { return (await this.req<{ booking: Booking }>('POST', `/api/bookings/${encodeURIComponent(id)}/cancel`, {}, key)).booking; }
  async rescheduleBooking(id: string, to: { start: number; staffId: string }, key: string) { return (await this.req<{ booking: Booking }>('POST', `/api/bookings/${encodeURIComponent(id)}/reschedule`, to, key)).booking; }

  admin = {
    schedule: (date: string) => this.req<{ bookings: Booking[]; timeOff: TimeOff[] }>('GET', `/api/admin/schedule?date=${date}`),
    upcoming: async (days: number) => (await this.req<{ bookings: Booking[] }>('GET', `/api/admin/upcoming?days=${days}`)).bookings,
    blockTime: async (input: { staffId: string | null; start: number; end: number; reason: string }) => (await this.req<{ timeOff: TimeOff }>('POST', '/api/admin/time-off', input)).timeOff,
    unblock: async (id: string) => { await this.req('DELETE', `/api/admin/time-off/${encodeURIComponent(id)}`); },
    markNoShow: async (id: string) => (await this.req<{ booking: Booking }>('POST', `/api/admin/bookings/${encodeURIComponent(id)}/no-show`, {})).booking,
  };
}

/** Is a compatible backend deployed next to the frontend? (A static-only deploy answers with HTML or 404.) */
export async function probeBackend(base = '', timeoutMs = 2500): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(base + '/api/health', { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return false;
    const j = await r.json();
    return j?.ok === true && j?.mode === 'api';
  } catch { return false; } finally { clearTimeout(t); }
}
