// End-to-end tests (Playwright + system Chrome) against the static build served by `npm run preview` (:8798).
// Runs in demo mode (no backend) — plus a fake window.Telegram.WebApp for the Telegram-specific behaviour.
import { chromium } from '/workspace/booking-demo/node_modules/playwright-core/index.mjs';
import { fakeTelegram, LIGHT, DARK } from './fake-telegram.mjs';
import { test, finish, assert } from './harness.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8798';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const external = [];
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Europe/Berlin', ...opts });
  ctx.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(r.url()); });
  return ctx;
}
async function open(ctx, path = '/') {
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForSelector('[data-testid=greeting]');
  return page;
}
const main = (p) => p.locator('[data-testid=main-button]');
/** The bottom button: in-page in a browser, native (fake) inside Telegram. */
const press = async (p, tg) => {
  if (!tg) return main(p).click();
  await p.waitForFunction(() => window.__tg.wa.MainButton.isVisible && window.__tg.wa.MainButton.isActive, null, { timeout: 5000 });
  await p.evaluate(() => window.__tg.clickMain());
};
const mainText = (p, text) => p.waitForFunction((t) => (window.__tg?.wa?.MainButton.text ?? document.querySelector('[data-testid=main-button]')?.textContent?.trim()) === t, text, { timeout: 5000 });
/** Drive the booking flow through the UI. Returns the chosen slot start (epoch ms). */
async function book(page, { service = 'gel-mani', staff = 'any', slot = 0, name = 'Anna', comment = '', stopAtConfirm = false, start, tg = false } = {}) {
  await page.click(`[data-testid=service-${service}]`);
  await page.click(`[data-testid=staff-${staff}]`);
  await press(page, tg);
  await page.waitForSelector('[data-testid=slot]');
  const loc = start ? page.locator(`[data-testid=slot][data-start="${start}"]`) : page.locator('[data-testid=slot]').nth(slot);
  const chosen = Number(await loc.getAttribute('data-start'));
  await loc.click();
  await press(page, tg);
  await page.waitForSelector('[data-testid=confirm-card]');
  await page.fill('[data-testid=client-name]', name);
  if (comment) await page.fill('[data-testid=comment]', comment);
  if (!stopAtConfirm) { await press(page, tg); await page.waitForSelector('[data-testid=success][data-status=done]'); }
  return chosen;
}

