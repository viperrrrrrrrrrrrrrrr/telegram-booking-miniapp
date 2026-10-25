// Thin typed wrapper around the official Telegram WebApp script (https://telegram.org/js/telegram-web-app.js).
// The script is loaded only when the page was launched by Telegram, so the browser demo makes no third-party requests.
export type ThemeParams = Partial<Record<
  'bg_color' | 'text_color' | 'hint_color' | 'link_color' | 'button_color' | 'button_text_color' | 'secondary_bg_color' |
  'header_bg_color' | 'bottom_bar_bg_color' | 'accent_text_color' | 'section_bg_color' | 'section_header_text_color' |
  'section_separator_color' | 'subtitle_text_color' | 'destructive_text_color', string>>;

interface BottomButton {
  text: string; isVisible: boolean; isActive: boolean;
  setText(t: string): void; show(): void; hide(): void; enable(): void; disable(): void;
  showProgress(leaveActive?: boolean): void; hideProgress(): void;
  onClick(cb: () => void): void; offClick(cb: () => void): void;
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean; has_shine_effect?: boolean }): void;
}
export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string } };
  version: string; platform: string; colorScheme: 'light' | 'dark'; themeParams: ThemeParams;
  isExpanded: boolean; viewportHeight: number; viewportStableHeight: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  MainButton: BottomButton;
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: { impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void; selectionChanged(): void };
  ready(): void; expand(): void; close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void; setBackgroundColor(c: string): void; setBottomBarColor?(c: string): void;
  onEvent(e: string, cb: (...a: unknown[]) => void): void; offEvent(e: string, cb: (...a: unknown[]) => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  disableVerticalSwipes?(): void;
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

const SCRIPT = 'https://telegram.org/js/telegram-web-app.js';

/** True when Telegram launched us (launch params in the URL hash or the script's saved session). */
export function launchedByTelegram(): boolean {
  if (typeof window === 'undefined') return false;
  if (/tgWebApp(Data|Version|Platform)=/.test(window.location.hash)) return true;
  try { return !!sessionStorage.getItem('__telegram__initParams'); } catch { return false; }
}

export function loadTelegramScript(timeoutMs = 4000): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    const done = () => resolve();
    s.onload = done; s.onerror = done;
    setTimeout(done, timeoutMs);
    document.head.appendChild(s);
  });
}

/** The live WebApp object when actually running inside Telegram (or a test double); otherwise null. */
export function getWebApp(): TgWebApp | null {
  const w = window.Telegram?.WebApp;
  if (!w) return null;
  if (!w.initData && (!w.platform || w.platform === 'unknown')) return null;
  return w;
}

export function safe<T>(fn: () => T): T | undefined {
  try { return fn(); } catch { return undefined; }
}
