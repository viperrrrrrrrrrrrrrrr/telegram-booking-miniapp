// A test double for window.Telegram.WebApp, injected with page.addInitScript(). Records every call in window.__tg.
export const LIGHT = { bg_color: '#ffffff', secondary_bg_color: '#efeff4', section_bg_color: '#ffffff', text_color: '#000000', hint_color: '#8e8e93', link_color: '#007aff', button_color: '#007aff', button_text_color: '#ffffff', accent_text_color: '#007aff', destructive_text_color: '#ff3b30' };
export const DARK = { bg_color: '#212121', secondary_bg_color: '#0f0f0f', section_bg_color: '#212121', text_color: '#ffffff', hint_color: '#aaaaaa', link_color: '#8774e1', button_color: '#8774e1', button_text_color: '#ffffff', accent_text_color: '#8774e1', destructive_text_color: '#e53935' };

export function fakeTelegram({ initData = '', user = null, scheme = 'light', params = LIGHT, version = '8.0' } = {}) {
  return `(() => {
    const log = []; const handlers = {};
    const rec = (name, ...args) => log.push([name, ...args]);
    const button = (name) => {
      const cbs = new Set();
      return { text: '', isVisible: false, isActive: true, isProgressVisible: false,
        setText(t) { this.text = t; rec(name + '.setText', t); },
        setParams(p) { if ('text' in p) this.text = p.text; if ('is_visible' in p) this.isVisible = p.is_visible; if ('is_active' in p) this.isActive = p.is_active; rec(name + '.setParams', p); },
        show() { this.isVisible = true; rec(name + '.show'); }, hide() { this.isVisible = false; rec(name + '.hide'); },
        enable() { this.isActive = true; }, disable() { this.isActive = false; },
        showProgress() { this.isProgressVisible = true; }, hideProgress() { this.isProgressVisible = false; },
        onClick(cb) { cbs.add(cb); }, offClick(cb) { cbs.delete(cb); },
        _click() { if (this.isVisible && this.isActive) cbs.forEach((cb) => cb()); },
      };
    };
    const back = (() => { const cbs = new Set(); return { isVisible: false, show() { this.isVisible = true; rec('BackButton.show'); }, hide() { this.isVisible = false; rec('BackButton.hide'); }, onClick(cb) { cbs.add(cb); }, offClick(cb) { cbs.delete(cb); }, _click() { cbs.forEach((cb) => cb()); } }; })();
    const wa = {
      initData: ${JSON.stringify(initData)}, initDataUnsafe: ${JSON.stringify(user ? { user } : {})},
      version: ${JSON.stringify(version)}, platform: 'tdesktop', colorScheme: ${JSON.stringify(scheme)}, themeParams: ${JSON.stringify(params)},
      isExpanded: false, viewportHeight: innerHeight, viewportStableHeight: innerHeight,
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      MainButton: button('MainButton'), SecondaryButton: button('SecondaryButton'), BackButton: back,
      HapticFeedback: { impactOccurred: (s) => rec('haptic.impact', s), notificationOccurred: (t) => rec('haptic.notification', t), selectionChanged: () => rec('haptic.selection') },
      ready: () => rec('ready'), expand() { this.isExpanded = true; rec('expand'); }, close: () => rec('close'),
      isVersionAtLeast(v) { const a = this.version.split('.').map(Number), b = String(v).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((a[i]||0) !== (b[i]||0)) return (a[i]||0) > (b[i]||0); } return true; },
      setHeaderColor: (c) => rec('setHeaderColor', c), setBackgroundColor: (c) => rec('setBackgroundColor', c), setBottomBarColor: (c) => rec('setBottomBarColor', c),
      disableVerticalSwipes: () => rec('disableVerticalSwipes'),
      showConfirm(msg, cb) { rec('showConfirm', msg); setTimeout(() => cb(window.__tg.confirmAnswer ?? true), 10); },
      onEvent(e, cb) { (handlers[e] ||= new Set()).add(cb); }, offEvent(e, cb) { handlers[e]?.delete(cb); },
    };
    window.Telegram = { WebApp: wa };
    window.__tg = { log, wa, clickMain: () => wa.MainButton._click(), clickBack: () => back._click(),
      setTheme(scheme, params) { wa.colorScheme = scheme; wa.themeParams = params; handlers.themeChanged?.forEach((cb) => cb.call(wa)); } };
  })();`;
}
