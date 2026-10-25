import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Moon, Sun } from 'lucide-react';
import { studio } from '../shared/config';
import type { Booking, Catalog, Me } from '../shared/types';
import { Spinner } from './components/ui';
import { chooseRepository } from './data';
import type { BookingRepository } from './data/repository';
import { useTg } from './telegram/TelegramProvider';
import { AppCtx, type AppState, type Draft, type Result, type Screen, type Tab, type Toast } from './state';
import { Home } from './screens/Home';
import { Staff } from './screens/Staff';
import { Time } from './screens/Time';
import { Confirm } from './screens/Confirm';
import { Success } from './screens/Success';

const ADMIN_KEY = 'petalune.demoAdmin';
const TITLES: Record<Screen, string> = { home: studio.name, staff: 'Specialist', time: 'Date & time', confirm: 'Confirm', success: 'Booked' };

export default function App() {
  const tg = useTg();
  const [boot, setBoot] = useState<{ repo: BookingRepository; catalog: Catalog; me: Me } | null>(null);
  const [bootError, setBootError] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { repo, me } = await chooseRepository({ initData: tg.initData, firstName: tg.firstName });
      const catalog = await repo.getCatalog();
      if (live) setBoot({ repo, catalog, me });
      document.documentElement.dataset.mode = repo.mode;
    })().catch(() => live && setBootError(true));
    return () => { live = false; };
  }, [tg.initData, tg.firstName]);

  if (!boot) return (
    <div className="grid min-h-[var(--app-vh,100dvh)] place-items-center text-tg-hint">
      {bootError ? <p>Something went wrong. Please reopen the app.</p> : <Spinner className="size-6" />}
    </div>
  );
  return <Booked {...boot} />;
}

function Booked({ repo, catalog, me }: { repo: BookingRepository; catalog: Catalog; me: Me }) {
  const tg = useTg();
  const [stack, setStack] = useState<Screen[]>(['home']);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [tab, setTab] = useState<Tab>('book');
  const blank = useCallback((): Draft => ({ staffId: 'any', comment: '', clientName: tg.firstName !== 'Guest' ? tg.firstName : '' }), [tg.firstName]);
  const [draft, setDraftState] = useState<Draft>(blank);
  const [bookings, setBookingsState] = useState<Booking[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [demoAdmin, setDemoAdminState] = useState(() => repo.mode === 'demo' && localStorage.getItem(ADMIN_KEY) === '1');
  const [availabilityNonce, setNonce] = useState(0);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const screen = stack[stack.length - 1];

  const refreshBookings = useCallback(async () => {
    try { setBookingsState(await repo.listMyBookings()); } catch { setBookingsState((b) => b ?? []); }
  }, [repo]);
  useEffect(() => { void refreshBookings(); }, [refreshBookings]);

  const toastId = useRef(0);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const state: AppState = {
    repo, catalog, me, screen, tab, setTab,
    go: (s) => { setDir('fwd'); setStack((st) => [...st, s]); },
    back: () => { tg.haptic.select(); setDir('back'); setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)); },
    backTo: (s) => { setDir('back'); setStack((st) => { const i = st.lastIndexOf(s); return i >= 0 ? st.slice(0, i + 1) : ['home', s]; }); },
    draft,
    setDraft: useCallback((u) => setDraftState((d) => (typeof u === 'function' ? u(d) : { ...d, ...u })), []),
    resetDraft: () => setDraftState(blank()),
    bookings,
    setBookings: (fn) => setBookingsState((b) => fn(b ?? [])),
    refreshBookings, result, setResult, toast,
    adminEnabled: repo.mode === 'api' ? me.isAdmin : demoAdmin,
    demoAdmin,
    setDemoAdmin: (v) => { setDemoAdminState(v); localStorage.setItem(ADMIN_KEY, v ? '1' : '0'); },
    availabilityNonce, bumpAvailability: useCallback(() => setNonce((n) => n + 1), []),
    conflictNotice, setConflictNotice,
  };

  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen]);

  return (
    <AppCtx.Provider value={state}>
      <div className="app-shell mx-auto flex min-h-[var(--app-vh,100dvh)] w-full max-w-[480px] flex-col">
        {!tg.isTelegram && <BrowserHeader title={TITLES[screen]} />}
        <main key={stack.join('/')} className={`flex-1 px-3 pt-3 ${tg.isTelegram ? 'pb-6' : 'pb-28'} ${dir === 'fwd' ? 'screen-fwd' : 'screen-back'}`} data-screen={screen}>
          {screen === 'home' && <Home />}
          {screen === 'staff' && <Staff />}
          {screen === 'time' && <Time />}
          {screen === 'confirm' && <Confirm />}
          {screen === 'success' && <Success />}
        </main>
        {!tg.isTelegram && <BrowserMainButton />}
      </div>
      <Toasts toasts={toasts} />
      <ConfirmDialog />
    </AppCtx.Provider>
  );
}

