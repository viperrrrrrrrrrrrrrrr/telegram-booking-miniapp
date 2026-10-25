import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyTheme } from './theme';
import { getWebApp, safe, type TgWebApp } from './webapp';

export interface MainButtonState { text: string; visible: boolean; enabled: boolean; progress: boolean }
interface ConfirmRequest { message: string; resolve: (ok: boolean) => void }

interface TgContext {
  wa: TgWebApp | null;
  isTelegram: boolean;
  scheme: 'light' | 'dark';
  toggleScheme: () => void;
  firstName: string;
  initData: string;
  haptic: { select: () => void; impact: (s?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void; notify: (t: 'success' | 'error' | 'warning') => void };
  main: MainButtonState;
  setMain: (s: MainButtonState, onClick: () => void) => void;
  back: (() => void) | null;
  setBack: (fn: (() => void) | null) => void;
  confirm: (message: string) => Promise<boolean>;
  confirmRequest: ConfirmRequest | null;
  settleConfirm: (ok: boolean) => void;
  /** Fires the current MainButton action (used by the in-page button in browsers). */
  mainClick: () => void;
}
const Ctx = createContext<TgContext | null>(null);
export const useTg = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('TelegramProvider missing');
  return c;
};

const THEME_KEY = 'petalune.theme';
const HIDDEN: MainButtonState = { text: '', visible: false, enabled: false, progress: false };

export function TelegramProvider({ children }: { children: ReactNode }) {
  const wa = useMemo(() => getWebApp(), []);
  const isTelegram = !!wa;
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => {
    if (wa) return wa.colorScheme === 'dark' ? 'dark' : 'light';
    const saved = safe(() => localStorage.getItem(THEME_KEY));
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Theme: follow Telegram themeParams live, or the browser toggle.
  useLayoutEffect(() => {
    if (!wa) { applyTheme(scheme); return; }
    const sync = () => {
      const s = wa.colorScheme === 'dark' ? 'dark' : 'light';
      setScheme(s);
      const c = applyTheme(s, wa.themeParams);
      safe(() => wa.setHeaderColor('secondary_bg_color'));
      safe(() => wa.setBackgroundColor(c.bg));
      if (wa.isVersionAtLeast?.('7.10')) safe(() => wa.setBottomBarColor?.(c.bottom));
    };
    sync();
    wa.onEvent('themeChanged', sync);
    return () => wa.offEvent('themeChanged', sync);
  }, [wa, scheme]);

  // Lifecycle: ready + expand, swipe guard, viewport height var.
  useEffect(() => {
    if (!wa) return;
    safe(() => wa.ready());
    safe(() => wa.expand());
    if (wa.isVersionAtLeast?.('7.7')) safe(() => wa.disableVerticalSwipes?.());
    const vp = () => document.documentElement.style.setProperty('--app-vh', `${wa.viewportStableHeight || window.innerHeight}px`);
    vp();
    wa.onEvent('viewportChanged', vp);
    return () => wa.offEvent('viewportChanged', vp);
  }, [wa]);

  const toggleScheme = useCallback(() => {
    setScheme((s) => { const n = s === 'dark' ? 'light' : 'dark'; safe(() => localStorage.setItem(THEME_KEY, n)); return n; });
  }, []);

  const haptic = useMemo<TgContext['haptic']>(() => ({
    select: () => safe(() => wa?.HapticFeedback.selectionChanged()),
    impact: (s = 'light') => safe(() => wa?.HapticFeedback.impactOccurred(s)),
    notify: (t) => safe(() => wa?.HapticFeedback.notificationOccurred(t)),
  }), [wa]);

  // MainButton (native in Telegram, rendered in-page by <BrowserChrome> otherwise).
  const [main, setMainState] = useState<MainButtonState>(HIDDEN);
  const mainClick = useRef<() => void>(() => {});
  const setMain = useCallback((s: MainButtonState, onClick: () => void) => {
    mainClick.current = onClick;
    setMainState((p) => (p.text === s.text && p.visible === s.visible && p.enabled === s.enabled && p.progress === s.progress ? p : s));
  }, []);
  const mainClickFn = useCallback(() => mainClick.current(), []);
  useEffect(() => {
    if (!wa) return;
    const handler = () => mainClick.current();
    wa.MainButton.onClick(handler);
    return () => wa.MainButton.offClick(handler);
  }, [wa]);
  useEffect(() => {
    if (!wa) return;
    const mb = wa.MainButton;
    safe(() => mb.setParams({ text: main.text || ' ', is_visible: main.visible, is_active: main.enabled && !main.progress }));
    safe(() => (main.progress ? mb.showProgress(false) : mb.hideProgress()));
  }, [wa, main]);

  // BackButton
  const [back, setBackState] = useState<(() => void) | null>(null);
  const setBack = useCallback((fn: (() => void) | null) => setBackState(() => fn), []);
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    if (!wa) return;
    const handler = () => backRef.current?.();
    wa.BackButton.onClick(handler);
    return () => wa.BackButton.offClick(handler);
  }, [wa]);
  useEffect(() => { if (wa) safe(() => (back ? wa.BackButton.show() : wa.BackButton.hide())); }, [wa, back]);

  // Confirm dialog: native popup when available (6.2+), otherwise an in-page dialog.
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => {
    if (wa?.showConfirm && wa.isVersionAtLeast?.('6.2')) { try { wa.showConfirm(message, resolve); return; } catch { /* fall through */ } }
    setConfirmRequest({ message, resolve });
  }), [wa]);
  const settleConfirm = useCallback((ok: boolean) => { setConfirmRequest((r) => { r?.resolve(ok); return null; }); }, []);

  const value: TgContext = {
    wa, isTelegram, scheme, toggleScheme,
    firstName: wa?.initDataUnsafe?.user?.first_name?.trim() || 'Guest',
    initData: wa?.initData || '',
    haptic, main, setMain, back, setBack, confirm, confirmRequest, settleConfirm,
    mainClick: mainClickFn,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Declare the primary action for the current screen. */
export function useMainButton(s: Partial<MainButtonState> & { text: string }, onClick: () => void) {
  const { setMain } = useTg();
  const ref = useRef(onClick);
  ref.current = onClick;
  const visible = s.visible ?? true, enabled = s.enabled ?? true, progress = s.progress ?? false;
  useEffect(() => { setMain({ text: s.text, visible, enabled, progress }, () => ref.current()); }, [setMain, s.text, visible, enabled, progress]);
}
export function useBackButton(fn: (() => void) | null) {
  const { setBack } = useTg();
  const ref = useRef(fn);
  ref.current = fn;
  const has = !!fn;
  useEffect(() => { setBack(has ? () => ref.current?.() : null); }, [setBack, has]);
}
