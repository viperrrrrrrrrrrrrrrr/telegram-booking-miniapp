import { CalendarDays } from 'lucide-react';
import { dateKeyInTz } from '../../shared/time';
import { Avatar, SoftButton } from '../components/ui';
import { useBackButton, useMainButton, useTg } from '../telegram/TelegramProvider';
import { staffOf, svcOf, useApp } from '../state';
import { fmtDayLong, fmtTime, money } from '../lib/format';

export function Success() {
  const { result, catalog, repo, resetDraft, setTab, backTo } = useApp();
  const { haptic } = useTg();
  const pending = result?.status !== 'done';
  const done = () => { haptic.impact('light'); resetDraft(); setTab('book'); backTo('home'); };
  useBackButton(null);
  useMainButton({ text: 'Done', enabled: !pending, progress: pending }, done);
  if (!result) return null;
  const b = result.booking;
  const svc = svcOf(catalog, b?.serviceId ?? result.preview.serviceId)!;
  const staff = staffOf(catalog, b?.staffId ?? result.preview.staffId);
  const start = b?.start ?? result.preview.start;
  const tz = catalog.timeZone;

  return (
    <div className="flex flex-col items-center pt-6 text-center" data-testid="success" data-status={result.status}>
      <div className="relative mb-5 grid size-24 place-items-center">
        <span aria-hidden="true" className={`absolute inset-0 rounded-full bg-tg-button/15 ${pending ? 'pulse' : 'ring-burst'}`} />
        <svg viewBox="0 0 52 52" className="relative size-20" aria-hidden="true">
          <circle cx="26" cy="26" r="24" className={`fill-tg-button ${pending ? 'opacity-40' : 'circle-in'}`} />
          {!pending && <path d="M15 27 l7 7 l15 -16" className="check-draw stroke-tg-button-text" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      <h1 className="text-[24px] font-bold tracking-tight" aria-live="polite">
        {pending ? 'Booking your time…' : result.kind === 'rescheduled' ? 'Time changed!' : "You're booked!"}
      </h1>
      <p className="mt-1 max-w-[300px] text-[15px] text-tg-hint">
        {pending ? 'Holding your slot.' : repo.mode === 'api' ? 'A confirmation is on its way to your Telegram chat. We will also remind you 24 h and 2 h before.' : 'Saved on this device. It is a demo, so no real appointment was made.'}
      </p>

      <div className="mt-6 w-full overflow-hidden rounded-2xl bg-tg-section text-left">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar staff={staff} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">{svc.name}</p>
            <p className="text-[13px] text-tg-hint">with {staff?.name ?? 'any specialist'}</p>
          </div>
          <p className="font-semibold tabular-nums">{money(svc.priceCents, catalog.currency)}</p>
        </div>
        <div className="row-sep flex items-center gap-3 px-4 py-3 text-[15px]">
          <CalendarDays className="size-[18px] text-tg-accent" aria-hidden="true" />
          <span data-testid="success-when">{fmtDayLong(dateKeyInTz(start, tz))}, {fmtTime(start, tz)}</span>
        </div>
      </div>

      {!pending && (
        <div className="mt-4 flex gap-2 fade-in">
          <SoftButton onClick={() => { resetDraft(); setTab('bookings'); backTo('home'); }} data-testid="to-bookings">View my bookings</SoftButton>
        </div>
      )}
    </div>
  );
}
