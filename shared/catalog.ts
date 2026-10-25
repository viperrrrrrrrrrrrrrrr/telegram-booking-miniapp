// Derives the API-shaped catalog and staff schedules from the ONE config file.
import { categories, services, staff, studio, slotRules, workingHours } from './config.ts';
import { buildSchedules } from './slots.ts';
import type { Catalog } from './types.ts';

export const configCatalog: Catalog = {
  studioName: studio.fullName,
  timeZone: studio.timeZone,
  currency: studio.currency,
  categories,
  services: services.map((s) => ({ id: s.id, name: s.name, category: s.category, durationMin: s.durationMin, priceCents: Math.round(s.price * 100), description: s.description })),
  staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role, services: s.services, colors: s.colors })),
  horizonDays: slotRules.horizonDays,
  commentMax: slotRules.commentMax,
};
export const configSchedules = buildSchedules(staff, workingHours);
