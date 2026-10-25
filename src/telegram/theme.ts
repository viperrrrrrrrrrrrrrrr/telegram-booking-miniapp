import type { ThemeParams } from './webapp';

/** Browser-mode palettes (Telegram-like, with the studio's rose accent). Inside Telegram the user's themeParams win. */
export const PALETTES: Record<'light' | 'dark', Required<ThemeParams>> = {
  light: {
    bg_color: '#ffffff', text_color: '#1b1416', hint_color: '#6b6166', link_color: '#b22f64', button_color: '#b22f64', button_text_color: '#ffffff',
    secondary_bg_color: '#f4f1f2', header_bg_color: '#f4f1f2', bottom_bar_bg_color: '#ffffff', accent_text_color: '#b22f64', section_bg_color: '#ffffff',
    section_header_text_color: '#9a2a57', section_separator_color: '#ebe4e7', subtitle_text_color: '#6b6166', destructive_text_color: '#cc2238',
  },
  dark: {
    bg_color: '#1d1a1c', text_color: '#f6eef1', hint_color: '#a99fa4', link_color: '#f493b8', button_color: '#f06b9c', button_text_color: '#1a0a11',
    secondary_bg_color: '#131012', header_bg_color: '#131012', bottom_bar_bg_color: '#1d1a1c', accent_text_color: '#f493b8', section_bg_color: '#221e21',
    section_header_text_color: '#f493b8', section_separator_color: '#342e32', subtitle_text_color: '#a99fa4', destructive_text_color: '#ff6b7a',
  },
};

type K = keyof ThemeParams;
const VARS: ([string, K] | [string, K, K])[] = [
  ['--c-bg', 'secondary_bg_color', 'bg_color'],
  ['--c-section', 'section_bg_color', 'bg_color'],
  ['--c-text', 'text_color'],
  ['--c-hint', 'hint_color'],
  ['--c-link', 'link_color'],
  ['--c-button', 'button_color'],
  ['--c-button-text', 'button_text_color'],
  ['--c-accent', 'accent_text_color', 'link_color'],
  ['--c-section-header', 'section_header_text_color', 'accent_text_color'],
  ['--c-separator', 'section_separator_color'],
  ['--c-subtitle', 'subtitle_text_color', 'hint_color'],
  ['--c-destructive', 'destructive_text_color'],
  ['--c-header', 'header_bg_color', 'secondary_bg_color'],
];

/** Merge Telegram themeParams over our palette for the scheme and write CSS variables. */
export function applyTheme(scheme: 'light' | 'dark', params: ThemeParams = {}) {
  const base = PALETTES[scheme];
  const root = document.documentElement;
  const pick = (k: keyof ThemeParams) => params[k] || undefined;
  for (const [v, k, alt] of VARS) root.style.setProperty(v, pick(k) ?? (alt ? pick(alt) : undefined) ?? base[k]);
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--c-header').trim());
  return { bg: pick('secondary_bg_color') ?? pick('bg_color') ?? base.secondary_bg_color, bottom: pick('bottom_bar_bg_color') ?? pick('bg_color') ?? base.bottom_bar_bg_color };
}
