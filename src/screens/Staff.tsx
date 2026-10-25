import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Avatar, Skeleton } from '../components/ui';
import { useBackButton, useMainButton, useTg } from '../telegram/TelegramProvider';
import { svcOf, useApp } from '../state';
import { duration, fmtTime, fmtDayShort, money } from '../lib/format';
import { dateKeyInTz } from '../../shared/time';
import type { DayAvailability } from '../../shared/types';

export function Staff() {
  const { catalog, draft, setDraft, go, back, repo, availabilityNonce } = useApp();
  const { haptic } = useTg();
  const svc = svcOf(catalog, draft.serviceId)!;
  const people = catalog.staff.filter((p) => p.services.includes(svc.id));
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  useBackButton(back);
  useMainButton({ text: 'Choose time' }, () => { haptic.impact('light'); go('time'); });

  useEffect(() => {
    let live = true;
    repo.getAvailability({ serviceId: svc.id, staffId: 'any', excludeBookingId: draft.reschedule?.id }).then((d) => live && setDays(d)).catch(() => live && setDays([]));
    return () => { live = false; };
  }, [repo, svc.id, draft.reschedule?.id, availabilityNonce]);

  const today = dateKeyInTz(Date.now(), catalog.timeZone);
  const nextFor = (id: string | 'any') => {
    if (!days) return null;
    for (const d of days) for (const s of d.slots) if (id === 'any' || s.staffIds.includes(id)) return `${d.date === today ? 'Today' : fmtDayShort(d.date)}, ${fmtTime(s.start, catalog.timeZone)}`;
    return 'No free times in the next 2 weeks';
  };
  const options = [{ id: 'any', name: 'Any specialist', role: 'Earliest available time', staff: null }, ...people.map((p) => ({ id: p.id, name: p.name, role: p.role, staff: p }))];

  return (
    <div>
      <SummaryCard title={svc.name} subtitle={`${duration(svc.durationMin)} · ${money(svc.priceCents, catalog.currency)}`} />
      <h1 className="mb-1.5 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">Choose a specialist</h1>
      <div role="radiogroup" aria-label="Specialist" className="overflow-hidden rounded-2xl bg-tg-section">
        {options.map((o, i) => {
          const selected = draft.staffId === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={selected} data-testid={`staff-${o.id}`}
              onClick={() => { if (!selected) haptic.select(); setDraft({ staffId: o.id, slot: undefined }); }}
              className="tap row-sep stagger flex w-full items-center gap-3 px-4 py-3 text-left" style={{ animationDelay: `${i * 40}ms` }}>
              {o.staff ? <Avatar staff={o.staff} /> : <span className="grid size-11 place-items-center rounded-full bg-tg-button/15 text-tg-accent" aria-hidden="true"><Sparkles className="size-5" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium">{o.name}</span>
                <span className="block text-[13px] text-tg-hint">{o.role}</span>
                <span className="mt-0.5 block text-[12px] text-tg-accent">{days ? <>Next: {nextFor(o.id)}</> : <Skeleton className="h-3 w-28" />}</span>
              </span>
              <span className={`grid size-6 place-items-center rounded-full border-2 transition-all ${selected ? 'scale-100 border-tg-button bg-tg-button text-tg-button-text' : 'border-tg-hint/50'}`} aria-hidden="true">
                {selected && <Check className="size-3.5 pop" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SummaryCard({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl bg-tg-section px-4 py-3">
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="text-[13px] text-tg-hint">{subtitle}</p>
      {children}
    </div>
  );
}
