import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Plus, RefreshCw, Trash2, UserX } from 'lucide-react';
import { addDays, dateKeyInTz, fmtHm, zonedToUtcMs } from '../../shared/time';
import type { Booking, TimeOff } from '../../shared/types';
import { Avatar, SoftButton, Spinner } from '../components/ui';
import { RepoError } from '../data/repository';
import { useTg } from '../telegram/TelegramProvider';
import { staffOf, svcOf, useApp } from '../state';
import { fmtDayNum, fmtTime, fmtWeekday, money } from '../lib/format';

const POLL_MS = 15000;

export function Admin() {
  const { repo, catalog, toast, bumpAvailability } = useApp();
  const { haptic, confirm } = useTg();
  const tz = catalog.timeZone;
  const today = dateKeyInTz(Date.now(), tz);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<{ bookings: Booking[]; timeOff: TimeOff[] } | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, u] = await Promise.all([repo.admin.schedule(date), repo.admin.upcoming(7)]);
      setData(d); setUpcoming(u); setUpdatedAt(Date.now());
    } catch (e) {
      toast(e instanceof RepoError ? e.message : 'Could not load the schedule', 'error');
    } finally { setLoading(false); }
  }, [repo, date, toast]);

  // Live refresh: poll while the tab is visible.
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    const list: ({ t: 'b'; b: Booking } | { t: 'o'; o: TimeOff })[] = [
      ...data.bookings.filter((b) => b.status !== 'cancelled').map((b) => ({ t: 'b' as const, b })),
      ...data.timeOff.map((o) => ({ t: 'o' as const, o })),
    ];
    return list.sort((x, y) => (x.t === 'b' ? x.b.start : x.o.start) - (y.t === 'b' ? y.b.start : y.o.start));
  }, [data]);
  const confirmed = data?.bookings.filter((b) => b.status === 'confirmed') ?? [];
  const revenue = confirmed.reduce((s, b) => s + b.priceCents, 0);
  const hours = confirmed.reduce((s, b) => s + b.durationMin, 0) / 60;
  const now = Date.now();

  async function noShow(b: Booking) {
    if (!(await confirm(`Mark ${b.customer?.firstName ?? b.clientName} as a no-show?`))) return;
    try { await repo.admin.markNoShow(b.id); haptic.notify('warning'); toast('Marked as no-show', 'info'); void load(); }
    catch (e) { toast(e instanceof RepoError ? e.message : 'Failed', 'error'); }
  }
  async function unblock(o: TimeOff) {
    try { await repo.admin.unblock(o.id); haptic.impact('light'); toast('Time unblocked', 'info'); bumpAvailability(); void load(); }
    catch (e) { toast(e instanceof RepoError ? e.message : 'Failed', 'error'); }
  }

  return (
    <div data-testid="admin">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Studio schedule</h2>
          <p className="flex items-center gap-1.5 text-[12px] text-tg-hint">
            <span aria-hidden="true" className="live-dot size-2 rounded-full bg-emerald-500" />
            Live · refreshes every 15 s{updatedAt ? ` · ${fmtTime(updatedAt, tz)}` : ''}{repo.mode === 'demo' ? ' · sample data' : ''}
          </p>
        </div>
        <button type="button" aria-label="Refresh" onClick={() => { haptic.impact('light'); void load(); }} className="tap grid size-11 place-items-center rounded-full bg-tg-section text-tg-accent">
          {loading ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => (
          <button key={d} type="button" aria-pressed={d === date} onClick={() => { haptic.select(); setDate(d); setData(null); }}
            className={`tap min-h-10 shrink-0 rounded-full px-3.5 text-[14px] font-medium ${d === date ? 'bg-tg-button text-tg-button-text' : 'bg-tg-section'}`}>
            {d === today ? 'Today' : `${fmtWeekday(d)} ${fmtDayNum(d)}`}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        {[['Bookings', String(confirmed.length)], ['Booked', `${hours.toFixed(1)} h`], ['Sample revenue', money(revenue, catalog.currency)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-tg-section px-2 py-2.5">
            <p className="text-[17px] font-bold tabular-nums">{data ? v : '–'}</p>
            <p className="text-[11px] text-tg-hint">{k}</p>
          </div>
        ))}
      </div>

      <div className="mb-1.5 flex items-center justify-between px-4">
        <h3 className="text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">Timeline</h3>
        <button type="button" onClick={() => { haptic.select(); setShowForm((v) => !v); }} data-testid="block-open" className="tap inline-flex min-h-9 items-center gap-1 text-[14px] font-semibold text-tg-accent">
          <Plus className="size-4" aria-hidden="true" />Block time
        </button>
      </div>
      {showForm && <BlockForm date={date} onDone={() => { setShowForm(false); bumpAvailability(); void load(); }} />}

      <ol className="mb-5 overflow-hidden rounded-2xl bg-tg-section" data-testid="timeline">
        {data && items.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-tg-hint">Nothing scheduled.</li>}
        {!data && <li className="px-4 py-6 text-center"><Spinner className="size-5 text-tg-hint" /></li>}
        {items.map((it) => it.t === 'b' ? (
          <li key={it.b.id} className={`row-sep flex items-center gap-3 px-4 py-2.5 ${it.b.status === 'no_show' ? 'opacity-60' : ''}`} data-testid="admin-booking">
            <span className="w-[46px] shrink-0 text-[13px] leading-tight font-semibold tabular-nums">{fmtTime(it.b.start, tz)}<br /><span className="font-normal text-tg-hint">{fmtTime(it.b.end, tz)}</span></span>
            <span aria-hidden="true" className={`h-9 w-1 shrink-0 rounded-full ${it.b.start <= now && it.b.end > now ? 'bg-emerald-500' : 'bg-tg-button/60'}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{svcOf(catalog, it.b.serviceId)?.name}</span>
              <span className="flex items-center gap-1.5 truncate text-[13px] text-tg-hint">
                <Avatar staff={staffOf(catalog, it.b.staffId)} size={16} />{staffOf(catalog, it.b.staffId)?.name} · {it.b.customer?.firstName ?? it.b.clientName}
                {it.b.status === 'no_show' && <span className="text-tg-destructive">· no-show</span>}
              </span>
            </span>
            {it.b.status === 'confirmed' && it.b.start <= now && (
              <button type="button" aria-label="Mark as no-show" onClick={() => noShow(it.b)} className="tap grid size-9 place-items-center rounded-full text-tg-destructive"><UserX className="size-4" aria-hidden="true" /></button>
            )}
          </li>
        ) : (
          <li key={it.o.id} className="row-sep flex items-center gap-3 bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgb(127_127_127/0.08)_8px_16px)] px-4 py-2.5" data-testid="admin-timeoff">
            <span className="w-[46px] shrink-0 text-[13px] leading-tight font-semibold tabular-nums">{fmtTime(it.o.start, tz)}<br /><span className="font-normal text-tg-hint">{fmtTime(it.o.end, tz)}</span></span>
            <Ban className="size-4 shrink-0 text-tg-hint" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[14px]"><span className="font-medium">Blocked</span> <span className="text-tg-hint">· {it.o.staffId ? staffOf(catalog, it.o.staffId)?.name : 'Whole studio'}{it.o.reason ? ` · ${it.o.reason}` : ''}</span></span>
            <button type="button" aria-label="Remove block" onClick={() => unblock(it.o)} className="tap grid size-9 place-items-center rounded-full text-tg-hint"><Trash2 className="size-4" aria-hidden="true" /></button>
          </li>
        ))}
      </ol>

      <h3 className="mb-1.5 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">Upcoming · 7 days</h3>
      <ul className="mb-5 overflow-hidden rounded-2xl bg-tg-section" data-testid="upcoming">
        {upcoming?.filter((b) => b.source !== 'demo-seed').slice(0, 12).map((b) => (
          <li key={b.id} className="row-sep flex items-center gap-3 px-4 py-2.5 text-[14px]">
            <span className="w-[86px] shrink-0 font-medium tabular-nums">{fmtWeekday(dateKeyInTz(b.start, tz))} {fmtDayNum(dateKeyInTz(b.start, tz))}, {fmtTime(b.start, tz)}</span>
            <span className="min-w-0 flex-1 truncate">{svcOf(catalog, b.serviceId)?.name} <span className="text-tg-hint">· {b.customer?.firstName ?? b.clientName}</span></span>
          </li>
        ))}
        {upcoming && upcoming.filter((b) => b.source !== 'demo-seed').length === 0 && <li className="px-4 py-4 text-center text-[14px] text-tg-hint">{repo.mode === 'demo' ? 'Client bookings made in this browser show up here.' : 'No upcoming bookings.'}</li>}
      </ul>
    </div>
  );
}

function BlockForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { repo, catalog, toast } = useApp();
  const { haptic } = useTg();
  const [staffId, setStaffId] = useState<string>('');
  const [from, setFrom] = useState(13 * 60);
  const [to, setTo] = useState(14 * 60);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const opts = Array.from({ length: (22 - 8) * 2 + 1 }, (_, i) => 8 * 60 + i * 30);
  async function save() {
    if (to <= from) { toast('End must be after start', 'error'); return; }
    setSaving(true);
    try {
      const tz = catalog.timeZone;
      await repo.admin.blockTime({ staffId: staffId || null, start: zonedToUtcMs(date, from, tz), end: zonedToUtcMs(date, to, tz), reason: reason.trim() });
      haptic.notify('success');
      toast('Time blocked. Clients can no longer book it.', 'success');
      onDone();
    } catch (e) { haptic.notify('error'); toast(e instanceof RepoError ? e.message : 'Failed', 'error'); }
    finally { setSaving(false); }
  }
  const field = 'h-11 w-full rounded-xl bg-tg-bg px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-tg-button';
  return (
    <div className="fade-in mb-3 grid grid-cols-2 gap-2.5 rounded-2xl bg-tg-section p-3" data-testid="block-form">
      <label className="col-span-2 text-[13px] text-tg-hint">Who
        <select className={`${field} mt-1 text-tg-text`} value={staffId} onChange={(e) => setStaffId(e.target.value)} data-testid="block-staff">
          <option value="">Whole studio</option>
          {catalog.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="text-[13px] text-tg-hint">From
        <select className={`${field} mt-1 text-tg-text`} value={from} onChange={(e) => setFrom(+e.target.value)} data-testid="block-from">{opts.map((m) => <option key={m} value={m}>{fmtHm(m)}</option>)}</select>
      </label>
      <label className="text-[13px] text-tg-hint">To
        <select className={`${field} mt-1 text-tg-text`} value={to} onChange={(e) => setTo(+e.target.value)} data-testid="block-to">{opts.map((m) => <option key={m} value={m}>{fmtHm(m)}</option>)}</select>
      </label>
      <label className="col-span-2 text-[13px] text-tg-hint">Reason (optional)
        <input className={`${field} mt-1 text-tg-text`} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Training" />
      </label>
      <SoftButton className="col-span-2 bg-tg-button! text-tg-button-text!" onClick={save} disabled={saving} data-testid="block-save">{saving ? <Spinner className="size-4" /> : 'Block this time'}</SoftButton>
    </div>
  );
}
