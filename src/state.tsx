import { createContext, useContext } from 'react';
import type { Booking, Catalog, Me, Slot } from '../shared/types';
import type { BookingRepository } from './data/repository';

export type Screen = 'home' | 'staff' | 'time' | 'confirm' | 'success';
export type Tab = 'book' | 'bookings' | 'studio';
export interface Draft {
  serviceId?: string;
  staffId: 'any' | string;
  date?: string;
  slot?: Slot;
  comment: string;
  clientName: string;
  reschedule?: Booking;
}
export interface Result { status: 'pending' | 'done'; booking?: Booking; kind: 'new' | 'rescheduled'; preview: { serviceId: string; staffId: string; start: number } }
export interface Toast { id: number; text: string; tone: 'info' | 'error' | 'success' }

export interface AppState {
  repo: BookingRepository;
  catalog: Catalog;
  me: Me;
  screen: Screen;
  tab: Tab;
  setTab: (t: Tab) => void;
  go: (s: Screen) => void;
  back: () => void;
  backTo: (s: Screen) => void;
  draft: Draft;
  setDraft: (u: Partial<Draft> | ((d: Draft) => Draft)) => void;
  resetDraft: () => void;
  bookings: Booking[] | null;
  setBookings: (fn: (b: Booking[]) => Booking[]) => void;
  refreshBookings: () => Promise<void>;
  result: Result | null;
  setResult: (r: Result | null) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  adminEnabled: boolean;
  demoAdmin: boolean;
  setDemoAdmin: (v: boolean) => void;
  availabilityNonce: number;
  bumpAvailability: () => void;
  conflictNotice: string | null;
  setConflictNotice: (s: string | null) => void;
}
export const AppCtx = createContext<AppState | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
};
export const svcOf = (c: Catalog, id?: string) => c.services.find((s) => s.id === id);
export const staffOf = (c: Catalog, id?: string) => c.staff.find((s) => s.id === id);
