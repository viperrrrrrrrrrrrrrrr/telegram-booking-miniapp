// ─────────────────────────────────────────────────────────────────────────────
// Petalune Nail Studio: the ONE config file for the demo.
// Services, prices, staff, working hours and slot rules all live here.
// The studio is FICTIONAL and every price is a SAMPLE.
// ─────────────────────────────────────────────────────────────────────────────

export const studio = {
  name: 'Petalune',
  fullName: 'Petalune Nail Studio',
  tagline: 'Nails, pedicure & brows',
  demoLabel: 'Made by Ivan Litvin · sample prices',
  privacyNote: 'Bookings stay on this device. Nothing is sent to any server.',
  currency: 'USD',
  locale: 'en-US',
  /** IANA time zone of the studio. Slots, working hours and "today" use this zone; the DB stores UTC. */
  timeZone: 'Europe/Berlin',
} as const;

export type CategoryId = 'hands' | 'feet' | 'extras';
export const categories: { id: CategoryId; name: string }[] = [
  { id: 'hands', name: 'Hands' },
  { id: 'feet', name: 'Feet' },
  { id: 'extras', name: 'Nail art & brows' },
];

export interface Service {
  id: string;
  name: string;
  category: CategoryId;
  durationMin: number;
  price: number; // sample price, in `studio.currency`
  description: string;
}

export const services: Service[] = [
  { id: 'classic-mani', name: 'Classic manicure', category: 'hands', durationMin: 45, price: 30, description: 'Shape, cuticle care, regular polish' },
  { id: 'gel-mani', name: 'Gel manicure', category: 'hands', durationMin: 60, price: 45, description: 'Long-wear gel colour, glossy finish' },
  { id: 'gel-refresh', name: 'Gel removal + new set', category: 'hands', durationMin: 75, price: 55, description: 'Gentle soak-off, then a fresh gel set' },
  { id: 'builder', name: 'Builder gel extensions', category: 'hands', durationMin: 105, price: 75, description: 'Natural-looking length and strength' },
  { id: 'classic-pedi', name: 'Classic pedicure', category: 'feet', durationMin: 60, price: 40, description: 'Soak, exfoliation, regular polish' },
  { id: 'spa-pedi', name: 'Spa pedicure with gel', category: 'feet', durationMin: 90, price: 60, description: 'Mask, massage and gel colour' },
  { id: 'nail-art', name: 'Nail art, full set', category: 'extras', durationMin: 30, price: 15, description: 'Minimal lines, chrome or french' },
  { id: 'brows', name: 'Brow shape & tint', category: 'extras', durationMin: 30, price: 25, description: 'Mapping, shaping and tint' },
];

export interface Staff {
  id: string;
  name: string;
  role: string;
  services: string[]; // service ids this specialist performs
  daysOff: number[]; // 0 = Sunday … 6 = Saturday
  /** Optional per-person hours; falls back to the studio hours. */
  hours?: { start: string; end: string };
  /** Two-colour gradient used for the initials avatar (no photos of real people). */
  colors: [string, string];
}

export const staff: Staff[] = [
  { id: 'mila', name: 'Mila', role: 'Senior nail artist', services: ['classic-mani', 'gel-mani', 'gel-refresh', 'builder', 'nail-art'], daysOff: [1], colors: ['#f59fb8', '#c2417a'] },
  { id: 'sofia', name: 'Sofia', role: 'Nail artist', services: ['classic-mani', 'gel-mani', 'gel-refresh', 'classic-pedi', 'spa-pedi', 'nail-art'], daysOff: [0, 3], colors: ['#b79cf7', '#6f48d6'] },
  { id: 'nora', name: 'Nora', role: 'Pedicure & brow specialist', services: ['classic-pedi', 'spa-pedi', 'brows', 'classic-mani'], daysOff: [2], hours: { start: '11:00', end: '20:00' }, colors: ['#8fd3c7', '#2a8f84'] },
];

/** Studio opening hours per weekday (0 = Sunday). `null` = closed. Times are in `studio.timeZone`. */
export const workingHours: Record<number, { start: string; end: string } | null> = {
  0: { start: '11:00', end: '17:00' },
  1: { start: '10:00', end: '20:00' },
  2: { start: '10:00', end: '20:00' },
  3: { start: '10:00', end: '20:00' },
  4: { start: '10:00', end: '21:00' },
  5: { start: '10:00', end: '21:00' },
  6: { start: '10:00', end: '18:00' },
};

export const slotRules = {
  /** Start times are offered every N minutes. */
  stepMin: 15,
  /** Clean-up gap kept free between two appointments of the same specialist. */
  bufferMin: 10,
  /** Slots that start sooner than this from "now" are hidden. */
  minNoticeMin: 60,
  /** Days shown in the date strip, starting today. */
  horizonDays: 14,
  /** Max active bookings per device (demo guard). */
  maxActiveBookings: 6,
  /** Max length of the optional comment. */
  commentMax: 300,
};

/** Seeded "busy" appointments so the calendar looks realistic (generated, never stored). */
export const demoSeed = {
  /** Average share of each specialist's day that is already taken (0..1). Saturday gets a bump. */
  busyShare: 0.28,
  saturdayBonus: 0.14,
  /** Changing this reshuffles the seeded busy slots. */
  salt: 'petalune-v1',
};
