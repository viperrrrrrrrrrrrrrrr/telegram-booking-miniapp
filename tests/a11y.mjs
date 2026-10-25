// axe-core accessibility scan of every screen, light + dark, mobile (390×844) and desktop (1280×800).
import { chromium } from '/workspace/booking-demo/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { test, finish, assert } from './harness.mjs';
const AXE = readFileSync(process.env.AXE_PATH || '/workspace/cms-demo/scripts/node_modules/axe-core/axe.min.js', 'utf8');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8798';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function scan(p, label) {
  await p.waitForTimeout(500);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  const v = r.violations.map((x) => `${label}: ${x.id} (${x.impact}) ×${x.nodes.length} — ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  assert.deepEqual(v, []);
}
try {
  for (const [vpName, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    for (const scheme of ['light', 'dark']) {
      await test(`axe ${vpName} ${scheme}: all screens`, async () => {
        const ctx = await browser.newContext({ viewport, colorScheme: scheme, timezoneId: 'Europe/Berlin' });
        const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('[data-testid=greeting]');
        const mb = p.locator('[data-testid=main-button]');
        await scan(p, 'home');
        await p.click('[data-testid=service-gel-mani]'); await scan(p, 'staff');
        await p.click('[data-testid=staff-any]'); await mb.click(); await p.waitForSelector('[data-testid=slot]');
        await p.locator('[data-testid=slot]').first().click(); await scan(p, 'time');
        await mb.click(); await p.fill('[data-testid=client-name]', 'Anna'); await scan(p, 'confirm');
        await mb.click(); await p.waitForSelector('[data-testid=success][data-status=done]'); await scan(p, 'success');
        await p.click('[data-testid=to-bookings]'); await scan(p, 'bookings');
        await p.click('[data-testid=cancel]'); await p.waitForSelector('[data-testid=confirm-dialog]'); await scan(p, 'confirm-dialog');
        await p.keyboard.press('Escape');
        await p.click('[data-testid=admin-toggle]'); await p.click('[data-testid=tab-studio]'); await p.waitForSelector('[data-testid=admin-booking]'); await scan(p, 'admin');
        await p.click('[data-testid=block-open]'); await scan(p, 'block-form');
        await ctx.close();
      });
    }
  }
} finally { await browser.close(); }
process.exit(finish('a11y.json') ? 1 : 0);
