import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Globe } from 'lucide-react';
import { Skeleton } from '../components/ui';
import { SummaryCard } from './Staff';
import { useBackButton, useMainButton, useTg } from '../telegram/TelegramProvider';
import { staffOf, svcOf, useApp } from '../state';
import { deviceTzDiffers, duration, fmtDayLong, fmtDayNum, fmtMonth, fmtTime, fmtWeekday, partOfDay, tzCity } from '../lib/format';
import { addDays, dateKeyInTz } from '../../shared/time';
import type { DayAvailability } from '../../shared/types';

export function Time() {
  const { catalog, draft, setDraft, go, back, repo, availabilityNonce, bumpAvailability, conflictNotice, setConflictNotice } = useApp();
  const { haptic } = useTg();
  const svc = svcOf(catalog, draft.serviceId)!;
  const tz = catalog.timeZone;
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [error, setError] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const resched = draft.reschedule;
  useBackButton(() => { setConflictNotice(null); back(); });
  const label = draft.slot ? `${resched ? 'Review new time' : 'Continue'} · ${fmtTime(draft.slot.start, tz)}` : 'Select a time';
  useMainButton({ text: label, enabled: !!draft.slot }, () => { if (draft.slot) { haptic.impact('light'); setConflictNotice(null); go('confirm'); } });

  useEffect(() => {
    let live = true;
    setError(false);
    repo.getAvailability({ serviceId: svc.id, staffId: draft.staffId, excludeBookingId: resched?.id })
      .then((d) => {
        if (!live) return;
        setDays(d);
        // keep the chosen date if still valid; else first date with free slots
        setDraft((dr) => {
          const keep = dr.date && d.some((x) => x.date === dr.date);
          const date = keep ? dr.date : (d.find((x) => x.slots.length)?.date ?? d[0]?.date);
          const slotOk = dr.slot && d.find((x) => x.date === date)?.slots.some((s) => s.start === dr.slot!.start);
          return { ...dr, date, slot: slotOk ? dr.slot : undefined };
        });
      })
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, [repo, svc.id, draft.staffId, resched?.id, availabilityNonce, setDraft]);

  // Scroll the selected date chip into view
  useEffect(() => {
    const el = stripRef.current?.querySelector('[aria-pressed="true"]') as HTMLElement | null;
    el?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [draft.date, days]);

  const today = dateKeyInTz(Date.now(), tz);
  const day = days?.find((d) => d.date === draft.date);
  const groups = useMemo(() => {
    const g: Record<string, NonNullable<typeof day>['slots']> = {};
    for (const s of day?.slots ?? []) (g[partOfDay(s.start, tz)] ??= []).push(s);
    return Object.entries(g);
  }, [day, tz]);
  const staffName = draft.staffId === 'any' ? 'Any specialist' : staffOf(catalog, draft.staffId)?.name;
  const nextFree = days?.find((d) => d.date > (draft.date ?? '') && d.slots.length);

  return (
    <div>
      <SummaryCard title={svc.name} subtitle={`${duration(svc.durationMin)} · ${staffName}`}>
        {resched && <p className="mt-1 text-[13px] text-tg-accent">Rescheduling from {fmtDayLong(dateKeyInTz(resched.start, tz))}, {fmtTime(resched.start, tz)}</p>}
      </SummaryCard>

      {conflictNotice && (
        <div role="alert" data-testid="conflict-notice" className="shake mb-4 flex gap-2.5 rounded-2xl bg-tg-destructive/10 px-4 py-3 text-[14px] text-tg-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-tg-destructive" aria-hidden="true" />
          <span>{conflictNotice}</span>
        </div>
      )}

      <h1 className="mb-2 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">Pick a day</h1>
      <div ref={stripRef} className="no-scrollbar -mx-3 mb-4 flex snap-x gap-2 overflow-x-auto px-3 pb-1" data-testid="date-strip">
        {(days ?? Array.from({ length: catalog.horizonDays }, (_, i) => ({ date: addDays(today, i), slots: null as null | [] }))).map((d, i) => {
          const sel = d.date === draft.date;
          const count = d.slots?.length ?? 0;
          const loading = !days;
          return (
            <button key={d.date} type="button" aria-pressed={sel} disabled={loading} data-testid={`day-${d.date}`} data-count={count}
              onClick={() => { haptic.select(); setDraft({ date: d.date, slot: undefined }); }}
              className={`tap stagger flex w-[54px] shrink-0 snap-start flex-col items-center rounded-2xl py-2 transition-colors ${sel ? 'bg-tg-button text-tg-button-text shadow-md' : 'bg-tg-section'} ${!loading && !count && !sel ? 'opacity-55' : ''}`}
              style={{ animationDelay: `${i * 18}ms` }}>
              <span className="sr-only">{`${d.date === today ? 'Today, ' : ''}${fmtDayLong(d.date)}${loading ? '' : count ? `, ${count} free times` : ', fully booked'}`}</span>
              <span aria-hidden="true" className={`text-[11px] font-medium uppercase ${sel ? '' : 'text-tg-hint'}`}>{d.date === today ? 'Today' : fmtWeekday(d.date)}</span>
              <span aria-hidden="true" className="text-[19px] leading-7 font-semibold tabular-nums">{fmtDayNum(d.date)}</span>
              <span aria-hidden="true" className={`text-[10px] ${sel ? '' : 'text-tg-hint'}`}>{fmtMonth(d.date)}</span>
              <span aria-hidden="true" className={`mt-1 h-1 w-1 rounded-full ${loading ? 'bg-transparent' : count ? (sel ? 'bg-tg-button-text' : 'bg-tg-button') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {deviceTzDiffers(tz) && (
        <p className="mb-3 flex items-center gap-1.5 px-4 text-[12px] text-tg-hint"><Globe className="size-3.5" aria-hidden="true" /> Times are in studio time ({tzCity(tz)}).</p>
      )}

      <div aria-live="polite">
        {error && <p className="rounded-2xl bg-tg-section px-4 py-6 text-center text-[15px]">Couldn't load times. <button type="button" className="font-semibold text-tg-link underline" onClick={() => { setDays(null); bumpAvailability(); }}>Retry</button></p>}
        {!days && !error && (
          <div className="grid grid-cols-4 gap-2" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        )}
        {day && !day.slots.length && (
          <div className="rounded-2xl bg-tg-section px-4 py-6 text-center" data-testid="no-slots">
            <p className="text-[16px] font-medium">{draft.date === today ? 'No more free times today' : 'Fully booked'}</p>
            <p className="mt-1 text-[14px] text-tg-hint">{nextFree ? 'The next free day is closer than you think.' : 'Try another specialist.'}</p>
            {nextFree && (
              <button type="button" onClick={() => { haptic.select(); setDraft({ date: nextFree.date, slot: undefined }); }} className="tap mt-3 rounded-xl bg-tg-button/12 px-4 py-2 text-[14px] font-semibold text-tg-accent">
                Show {fmtDayLong(nextFree.date)}
              </button>
            )}
          </div>
        )}
        {day && day.slots.length > 0 && (
          <div key={day.date} data-testid="slots">
            {groups.map(([name, slots]) => (
              <section key={name} className="mb-4">
                <h2 className="mb-2 px-1 text-[13px] font-medium text-tg-hint">{name}</h2>
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s, i) => {
                    const sel = draft.slot?.start === s.start;
                    return (
                      <button key={s.start} type="button" aria-pressed={sel} data-testid="slot" data-start={s.start}
                        onClick={() => { haptic.select(); setDraft({ slot: s }); }}
                        className={`tap slot-in h-11 rounded-xl text-[15px] font-semibold tabular-nums transition-all ${sel ? 'scale-[1.04] bg-tg-button text-tg-button-text shadow-md' : 'bg-tg-section'}`}
                        style={{ animationDelay: `${Math.min(i, 12) * 14}ms` }}>
                        {fmtTime(s.start, tz)}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
