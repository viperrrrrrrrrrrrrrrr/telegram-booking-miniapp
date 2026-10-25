// Portfolio screenshots: captures phone screens with a fake Telegram WebApp (studio palette as themeParams),
// then renders Telegram-like phone frames into 1280×769 and 1024×768 JPG composites (light + dark).
import { chromium } from '/workspace/booking-demo/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fakeTelegram } from '../tests/fake-telegram.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8798';
const OUT = process.env.SHOTS_DIR || '/workspace/tg-booking-miniapp-shots';
const RAW = '/tmp/tgb-shots-raw';
mkdirSync(OUT, { recursive: true }); mkdirSync(RAW, { recursive: true });
const src = readFileSync(new URL('../src/telegram/theme.ts', import.meta.url), 'utf8');
const pal = (s) => Object.fromEntries([...src.split(`${s}: {`)[1].split('}')[0].matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
const PAL = { light: pal('light'), dark: pal('dark') };
const W = 390, STATUS = 47, HEADER = 56, BOTTOM = 78, H = 844;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const screens = {};
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H - STATUS - HEADER }, deviceScaleFactor: 2, timezoneId: 'Europe/Berlin', colorScheme: scheme, reducedMotion: 'reduce' });
  await ctx.addInitScript(fakeTelegram({ initData: 'auth_date=1&hash=00', user: { id: 1, first_name: 'Anna' }, scheme, params: PAL[scheme] }));
  const p = await ctx.newPage();
  await p.clock.install({ time: Date.parse('2026-10-26T07:40:00Z') });
  await p.goto(BASE + '/'); await p.waitForSelector('[data-testid=greeting]');
  const mb = () => p.evaluate(() => ({ text: window.__tg.wa.MainButton.text, visible: window.__tg.wa.MainButton.isVisible, active: window.__tg.wa.MainButton.isActive }));
  const press = async () => { await p.waitForFunction(() => window.__tg.wa.MainButton.isActive); await p.evaluate(() => window.__tg.clickMain()); };
  const snap = async (name) => {
    await p.waitForTimeout(450);
    const b = await mb();
    await p.setViewportSize({ width: W, height: H - STATUS - HEADER - (b.visible ? BOTTOM : 0) });
    await p.waitForTimeout(250);
    const file = `${RAW}/${scheme}-${name}.png`;
    await p.screenshot({ path: file });
    (screens[scheme] ||= {})[name] = { file, main: b };
    await p.setViewportSize({ width: W, height: H - STATUS - HEADER });
  };
  await snap('services');
  await p.click('[data-testid=service-gel-mani]'); await snap('staff');
  await p.click('[data-testid=staff-any]'); await press(); await p.waitForSelector('[data-testid=slot]');
  await p.click('[data-testid=day-2026-10-28]'); await p.waitForTimeout(300); await p.locator('[data-testid=slot]').nth(4).click(); await snap('slots');
  await press(); await p.fill('[data-testid=client-name]', 'Anna'); await p.fill('[data-testid=comment]', 'Short almond, soft nude please');
  await p.locator('[data-testid=comment]').blur(); await snap('confirm');
  await press(); await p.waitForSelector('[data-testid=success][data-status=done]'); await p.waitForTimeout(700); await snap('success');
  await p.evaluate(() => window.__tg.clickMain()); await p.click('[data-testid=tab-bookings]'); await snap('bookings');
  await ctx.close();
}
writeFileSync(`${RAW}/screens.json`, JSON.stringify(screens, null, 2));

