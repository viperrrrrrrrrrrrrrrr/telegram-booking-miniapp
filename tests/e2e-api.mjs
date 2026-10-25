// Full-stack UI test: the built app served by `wrangler pages dev` with local D1 + Bot API stub,
// opened with a fake Telegram WebApp whose initData is signed with a FAKE bot token → the app runs in API mode.
import { chromium } from '/workspace/booking-demo/node_modules/playwright-core/index.mjs';
import { startBackend, API } from './start-backend.mjs';
import { signInitData, user, idem, ADMIN_ID } from './helpers.mjs';
import { fakeTelegram, LIGHT } from './fake-telegram.mjs';
import { test, finish, assert } from './harness.mjs';

const be = await startBackend({ fresh: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function openAs(u) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Berlin' });
  await ctx.addInitScript(fakeTelegram({ initData: signInitData(u), user: u, params: LIGHT }));
  const p = await ctx.newPage(); await p.goto(API + '/'); await p.waitForSelector('[data-testid=greeting]');
  return { ctx, p };
}
const click = async (p) => { await p.waitForFunction(() => window.__tg.wa.MainButton.isVisible && window.__tg.wa.MainButton.isActive, null, { timeout: 8000 }); await p.evaluate(() => window.__tg.clickMain()); };
try {
  await test('API mode: client books through the UI; booking stored in D1; owner notified', async () => {
    const u = user(7001, 'Lena'); const { ctx, p } = await openAs(u);
    assert.match(await p.textContent('[data-testid=mode-chip]'), /Live/);
    assert.equal(await p.locator('[data-testid=admin-toggle]').count(), 0); assert.equal(await p.locator('[data-testid=tab-studio]').count(), 0);
    await p.click('[data-testid=service-gel-mani]'); await p.click('[data-testid=staff-mila]'); await click(p);
    await p.waitForSelector('[data-testid=slot]');
    const slot = p.locator('[data-testid=slot]').nth(1); const start = Number(await slot.getAttribute('data-start'));
    await slot.click(); await click(p);
    assert.equal(await p.inputValue('[data-testid=client-name]'), 'Lena');
    await click(p);
    await p.waitForSelector('[data-testid=success][data-status=done]');
    const mine = await (await fetch(API + '/api/bookings', { headers: { authorization: 'tma ' + signInitData(u) } })).json();
    assert.equal(mine.bookings.length, 1); assert.equal(mine.bookings[0].start, start);
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(be.stub.calls.some((c) => String(c.payload.chat_id) === '700000001'));
    await ctx.close();
  });
  await test('API mode: slot taken by someone else meanwhile → conflict notice, slots refreshed (optimistic UI rollback)', async () => {
    const { ctx, p } = await openAs(user(7002, 'Mia'));
    await p.click('[data-testid=service-gel-mani]'); await p.click('[data-testid=staff-mila]'); await click(p);
    await p.waitForSelector('[data-testid=slot]');
    const slot = p.locator('[data-testid=slot]').nth(4); const start = Number(await slot.getAttribute('data-start'));
    await slot.click(); await click(p);
    const r = await fetch(API + '/api/bookings', { method: 'POST', headers: { authorization: 'tma ' + signInitData(user(7003, 'Rival')), 'content-type': 'application/json', 'idempotency-key': idem() }, body: JSON.stringify({ serviceId: 'gel-mani', staffId: 'mila', start }) });
    assert.equal(r.status, 201);
    await click(p);
    await p.waitForSelector('[data-testid=conflict-notice]');
    await p.waitForSelector('[data-testid=slot]');
    assert.equal(await p.locator(`[data-testid=slot][data-start="${start}"]`).count(), 0);
    await ctx.close();
  });
  await test('API mode: allowlisted admin sees the Studio view with real bookings and can block time', async () => {
    const { ctx, p } = await openAs(user(ADMIN_ID, 'Owner'));
    await p.click('[data-testid=tab-studio]'); await p.waitForSelector('[data-testid=admin]');
    await p.waitForSelector('[data-testid=upcoming] li, [data-testid=admin-upcoming]', { timeout: 8000 }).catch(() => {});
    assert.match(await p.textContent('[data-testid=admin]'), /Lena/);
    await p.click('[data-testid=block-open]');
    await p.selectOption('[data-testid=block-from]', { index: 2 }); await p.selectOption('[data-testid=block-to]', { index: 4 });
    await p.click('[data-testid=block-save]');
    await p.waitForSelector('[data-testid=admin-timeoff]');
    await ctx.close();
  });
} finally {
  await browser.close(); await be.stop();
}
process.exit(finish('e2e-api.json') ? 1 : 0);
