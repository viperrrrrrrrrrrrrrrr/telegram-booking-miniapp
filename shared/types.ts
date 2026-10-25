// DTOs shared by the frontend, the Pages Functions API and the reminders Worker.
export type BookingStatus = 'confirmed' | 'cancelled' | 'no_show';

export interface CatalogService { id: string; name: string; category: string; durationMin: number; priceCents: number; description: string }
export interface CatalogStaff { id: string; name: string; role: string; services: string[]; colors: [string, string] }
export interface Catalog {
  studioName: string;
  timeZone: string;
  currency: string;
  categories: { id: string; name: string }[];
  services: CatalogService[];
  staff: CatalogStaff[];
  horizonDays: number;
  commentMax: number;
}

export interface Slot { start: number; staffIds: string[] } // start = UTC epoch ms
export interface DayAvailability { date: string; slots: Slot[] }

export interface Booking {
  id: string;
  serviceId: string;
  staffId: string;
  start: number; // UTC epoch ms
  end: number; // UTC epoch ms
  durationMin: number;
  priceCents: number;
  status: BookingStatus;
  clientName: string;
  comment: string;
  createdAt: number;
  /** Admin views only. */
  customer?: { id: string; firstName: string; username?: string } | null;
  source?: 'miniapp' | 'demo-seed' | 'admin';
}

export interface TimeOff { id: string; staffId: string | null; start: number; end: number; reason: string }

export interface Me { id: string; firstName: string; isAdmin: boolean }

export type ApiErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'slot_taken' | 'rate_limited' | 'conflict' | 'limit_reached' | 'server_error' | 'network';
export interface ApiErrorBody { error: { code: ApiErrorCode; message: string } }