// ---------- composites ----------
const b64 = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
function phone(scheme, s, scale) {
  const c = PAL[scheme], dark = scheme === 'dark';
  const icon = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c.text_color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return `<div class="phone" style="--s:${scale};--bezel:${dark ? '#0b0a0b' : '#1d1b1c'}">
    <div class="screen" style="background:${c.secondary_bg_color};color:${c.text_color}">
      <div class="status" style="background:${c.header_bg_color}"><span>9:41</span><span class="island"></span><span class="sig">▴▴ ◔ ▮</span></div>
      <div class="tghead" style="background:${c.header_bg_color}">
        <span class="close" style="color:${c.link_color}">${s.backVisible ? '‹ Back' : 'Close'}</span>
        <span class="ttl"><b>Petalune Nail Studio</b><small style="color:${c.hint_color}">mini app</small></span>
        <span class="more">${icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>')}</span>
      </div>
      <img class="web" src="${b64(s.file)}">
      ${s.main.visible ? `<div class="bbar" style="background:${c.bottom_bar_bg_color}"><div class="mbtn" style="background:${c.button_color};color:${c.button_text_color};opacity:${s.main.active ? 1 : 0.55}">${s.main.text}</div><div class="home" style="background:${c.text_color}"></div></div>` : `<div class="home abs" style="background:${c.text_color}"></div>`}
    </div></div>`;
}
const CSS = `
*{box-sizing:border-box;margin:0} body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,"Segoe UI",Roboto,system-ui,sans-serif}
.bg{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55}
.phone{width:${W + 24}px;height:${H + 24}px;padding:12px;border-radius:64px;background:var(--bezel);box-shadow:0 30px 60px -20px rgba(40,10,25,.45),0 0 0 1.5px rgba(255,255,255,.08) inset;transform:scale(var(--s));transform-origin:top left;position:absolute}
.screen{width:${W}px;height:${H}px;border-radius:52px;overflow:hidden;position:relative;display:flex;flex-direction:column}
.status{height:${STATUS}px;display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0 40px;font:600 16px/1 system-ui,sans-serif;position:relative}
.island{position:absolute;left:50%;top:11px;width:118px;height:33px;border-radius:20px;background:#000;transform:translateX(-50%)}
.sig{font-size:12px;letter-spacing:1px;opacity:.85}
.tghead{height:${HEADER}px;display:grid;grid-template-columns:80px 1fr 80px;align-items:center;padding:0 14px;font-size:16px}
.ttl{display:flex;flex-direction:column;align-items:center;line-height:1.15}.ttl b{font-size:16px}.ttl small{font-size:13px}
.more{justify-self:end;display:flex}
.web{width:${W}px;display:block}
.bbar{height:${BOTTOM}px;padding:8px 12px 0;position:relative}
.mbtn{height:50px;border-radius:12px;display:grid;place-items:center;font:600 16px/1 system-ui,sans-serif}
.home{position:absolute;bottom:7px;left:50%;width:134px;height:5px;border-radius:3px;transform:translateX(-50%);opacity:.85}
.copy{position:absolute}
.kicker{font:600 13px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
h1{font:800 38px/1.08 system-ui,sans-serif;letter-spacing:-.02em;margin-top:12px}
.lead{font:400 16px/1.45 system-ui,sans-serif;margin-top:14px}
ul{list-style:none;padding:0;margin-top:18px;display:grid;gap:9px;font:500 14.5px/1.3 system-ui,sans-serif}
li{display:flex;gap:9px;align-items:flex-start} li i{flex:none;width:18px;height:18px;border-radius:6px;display:grid;place-items:center;font-style:normal;font-size:12px;margin-top:1px}
.demo{position:absolute;font:500 12.5px/1 system-ui,sans-serif;padding:8px 12px;border-radius:999px}
`;
function composite(scheme, w, h) {
  const c = PAL[scheme], dark = scheme === 'dark', S = screens[scheme];
  const bg = dark ? `linear-gradient(140deg,#140f12 0%,#1f1419 55%,#2a1520 100%)` : `linear-gradient(140deg,#fbf6f8 0%,#f6e9ef 60%,#f1dde7 100%)`;
  const ink = dark ? '#f6eef1' : '#1b1416', sub = dark ? '#c9bcc2' : '#5e5258';
  const wide = w >= 1200;
  const scale = wide ? 0.635 : 0.69;
  const pw = (W + 24) * scale, ph = (H + 24) * scale;
  const order = [['services', false], ['slots', true], ['confirm', true]];
  const gap = wide ? 18 : 16;
  const totalW = pw * 3 + gap * 2;
  const left0 = wide ? w - totalW - 40 : (w - totalW) / 2;
  const top = wide ? (h - ph) / 2 : h - ph - 22;
  const phones = order.map(([n, back], i) => `<div style="position:absolute;left:${left0 + i * (pw + gap)}px;top:${top + (i === 1 ? -10 : 8)}px">${phone(scheme, { ...S[n], backVisible: back }, scale)}</div>`).join('');
  const bullets = ['Native Telegram MainButton, BackButton, haptics & theme', 'Service → specialist → 14-day slots → confirm', 'My bookings: reschedule & cancel', 'Cloudflare Pages Functions + D1 backend, no double-booking'];
  const copy = wide
    ? `<div class="copy" style="left:52px;top:${(h - 500) / 2}px;width:${left0 - 84}px;color:${ink}">
         <div class="kicker" style="color:${c.accent_text_color}">Telegram Mini App</div>
         <h1 style="font-size:34px">Book a nail appointment in a few taps</h1>
         <p class="lead" style="color:${sub}">Petalune Nail Studio — a booking flow that feels native inside Telegram and also works in any browser.</p>
         <ul>${bullets.map((b) => `<li><i style="background:${c.button_color};color:${c.button_text_color}">✓</i><span>${b}</span></li>`).join('')}</ul>
       </div>
       <div class="demo" style="left:52px;bottom:30px;background:${dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.7)'};color:${sub}">Demo by Ivan Litvin · fictional studio, sample prices</div>`
    : `<div class="copy" style="left:0;right:0;top:26px;text-align:center;color:${ink}">
         <div class="kicker" style="color:${c.accent_text_color}">Telegram Mini App · booking demo</div>
         <h1 style="font-size:30px;margin-top:8px">Petalune Nail Studio — book in a few taps</h1>
       </div>
       <div class="demo" style="right:18px;top:${top - 2}px;display:none"></div>
       <div class="demo" style="left:50%;transform:translateX(-50%);top:112px;background:${dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.7)'};color:${sub}">Demo by Ivan Litvin · fictional studio, sample prices</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="--w:${w}px;--h:${h}px;background:${bg}">
    <div class="bg"><div class="blob" style="width:520px;height:520px;right:-120px;top:-180px;background:${c.button_color};opacity:${dark ? 0.28 : 0.22}"></div><div class="blob" style="width:380px;height:380px;left:${wide ? 300 : -120}px;bottom:-220px;background:#c58cff;opacity:${dark ? 0.18 : 0.2}"></div></div>
    ${copy}${phones}</body></html>`;
}
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const scheme of ['light', 'dark']) {
  for (const [w, h] of [[1280, 769], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(composite(scheme, w, h), { waitUntil: 'load' });
    await page.screenshot({ path: `${OUT}/petalune-miniapp-${w}x${h}-${scheme}.jpg`, type: 'jpeg', quality: 90 });
  }
}
// Single framed phones (PNG, transparent) for flexible use
const solo = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W + 24, height: H + 24 } });
for (const scheme of ['light', 'dark']) for (const n of ['services', 'staff', 'slots', 'confirm', 'success', 'bookings']) {
  await solo.setContent(`<!doctype html><html><head><style>${CSS} body{background:transparent;width:${W + 24}px;height:${H + 24}px}</style></head><body>${phone(scheme, { ...screens[scheme][n], backVisible: n !== 'services' && n !== 'bookings' && n !== 'success' }, 1)}</body></html>`);
  await solo.screenshot({ path: `${OUT}/phone-${scheme}-${n}.png`, omitBackground: true });
}
// OG image 1200×630 from the light composite layout
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(composite('light', 1280, 769).replace('<body style="', '<body style="zoom:0.9375;'), { waitUntil: 'load' });
await page.screenshot({ path: new URL('../public/og.jpg', import.meta.url).pathname, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('shots written to', OUT);
