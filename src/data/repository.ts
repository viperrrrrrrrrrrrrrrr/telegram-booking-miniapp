// The data-layer contract. Two implementations:
//   DemoRepository — static demo, bookings in localStorage (default; used whenever no backend is reachable)
//   ApiRepository  — Cloudflare Pages Functions + D1, authenticated with Telegram initData
import type { ApiErrorCode, Booking, Catalog, DayAvailability, Me, TimeOff } from '../../shared/types';

export interface AvailabilityQuery { serviceId: string; staffId: 'any' | string; from?: string; days?: number; excludeBookingId?: string }
export interface CreateBookingInput { serviceId: string; staffId: 'any' | string; start: number; comment: string; clientName: string }
export interface BlockTimeInput { staffId: string | null; start: number; end: number; reason: string }

export interface BookingRepository {
  readonly mode: 'demo' | 'api';
  getCatalog(): Promise<Catalog>;
  getMe(): Promise<Me>;
  getAvailability(q: AvailabilityQuery): Promise<DayAvailability[]>;
  listMyBookings(): Promise<Booking[]>;
  createBooking(input: CreateBookingInput, idempotencyKey: string): Promise<Booking>;
  cancelBooking(id: string, idempotencyKey: string): Promise<Booking>;
  rescheduleBooking(id: string, to: { start: number; staffId: 'any' | string }, idempotencyKey: string): Promise<Booking>;
  admin: {
    schedule(date: string): Promise<{ bookings: Booking[]; timeOff: TimeOff[] }>;
    upcoming(days: number): Promise<Booking[]>;
    blockTime(input: BlockTimeInput): Promise<TimeOff>;
    unblock(id: string): Promise<void>;
    markNoShow(id: string): Promise<Booking>;
  };
}

export class RepoError extends Error {
  constructor(public code: ApiErrorCode, message: string) { super(message); }
}
export const newIdempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
