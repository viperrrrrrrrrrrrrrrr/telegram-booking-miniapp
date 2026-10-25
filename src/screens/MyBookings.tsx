import { useState } from 'react';
import { CalendarClock, CalendarPlus, X } from 'lucide-react';
import { dateKeyInTz } from '../../shared/time';
import type { Booking } from '../../shared/types';
import { Avatar, Skeleton, SoftButton, Spinner } from '../components/ui';
import { newIdempotencyKey, RepoError } from '../data/repository';
import { useTg } from '../telegram/TelegramProvider';
import { staffOf, svcOf, useApp } from '../state';
import { fmtDayNum, fmtMonth, fmtTime, fmtWeekday, money } from '../lib/format';

export function MyBookings() {
  const { bookings, catalog, setTab } = useApp();
  const now = Date.now();
  if (!bookings) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.end > now).sort((a, b) => a.start - b.start);
  const past = bookings.filter((b) => !(b.status === 'confirmed' && b.end > now)).sort((a, b) => b.start - a.start).slice(0, 10);

  return (
    <div data-testid="my-bookings">
      {upcoming.length === 0 && (
        <div className="mb-5 rounded-2xl bg-tg-section px-4 py-8 text-center" data-testid="no-bookings">
          <CalendarPlus className="mx-auto mb-2 size-8 text-tg-accent" aria-hidden="true" />
          <p className="text-[16px] font-medium">No upcoming bookings</p>
          <p className="mt-1 text-[14px] text-tg-hint">Pick a service and a time that suits you.</p>
          <SoftButton className="mt-3" onClick={() => setTab('book')}>Book now</SoftButton>
        </div>
      )}
      {upcoming.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">Upcoming</h2>
          <ul className="space-y-2">{upcoming.map((b) => <BookingCard key={b.id} b={b} />)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-1.5 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">History</h2>
          <ul className="overflow-hidden rounded-2xl bg-tg-section">
            {past.map((b) => (
              <li key={b.id} className="row-sep flex items-center gap-3 px-4 py-2.5 text-[14px]" data-testid="past-booking" data-status={b.status}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{svcOf(catalog, b.serviceId)?.name}</span>
                  <span className="text-tg-hint">{fmtWeekday(dateKeyInTz(b.start, catalog.timeZone))} {fmtDayNum(dateKeyInTz(b.start, catalog.timeZone))} {fmtMonth(dateKeyInTz(b.start, catalog.timeZone))}, {fmtTime(b.start, catalog.timeZone)}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${b.status === 'cancelled' ? 'bg-tg-destructive/10 text-tg-destructive' : 'bg-tg-hint/15 text-tg-hint'}`}>
                  {b.status === 'cancelled' ? 'Cancelled' : b.status === 'no_show' ? 'No-show' : 'Completed'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingCard({ b }: { b: Booking }) {
  const { catalog, repo, setBookings, setDraft, go, toast, bumpAvailability } = useApp();
  const { confirm, haptic } = useTg();
  const [busy, setBusy] = useState(false);
  const svc = svcOf(catalog, b.serviceId);
  const staff = staffOf(catalog, b.staffId);
  const tz = catalog.timeZone;
  const date = dateKeyInTz(b.start, tz);

  async function cancel() {
    haptic.impact('light');
    const ok = await confirm(`Cancel ${svc?.name} on ${fmtWeekday(date)} ${fmtDayNum(date)} ${fmtMonth(date)} at ${fmtTime(b.start, tz)}?`);
    if (!ok) return;
    setBusy(true);
    setBookings((l) => l.map((x) => (x.id === b.id ? { ...x, status: 'cancelled' } : x))); // optimistic
    try {
      const nb = await repo.cancelBooking(b.id, newIdempotencyKey());
      setBookings((l) => l.map((x) => (x.id === b.id ? nb : x)));
      haptic.notify('success');
      toast('Booking cancelled', 'success');
      bumpAvailability();
    } catch (e) {
      setBookings((l) => l.map((x) => (x.id === b.id ? b : x))); // roll back
      haptic.notify('error');
      toast(e instanceof RepoError ? e.message : 'Could not cancel', 'error');
    } finally { setBusy(false); }
  }
  function reschedule() {
    haptic.impact('light');
    setDraft({ serviceId: b.serviceId, staffId: b.staffId, reschedule: b, slot: undefined, date: undefined, comment: b.comment, clientName: b.clientName });
    go('time');
  }

  return (
    <li className="fade-in overflow-hidden rounded-2xl bg-tg-section" data-testid="booking-card" data-id={b.id} data-start={b.start}>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-tg-button/12 py-1.5 text-tg-accent" aria-hidden="true">
          <span className="text-[10px] font-semibold uppercase">{fmtWeekday(date)}</span>
          <span className="text-[18px] leading-6 font-bold tabular-nums">{fmtDayNum(date)}</span>
          <span className="text-[10px] font-medium">{fmtMonth(date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{svc?.name}</p>
          <p className="text-[14px] text-tg-hint" data-testid="booking-time">{fmtTime(b.start, tz)}–{fmtTime(b.end, tz)} · {money(b.priceCents, catalog.currency)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-tg-hint"><Avatar staff={staff} size={18} /> {staff?.name}</p>
        </div>
        {busy && <Spinner className="size-4 text-tg-hint" />}
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <SoftButton className="flex-1" onClick={reschedule} disabled={busy} data-testid="reschedule"><CalendarClock className="size-4" aria-hidden="true" />Reschedule</SoftButton>
        <SoftButton className="flex-1" tone="danger" onClick={cancel} disabled={busy} data-testid="cancel"><X className="size-4" aria-hidden="true" />Cancel</SoftButton>
      </div>
    </li>
  );
}