try {
  await test('browser: full booking flow, demo label, guest greeting, in-page Back/Main buttons', async () => {
    const ctx = await newCtx(); const p = await open(ctx);
    assert.match(await p.textContent('[data-testid=greeting]'), /Guest/);
    assert.match(await p.textContent('[data-testid=demo-label]'), /Made by Ivan Litvin · sample prices/);
    assert.match(await p.textContent('[data-testid=mode-chip]'), /Bookings stay on this device/);
    assert.ok(await p.isVisible('[data-testid=browser-header]'));
    assert.ok(!(await main(p).isVisible()), 'main button hidden on home');
    await p.click('[data-testid=service-gel-mani]');
    await mainText(p, 'Choose time');
    await p.click('[data-testid=browser-back]');
    await p.waitForSelector('[data-testid=service-gel-mani]');
    const start = await book(p, { comment: 'Short almond, nude' });
    assert.match(await p.textContent('[data-testid=success-when]'), /\d{2}:\d{2}/);
    await p.click('[data-testid=to-bookings]');
    const card = p.locator('[data-testid=booking-card]');
    assert.equal(await card.count(), 1); assert.equal(Number(await card.getAttribute('data-start')), start);
    // persisted across reloads
    await p.reload(); await p.click('[data-testid=tab-bookings]');
    assert.equal(await p.locator('[data-testid=booking-card]').count(), 1);
    assert.deepEqual(p.errors, []); await ctx.close();
  });

  await test('no double-booking: a booked slot is not offered again for that specialist', async () => {
    const ctx = await newCtx(); const p = await open(ctx);
    const start = await book(p, { staff: 'mila', slot: 1 });
    await p.click('[data-testid=main-button]'); // Done → home
    await p.click('[data-testid=service-gel-mani]'); await p.click('[data-testid=staff-mila]'); await main(p).click();
    await p.waitForSelector('[data-testid=slot]');
    assert.equal(await p.locator(`[data-testid=slot][data-start="${start}"]`).count(), 0);
    // overlapping starts (within the 60 min of gel-mani) are also gone
    for (const off of [-30, 30]) assert.equal(await p.locator(`[data-testid=slot][data-start="${start + off * 60000}"]`).count(), 0);
    await ctx.close();
  });

  await test('slot conflict: another tab takes the slot first → friendly notice, refreshed times, nothing double-booked', async () => {
    const ctx = await newCtx(); const a = await open(ctx); const b = await open(ctx);
    const start = await book(a, { staff: 'mila', slot: 2, stopAtConfirm: true });
    await book(b, { staff: 'mila', start, name: 'Other tab' });
    await main(a).click();
    await a.waitForSelector('[data-testid=conflict-notice]');
    await a.waitForSelector('[data-testid=slot]');
    assert.equal(await a.locator(`[data-testid=slot][data-start="${start}"]`).count(), 0);
    const store = JSON.parse(await a.evaluate(() => localStorage.getItem('petalune.demo.v1')));
    assert.equal(store.bookings.filter((x) => x.start === start && x.status === 'confirmed').length, 1);
    await ctx.close();
  });

  await test('reschedule then cancel from "My bookings"', async () => {
    const ctx = await newCtx(); const p = await open(ctx);
    const first = await book(p, { slot: 0 });
    await p.click('[data-testid=to-bookings]');
    await p.click('[data-testid=reschedule]');
    await p.waitForSelector('[data-testid=slot]');
    const target = p.locator('[data-testid=slot]').nth(3);
    const next = Number(await target.getAttribute('data-start'));
    assert.notEqual(next, first);
    await target.click(); await main(p).click();
    await p.waitForSelector('[data-testid=confirm-card]');
    assert.equal(await p.locator('[data-testid=client-name]').count(), 0, 'no name field when rescheduling');
    await mainText(p, 'Confirm new time');
    await main(p).click();
    await p.waitForSelector('[data-testid=success][data-status=done]');
    await p.click('[data-testid=to-bookings]');
    const card = p.locator('[data-testid=booking-card]');
    assert.equal(await card.count(), 1); assert.equal(Number(await card.getAttribute('data-start')), next);
    await p.click('[data-testid=cancel]');
    await p.click('[data-testid=confirm-ok]');
    await p.waitForSelector('[data-testid=no-bookings]');
    assert.equal(await p.locator('[data-testid=past-booking][data-status=cancelled]').count(), 1);
    await ctx.close();
  });

  await test('past slots are hidden (fake clock: Tue 27 Oct 2026, 14:10 Berlin)', async () => {
    const ctx = await newCtx(); const pre = await ctx.newPage();
    const now = Date.parse('2026-10-27T13:10:00Z');
    await pre.clock.install({ time: now });
    await pre.goto(BASE + '/'); await pre.waitForSelector('[data-testid=greeting]');
    await pre.click('[data-testid=service-classic-mani]'); await pre.click('[data-testid=staff-any]'); await main(pre).click();
    await pre.waitForSelector('[data-testid=day-2026-10-27]');
    await pre.click('[data-testid=day-2026-10-27]');
    const starts = await pre.locator('[data-testid=slot]').evaluateAll((els) => els.map((e) => Number(e.dataset.start)));
    assert.ok(starts.length > 0, 'some afternoon slots left today');
    assert.ok(starts.every((s) => s >= now + 60 * 60000), 'all ≥ now + 1 h notice');
    await pre.click('[data-testid=day-2026-10-28]');
    const tomorrow = await pre.locator('[data-testid=slot]').evaluateAll((els) => els.map((e) => Number(e.dataset.start)));
    assert.ok(Math.min(...tomorrow) < Date.parse('2026-10-28T11:00:00Z'), 'tomorrow still has morning slots');
    await ctx.close();
  });

  await test('Telegram (fake WebApp): theme, themeChanged, MainButton, BackButton, haptics, expand, greeting', async () => {
    const ctx = await newCtx();
    await ctx.addInitScript(fakeTelegram({ initData: 'user=%7B%7D&auth_date=1&hash=00', user: { id: 42, first_name: 'Alice' }, scheme: 'light', params: LIGHT }));
    const p = await open(ctx);
    const css = (v) => p.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
    assert.match(await p.textContent('[data-testid=greeting]'), /Alice/);
    assert.equal(await css('--c-bg'), LIGHT.secondary_bg_color); assert.equal(await css('--c-button'), LIGHT.button_color);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await p.locator('[data-testid=browser-header]').count(), 0, 'no browser chrome inside Telegram');
    assert.ok(!(await main(p).isVisible()), 'in-page main button not used inside Telegram');
    await p.evaluate((d) => window.__tg.setTheme('dark', d), DARK);
    await p.waitForFunction((c) => getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim() === c, DARK.secondary_bg_color);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
    const log = () => p.evaluate(() => window.__tg.log.map((x) => x[0]));
    assert.ok((await log()).includes('ready')); assert.ok((await log()).includes('expand'));
    await p.click('[data-testid=service-gel-mani]');
    await p.waitForFunction(() => window.__tg.wa.MainButton.text === 'Choose time' && window.__tg.wa.MainButton.isVisible);
    assert.ok(await p.evaluate(() => window.__tg.wa.BackButton.isVisible), 'BackButton shown');
    await p.evaluate(() => window.__tg.clickBack());
    await p.waitForSelector('[data-testid=service-gel-mani]');
    await p.waitForFunction(() => !window.__tg.wa.BackButton.isVisible && !window.__tg.wa.MainButton.isVisible);
    await p.click('[data-testid=service-gel-mani]'); await p.click('[data-testid=staff-any]');
    await p.evaluate(() => window.__tg.clickMain());
    await p.waitForSelector('[data-testid=slot]');
    await p.waitForFunction(() => window.__tg.wa.MainButton.isVisible && !window.__tg.wa.MainButton.isActive);
    await p.locator('[data-testid=slot]').first().click();
    await p.waitForFunction(() => window.__tg.wa.MainButton.isActive && /^Continue · \d{2}:\d{2}$/.test(window.__tg.wa.MainButton.text));
    await p.evaluate(() => window.__tg.clickMain());
    await p.fill('[data-testid=client-name]', 'Alice');
    await p.waitForFunction(() => window.__tg.wa.MainButton.text === 'Confirm booking');
    await p.evaluate(() => window.__tg.clickMain());
    await p.waitForSelector('[data-testid=success][data-status=done]');
    const l = await log();
    assert.ok(l.includes('haptic.selection'), 'selection haptics'); assert.ok(l.includes('haptic.notification'), 'success haptic');
    assert.ok(l.includes('setHeaderColor'));
    await ctx.close();
  });

  await test('fallback: Telegram initData present but no backend → demo mode, no API writes', async () => {
    const ctx = await newCtx();
    await ctx.addInitScript(fakeTelegram({ initData: 'user=%7B%7D&auth_date=1&hash=00', user: { id: 42, first_name: 'Alice' } }));
    const api = []; ctx.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.method() + ' ' + new URL(r.url()).pathname); });
    const p = await open(ctx);
    assert.match(await p.textContent('[data-testid=mode-chip]'), /Bookings stay on this device/);
    assert.match(await p.textContent('[data-testid=privacy-note]'), /Nothing is sent to any server/);
    await book(p, { name: 'Alice', tg: true });
    assert.deepEqual(api, ['GET /api/health'], 'only the health probe: ' + api.join(', '));
    await ctx.close();
  });

  await test('studio admin demo toggle: timeline, block time, own booking listed', async () => {
    const ctx = await newCtx(); const p = await open(ctx);
    await book(p, { slot: 0, name: 'Anna' });
    await main(p).click();
    await p.click('[data-testid=admin-toggle]');
    await p.click('[data-testid=tab-studio]');
    await p.waitForSelector('[data-testid=admin]');
    await p.waitForSelector('[data-testid=admin-booking]');
    assert.ok((await p.locator('[data-testid=admin-booking]').count()) > 0);
    await p.click('[data-testid=block-open]');
    await p.selectOption('[data-testid=block-from]', { index: 2 }); await p.selectOption('[data-testid=block-to]', { index: 4 });
    await p.click('[data-testid=block-save]');
    await p.waitForSelector('[data-testid=admin-timeoff]');
    await ctx.close();
  });

  await test('mobile layout: no horizontal overflow at 390×844 and 320×640', async () => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
      const ctx = await newCtx({ viewport }); const p = await open(ctx);
      for (const step of ['home', 'staff', 'time']) {
        if (step === 'staff') await p.click('[data-testid=service-gel-mani]');
        if (step === 'time') { await p.click('[data-testid=staff-any]'); await main(p).click(); await p.waitForSelector('[data-testid=slot]'); }
        await p.waitForTimeout(450); // let screen transitions finish
        const w = await p.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(w <= viewport.width, `${step} @${viewport.width}: scrollWidth ${w}`);
      }
      await ctx.close();
    }
  });

  await test('reduced motion is respected', async () => {
    const ctx = await newCtx({ reducedMotion: 'reduce' }); const p = await open(ctx);
    const d = await p.evaluate(() => { const el = document.querySelector('[data-testid=service-gel-mani]'); return getComputedStyle(el).transitionDuration; });
    assert.ok(d.split(',').every((x) => parseFloat(x) <= 0.01), d);
    await ctx.close();
  });

  await test('demo makes zero third-party requests', async () => { assert.deepEqual(external, []); });
} finally {
  await browser.close();
}
process.exit(finish('e2e.json') ? 1 : 0);
