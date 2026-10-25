// Generates migrations/0002_seed_catalog.sql from shared/config.ts (the ONE config file).
// Run: node scripts/gen-seed.mjs   (Node 22.18+ runs the TS config directly)
import { writeFileSync } from 'node:fs';
import { studio, services, staff, slotRules } from '../shared/config.ts';
import { configSchedules } from '../shared/catalog.ts';

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const rows = [];
rows.push(`INSERT INTO settings (id, studio_name, time_zone, currency, step_min, buffer_min, min_notice_min, horizon_days, max_active_per_customer, comment_max) VALUES (1, ${q(studio.fullName)}, ${q(studio.timeZone)}, ${q(studio.currency)}, ${slotRules.stepMin}, ${slotRules.bufferMin}, ${slotRules.minNoticeMin}, ${slotRules.horizonDays}, ${slotRules.maxActiveBookings}, ${slotRules.commentMax});`);
services.forEach((s, i) => rows.push(`INSERT INTO services (id, name, category, description, duration_min, price_cents, sort_order) VALUES (${q(s.id)}, ${q(s.name)}, ${q(s.category)}, ${q(s.description)}, ${s.durationMin}, ${Math.round(s.price * 100)}, ${i});`));
staff.forEach((s, i) => rows.push(`INSERT INTO staff (id, name, role, color_a, color_b, sort_order) VALUES (${q(s.id)}, ${q(s.name)}, ${q(s.role)}, ${q(s.colors[0])}, ${q(s.colors[1])}, ${i});`));
for (const s of staff) for (const sv of s.services) rows.push(`INSERT INTO staff_services (staff_id, service_id) VALUES (${q(s.id)}, ${q(sv)});`);
for (const sch of configSchedules) for (let wd = 0; wd < 7; wd++) { const w = sch.windows[wd]; if (w) rows.push(`INSERT INTO working_hours (staff_id, weekday, start_min, end_min) VALUES (${q(sch.id)}, ${wd}, ${w.start}, ${w.end});`); }
writeFileSync(new URL('../migrations/0002_seed_catalog.sql', import.meta.url), `-- GENERATED from shared/config.ts by scripts/gen-seed.mjs. Fictional studio, sample prices.\n${rows.join('\n')}\n`);
console.log(`wrote migrations/0002_seed_catalog.sql (${rows.length} rows)`);
