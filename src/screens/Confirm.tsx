import { useMemo, useRef } from 'react';
import { CalendarDays, Clock, Lock, Sparkles } from 'lucide-react';
import { studio } from '../../shared/config';
import { dateKeyInTz } from '../../shared/time';
import { Avatar } from '../components/ui';
import { newIdempotencyKey, RepoError } from '../data/repository';
import { useBackButton, useMainButton, useTg } from '../telegram/TelegramProvider';
import { staffOf, svcOf, useApp } from '../state';
import { duration, fmtDayLong, fmtTime, money } from '../lib/format';

export function Confirm() {
  const app = useApp();
  const { catalog, draft, setDraft, back, repo } = app;
  const { haptic } = useTg();
  const svc = svcOf(catalog, draft.serviceId)!;
  const slot = draft.slot!;
  const tz = catalog.timeZone;
  const resched = draft.reschedule;
  // One idempotency key per (slot, attempt): a double tap or a retry never creates two bookings.
  const keyRef = useRef<{ slot: number; key: string } | null>(null);
  if (!keyRef.current || keyRef.current.slot !== slot.start) keyRef.current = { slot: slot.start, key: newIdempotencyKey() };
  const staff = draft.staffId === 'any' ? null : staffOf(catalog, draft.staffId);
  const candidates = useMemo(() => slot.staffIds.map((id) => staffOf(catalog, id)?.name).filter(Boolean).join(', '), [slot, catalog]);
  const nameOk = draft.clientName.trim().length > 0;

  useBackButton(back);
  useMainButton({ text: resched ? 'Confirm new time' : 'Confirm booking', enabled: nameOk }, () => { if (nameOk) void submit(); });

  async function submit() {
    const { setResult, go, backTo, setBookings, bumpAvailability, setConflictNotice, toast } = app;
    const kind = resched ? 'rescheduled' as const : 'new' as const;
    const preview = { serviceId: svc.id, staffId: draft.staffId === 'any' ? slot.staffIds[0] : draft.staffId, start: slot.start };
    haptic.impact('medium');
    setResult({ status: 'pending', kind, preview });
    go('success'); // optimistic: show the success screen right away, reconcile below
    try {
      const key = keyRef.current!.key;
      const b = resched
        ? await repo.rescheduleBooking(resched.id, { start: slot.start, staffId: draft.staffId }, key)
        : await repo.createBooking({ serviceId: svc.id, staffId: draft.staffId, start: slot.start, comment: draft.comment.trim(), clientName: draft.clientName.trim() }, key);
      setResult({ status: 'done', kind, preview, booking: b });
      setBookings((list) => [b, ...list.filter((x) => x.id !== b.id)]);
      haptic.notify('success');
    } catch (e) {
      haptic.notify('error');
      setResult(null);
      keyRef.current = null;
      if (e instanceof RepoError && e.code === 'slot_taken') {
        setConflictNotice(`Sorry, ${fmtTime(slot.start, tz)} was just booked by someone else. We refreshed the free times for you.`);
        setDraft({ slot: undefined });
        bumpAvailability();
        backTo('time');
      } else {
        backTo('confirm');
        toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
      }
    }
  }

  return (
    <div>
      <h1 className="mb-3 px-1 text-[22px] font-bold tracking-tight">{resched ? 'Confirm the new time' : 'Check your booking'}</h1>
      <div className="mb-4 overflow-hidden rounded-2xl bg-tg-section" data-testid="confirm-card">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div>
            <p className="text-[18px] font-semibold">{svc.name}</p>
            <p className="text-[13px] text-tg-hint">{svc.description}</p>
          </div>
          <p className="text-[20px] font-bold tabular-nums">{money(svc.priceCents, catalog.currency)}</p>
        </div>
        <dl className="text-[15px]">
          <Row icon={<CalendarDays className="size-[18px]" />} label="When">
            {resched && <span className="mr-1.5 text-tg-hint line-through">{fmtTime(resched.start, tz)}</span>}
            <span data-testid="confirm-when">{fmtDayLong(dateKeyInTz(slot.start, tz))}, {fmtTime(slot.start, tz)}</span>
          </Row>
          <Row icon={<Clock className="size-[18px]" />} label="Duration">{duration(svc.durationMin)} · until {fmtTime(slot.start + svc.durationMin * 60000, tz)}</Row>
          <Row icon={staff ? <Avatar staff={staff} size={22} /> : <Sparkles className="size-[18px]" />} label="Specialist">
            {staff ? staff.name : <>Any specialist <span className="text-tg-hint">({candidates} free)</span></>}
          </Row>
        </dl>
      </div>

      {!resched && (
        <div className="mb-4 space-y-3 rounded-2xl bg-tg-section px-4 py-4">
          <div>
            <label htmlFor="client-name" className="mb-1 block text-[13px] font-medium text-tg-hint">Your name</label>
            <input id="client-name" data-testid="client-name" autoComplete="given-name" maxLength={60} value={draft.clientName}
              onChange={(e) => setDraft({ clientName: e.target.value })}
              className="h-11 w-full rounded-xl bg-tg-bg px-3 text-[16px] outline-none placeholder:text-tg-hint focus-visible:ring-2 focus-visible:ring-tg-button" placeholder="First name" />
          </div>
          <div>
            <label htmlFor="comment" className="mb-1 flex justify-between text-[13px] font-medium text-tg-hint">
              <span>Comment <span className="font-normal">(optional)</span></span>
              <span aria-hidden="true" className="tabular-nums">{draft.comment.length}/{catalog.commentMax}</span>
            </label>
            <textarea id="comment" data-testid="comment" rows={3} maxLength={catalog.commentMax} value={draft.comment}
              onChange={(e) => setDraft({ comment: e.target.value })}
              className="w-full resize-none rounded-xl bg-tg-bg px-3 py-2.5 text-[16px] outline-none placeholder:text-tg-hint focus-visible:ring-2 focus-visible:ring-tg-button"
              placeholder="e.g. short almond shape, nude colours" />
          </div>
        </div>
      )}

      <p className="flex gap-2 px-2 text-[13px] leading-snug text-tg-hint" data-testid="confirm-privacy">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{repo.mode === 'demo' ? `${studio.privacyNote} No real appointment is made.` : 'Your booking is sent to the studio and confirmed in this Telegram chat. Free cancellation from “My bookings”.'}</span>
      </p>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="row-sep flex items-center gap-3 px-4 py-3">
      <span className="grid size-7 place-items-center text-tg-accent" aria-hidden="true">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