/** Stand-in for Telegram's own header + BackButton when opened in a normal browser. */
function BrowserHeader({ title }: { title: string }) {
  const { back, scheme, toggleScheme } = useTg();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-tg-header/90 px-2 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }} data-testid="browser-header">
      <div className="w-24">
        {back ? (
          <button type="button" onClick={back} data-testid="browser-back" className="tap inline-flex min-h-11 items-center gap-0.5 rounded-xl pr-2 text-[16px] text-tg-link">
            <ChevronLeft className="size-6" aria-hidden="true" />Back
          </button>
        ) : (
          <span className="ml-1.5 inline-flex items-center gap-2"><img src="/favicon.svg" alt="" width="28" height="28" className="rounded-full" /></span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className="truncate text-[16px] font-semibold">{title}</p>
        <p className="text-[12px] text-tg-hint">mini app · browser preview</p>
      </div>
      <div className="flex w-24 justify-end">
        <button type="button" onClick={toggleScheme} data-testid="theme-toggle" aria-label={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="tap grid size-11 place-items-center rounded-full text-tg-link">
          {scheme === 'dark' ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

/** Stand-in for Telegram's MainButton. */
function BrowserMainButton() {
  const { main, mainClick } = useTg();
  return (
    <div className={`fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-tg-bg/85 px-3 pt-2 backdrop-blur-md transition-[translate,visibility] duration-300 ${main.visible ? 'visible translate-y-0' : 'pointer-events-none invisible translate-y-full'}`}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} aria-hidden={!main.visible}>
      <button type="button" data-testid="main-button" disabled={!main.enabled || main.progress} tabIndex={main.visible ? 0 : -1} onClick={mainClick}
        className="tap flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tg-button text-[16px] font-semibold text-tg-button-text shadow-lg transition-opacity disabled:opacity-55">
        {main.progress && <Spinner className="size-4" />}
        {main.text}
      </button>
    </div>
  );
}
function Toasts({ toasts }: { toasts: Toast[] }) {
  const { isTelegram } = useTg();
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-[480px] flex-col items-center gap-2 px-4 ${isTelegram ? 'bottom-4' : 'bottom-24'}`}>
      {toasts.map((t) => (
        <div key={t.id} data-testid="toast" className={`toast-in rounded-full px-4 py-2.5 text-[14px] font-medium shadow-lg ${t.tone === 'error' ? 'bg-tg-destructive text-white' : 'bg-tg-text text-tg-section'}`}>{t.text}</div>
      ))}
    </div>
  );
}

function ConfirmDialog() {
  const { confirmRequest, settleConfirm } = useTg();
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmRequest) okRef.current?.focus(); }, [confirmRequest]);
  useEffect(() => {
    if (!confirmRequest) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') settleConfirm(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [confirmRequest, settleConfirm]);
  if (!confirmRequest) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6 fade-in" onClick={() => settleConfirm(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cd-msg" data-testid="confirm-dialog" onClick={(e) => e.stopPropagation()}
        className="dialog-in w-full max-w-[300px] overflow-hidden rounded-2xl bg-tg-section text-center shadow-2xl">
        <p id="cd-msg" className="px-5 pt-5 pb-4 text-[15px] leading-snug">{confirmRequest.message}</p>
        <div className="grid grid-cols-2 border-t border-tg-separator">
          <button type="button" onClick={() => settleConfirm(false)} className="tap min-h-12 border-r border-tg-separator text-[16px] text-tg-link">No</button>
          <button ref={okRef} type="button" data-testid="confirm-ok" onClick={() => settleConfirm(true)} className="tap min-h-12 text-[16px] font-semibold text-tg-destructive">Yes</button>
        </div>
      </div>
    </div>
  );
}
