// Backend tests against a fully local stack: `wrangler pages dev` + local D1 + a Bot API stub.
// initData is signed with a FAKE bot token; nothing talks to Telegram or Cloudflare.
import { execFileSync, spawn } from 'node:child_process';
import { startBackend, d1, API, ROOT, PERSIST, WR, wranglerEnv } from './start-backend.mjs';
import { signInitData, user, idem, ADMIN_ID, FAKE_BOT_TOKEN, WEBHOOK_SECRET } from './helpers.mjs';
import { test, finish, assert } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = (u, opts) => ({ authorization: 'tma ' + signInitData(u, opts) });
async function call(method, path, u, body, { key, headers = {} } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(u ? auth(u) : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}
const sends = (stub, chatId) => stub.calls.filter((c) => c.method === 'sendMessage' && (chatId === undefined || String(c.payload.chat_id) === String(chatId)));

console.log('Starting local backend (wrangler pages dev + local D1 + Bot API stub)…');
const be = await startBackend({ fresh: true });
const { stub } = be;
let failed = 1;
try {
  const alice = user(1001, 'Alice'), bob = user(1002, 'Bob'), admin = user(ADMIN_ID, 'Owner');

  // A future slot for Mila (tomorrow or later) used across tests
  const av = await call('GET', '/api/availability?serviceId=gel-mani&staffId=mila', alice);
  const days = av.data.days.filter((d) => d.slots.length > 6);
  const dayA = days[1], dayB = days[2];
  const slotA = dayA.slots[0].start, slotA2 = dayA.slots[dayA.slots.length - 1].start, slotB = dayB.slots[3].start;

  console.log('\nAuth (Telegram initData HMAC-SHA256)');
  await test('missing initData → 401', async () => { const r = await call('GET', '/api/me'); assert.equal(r.status, 401); });
  await test('initData signed with another bot token → 401 bad_hash', async () => {
    const r = await call('GET', '/api/me', null, null, { headers: auth(alice, { botToken: '999:OTHER-FAKE' }) });
    assert.equal(r.status, 401); assert.match(r.data.error.message, /bad_hash/);
  });
  await test('tampered user field → 401', async () => {
    const good = signInitData(alice);
    const p = new URLSearchParams(good); p.set('user', JSON.stringify({ ...alice, id: ADMIN_ID }));
    const r = await call('GET', '/api/admin/upcoming', null, null, { headers: { authorization: 'tma ' + p } });
    assert.equal(r.status, 401);
  });
  await test('expired auth_date (2 days old, max 24 h) → 401 expired', async () => {
    const r = await call('GET', '/api/me', null, null, { headers: auth(alice, { authDate: Math.floor(Date.now() / 1000) - 2 * 86400 }) });
    assert.equal(r.status, 401); assert.match(r.data.error.message, /expired/);
  });
  await test('auth_date in the future → 401', async () => {
    const r = await call('GET', '/api/me', null, null, { headers: auth(alice, { authDate: Math.floor(Date.now() / 1000) + 3600 }) });
    assert.equal(r.status, 401);
  });
  await test('valid initData → /api/me', async () => {
    const r = await call('GET', '/api/me', alice);
    assert.equal(r.status, 200); assert.deepEqual(r.data, { id: '1001', firstName: 'Alice', isAdmin: false });
    assert.equal((await call('GET', '/api/me', admin)).data.isAdmin, true);
  });

  console.log('\nAvailability');
  await test('server-side availability: 14 days in studio time zone, no past slots', async () => {
    assert.equal(av.status, 200); assert.equal(av.data.timeZone, 'Europe/Berlin'); assert.equal(av.data.days.length, 14);
    const all = av.data.days.flatMap((d) => d.slots.map((s) => s.start));
    assert.ok(all.length > 50); assert.ok(all.every((s) => s > Date.now() + 59 * 60000), 'all slots ≥ 1 h notice');
  });

  console.log('\nBookings');
  let booking;
  await test('create booking → 201, owner + client notified via Bot API', async () => {
    stub.reset();
    const r = await call('POST', '/api/bookings', alice, { serviceId: 'gel-mani', staffId: 'mila', start: slotA, comment: 'Almond shape', clientName: 'Alice' }, { key: 'k-alice-1-abcdef' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); booking = r.data.booking;
    assert.equal(booking.start, slotA); assert.equal(booking.staffId, 'mila'); assert.equal(booking.status, 'confirmed');
    await sleep(700);
    assert.equal(sends(stub, '700000001').length, 1, 'owner notified'); assert.match(sends(stub, '700000001')[0].payload.text, /New booking/i);
    assert.equal(sends(stub, '1001').length, 1, 'client confirmation');
    assert.ok(stub.calls.every((c) => c.token === FAKE_BOT_TOKEN));
  });
  await test('idempotency: same key replays the same booking, no duplicate', async () => {
    const r = await call('POST', '/api/bookings', alice, { serviceId: 'gel-mani', staffId: 'mila', start: slotA, comment: 'Almond shape', clientName: 'Alice' }, { key: 'k-alice-1-abcdef' });
    assert.equal(r.status, 201); assert.equal(r.data.booking.id, booking.id); assert.equal(r.headers.get('idempotent-replay'), 'true');
    const mine = await call('GET', '/api/bookings', alice); assert.equal(mine.data.bookings.length, 1);
    const diff = await call('POST', '/api/bookings', alice, { serviceId: 'gel-mani', staffId: 'mila', start: slotA2, comment: '', clientName: 'Alice' }, { key: 'k-alice-1-abcdef' });
    assert.equal(diff.status, 422);
  });
  await test('missing Idempotency-Key → 400', async () => {
    const r = await call('POST', '/api/bookings', alice, { serviceId: 'gel-mani', staffId: 'mila', start: slotA2 });
    assert.equal(r.status, 400);
  });
  await test('booked slot disappears from availability; overlapping start → 409 slot_taken', async () => {
    const a = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    const starts = a.data.days[0].slots.map((s) => s.start);
    assert.ok(!starts.includes(slotA)); assert.ok(!starts.includes(slotA + 30 * 60000), 'overlapping start hidden');
    const r = await call('POST', '/api/bookings', bob, { serviceId: 'classic-mani', staffId: 'mila', start: slotA + 15 * 60000, clientName: 'Bob' }, { key: idem() });
    assert.ok([409, 422].includes(r.status)); assert.ok(['slot_taken', 'validation'].includes(r.data.error.code));
  });
  await test('not a real slot (off-grid / outside hours) → 422', async () => {
    const r = await call('POST', '/api/bookings', bob, { serviceId: 'gel-mani', staffId: 'mila', start: slotB + 7 * 60000, clientName: 'Bob' }, { key: idem() });
    assert.equal(r.status, 422);
  });

  console.log('\nConcurrency / double-booking');
  await test('10 users book the same slot at once → exactly one 201, nine 409', async () => {
    const reqs = Array.from({ length: 10 }, (_, i) => call('POST', '/api/bookings', user(2000 + i, 'C' + i), { serviceId: 'gel-mani', staffId: 'mila', start: slotB, clientName: 'C' + i }, { key: idem() }));
    const res = await Promise.all(reqs);
    const codes = res.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 201).length, 1, 'codes: ' + codes.join(','));
    assert.equal(codes.filter((c) => c === 409).length, 9, 'codes: ' + codes.join(','));
    const rows = JSON.parse(d1(`SELECT COUNT(*) AS n FROM bookings WHERE staff_id='mila' AND start_at=${slotB / 1000} AND status='confirmed'`))[0].results[0].n;
    assert.equal(rows, 1);
  });
  await test('DB guard: direct overlapping INSERT is aborted by the trigger (slot_taken)', async () => {
    d1(`INSERT OR IGNORE INTO customers (id, created_at, updated_at) VALUES ('3001', 0, 0)`);
    const s = slotB / 1000 + 20 * 60;
    assert.throws(() => d1(`INSERT INTO bookings (id, customer_id, service_id, staff_id, start_at, end_at, duration_min, price_cents, created_at, updated_at) VALUES ('raw-1','3001','classic-mani','mila',${s},${s + 2700},45,3000,0,0)`), /slot_taken/);
  });
  await test('DB guard: exact same staff+start blocked even with the trigger bypassed by status change', async () => {
    // Unique partial index on (staff_id, start_at) WHERE status='confirmed' — update a cancelled row back to confirmed onto a taken start
    d1(`INSERT INTO bookings (id, customer_id, service_id, staff_id, start_at, end_at, duration_min, price_cents, status, created_at, updated_at) VALUES ('raw-2','3001','gel-mani','mila',${slotB / 1000},${slotB / 1000 + 3600},60,4500,'cancelled',0,0)`);
    assert.throws(() => d1(`UPDATE bookings SET status='confirmed' WHERE id='raw-2'`), /slot_taken|UNIQUE/);
  });
  await test('"any" specialist books whoever is free; a second identical request gets the next free person', async () => {
    const a = await call('GET', `/api/availability?serviceId=classic-mani&staffId=any&from=${dayB.date}&days=1`, bob);
    const multi = a.data.days[0].slots.find((s) => s.staffIds.length >= 2);
    assert.ok(multi, 'a slot with ≥2 free specialists');
    const r1 = await call('POST', '/api/bookings', user(4001), { serviceId: 'classic-mani', staffId: 'any', start: multi.start }, { key: idem() });
    const r2 = await call('POST', '/api/bookings', user(4002), { serviceId: 'classic-mani', staffId: 'any', start: multi.start }, { key: idem() });
    assert.equal(r1.status, 201); assert.equal(r2.status, 201); assert.notEqual(r1.data.booking.staffId, r2.data.booking.staffId);
  });

  console.log('\nCancel & reschedule');
  await test('reschedule → new time, old slot freed, owner told "rescheduled"', async () => {
    stub.reset();
    const r = await call('POST', `/api/bookings/${booking.id}/reschedule`, alice, { start: slotA2, staffId: 'mila' }, { key: idem() });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.booking.start, slotA2);
    const a = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    assert.ok(a.data.days[0].slots.some((s) => s.start === slotA), 'old slot is free again');
    await sleep(700);
    assert.match(sends(stub, '700000001')[0]?.payload.text ?? '', /reschedul/i);
  });
  await test('reschedule onto a taken slot → 409 slot_taken, booking unchanged', async () => {
    const r = await call('POST', `/api/bookings/${booking.id}/reschedule`, alice, { start: slotB, staffId: 'mila' }, { key: idem() });
    assert.equal(r.status, 409); assert.equal(r.data.error.code, 'slot_taken');
    const mine = await call('GET', '/api/bookings', alice); assert.equal(mine.data.bookings[0].start, slotA2);
  });
  await test("another user cannot cancel Alice's booking → 404", async () => {
    const r = await call('POST', `/api/bookings/${booking.id}/cancel`, bob, {}, { key: idem() });
    assert.equal(r.status, 404);
  });
  await test('cancel → cancelled, slot freed, owner + client notified', async () => {
    stub.reset();
    const r = await call('POST', `/api/bookings/${booking.id}/cancel`, alice, {}, { key: idem() });
    assert.equal(r.status, 200); assert.equal(r.data.booking.status, 'cancelled');
    const a = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    assert.ok(a.data.days[0].slots.some((s) => s.start === slotA2));
    await sleep(700);
    assert.match(sends(stub, '700000001')[0]?.payload.text ?? '', /cancel/i); assert.equal(sends(stub, '1001').length, 1);
    const again = await call('POST', `/api/bookings/${booking.id}/cancel`, alice, {}, { key: idem() });
    assert.equal(again.status, 409);
  });

  console.log('\nAdmin');
  await test('non-admin gets 403 on every admin endpoint', async () => {
    const paths = [['GET', `/api/admin/schedule?date=${dayA.date}`], ['GET', '/api/admin/upcoming?days=7'], ['POST', '/api/admin/time-off'], ['DELETE', '/api/admin/time-off/x'], ['POST', '/api/admin/bookings/x/no-show']];
    for (const [m, p] of paths) assert.equal((await call(m, p, alice, m === 'POST' ? {} : undefined)).status, 403, p);
  });
  await test('admin: day schedule shows bookings with customer info', async () => {
    const r = await call('GET', `/api/admin/schedule?date=${dayB.date}`, admin);
    assert.equal(r.status, 200); assert.ok(r.data.bookings.length >= 3); assert.ok(r.data.bookings.some((b) => b.customer));
  });
  await test('admin: block time removes availability; unblock restores it', async () => {
    const a0 = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    const s0 = a0.data.days[0].slots;
    const from = s0[0].start, to = s0[0].start + 3 * 3600000;
    const r = await call('POST', '/api/admin/time-off', admin, { staffId: 'mila', start: from, end: to, reason: 'Training' });
    assert.equal(r.status, 201);
    const a1 = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    assert.ok(a1.data.days[0].slots.every((s) => s.start >= to || s.start + 3600000 <= from));
    const bk = await call('POST', '/api/bookings', bob, { serviceId: 'gel-mani', staffId: 'mila', start: from }, { key: idem() });
    assert.equal(bk.status, 409);
    assert.equal((await call('DELETE', `/api/admin/time-off/${r.data.timeOff.id}`, admin)).status, 200);
    const a2 = await call('GET', `/api/availability?serviceId=gel-mani&staffId=mila&from=${dayA.date}&days=1`, bob);
    assert.equal(a2.data.days[0].slots.length, s0.length);
  });
  await test('admin: no-show only for started appointments', async () => {
    const up = await call('GET', '/api/admin/upcoming?days=14', admin);
    const r = await call('POST', `/api/admin/bookings/${up.data.bookings[0].id}/no-show`, admin, {});
    assert.equal(r.status, 409);
    const s = Math.floor(Date.now() / 1000) - 1800;
    d1(`INSERT INTO bookings (id, customer_id, service_id, staff_id, start_at, end_at, duration_min, price_cents, created_at, updated_at) VALUES ('past-1','3001','nail-art','sofia',${s},${s + 1800},30,1500,0,0)`);
    const ok = await call('POST', '/api/admin/bookings/past-1/no-show', admin, {});
    assert.equal(ok.status, 200); assert.equal(ok.data.booking.status, 'no_show');
  });

  console.log('\nRate limiting');
  await test('per-user read limit → 429 with retry-after (other users unaffected)', async () => {
    const u = user(5555, 'Spam');
    const res = await Promise.all(Array.from({ length: 130 }, () => call('GET', '/api/me', u)));
    const limited = res.filter((r) => r.status === 429);
    assert.ok(limited.length >= 10, `429s: ${limited.length}`); assert.ok(Number(limited[0].headers.get('retry-after')) > 0);
    assert.equal((await call('GET', '/api/me', bob)).status, 200);
  });

  console.log('\nBot webhook');
  await test('webhook without / with a wrong secret_token → 401, nothing sent', async () => {
    stub.reset();
    const upd = { update_id: 1, message: { message_id: 1, chat: { id: 1001, type: 'private' }, from: { id: 1001, is_bot: false, first_name: 'Alice' }, text: '/start' } };
    const r1 = await fetch(API + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(upd) });
    const r2 = await fetch(API + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong-secret' }, body: JSON.stringify(upd) });
    assert.equal(r1.status, 401); assert.equal(r2.status, 401);
    await sleep(300); assert.equal(stub.calls.length, 0);
  });
  await test('/start with the right secret → reply with a Mini App (web_app) button', async () => {
    stub.reset();
    const upd = { update_id: 2, message: { message_id: 2, chat: { id: 1001, type: 'private' }, from: { id: 1001, is_bot: false, first_name: 'Alice' }, text: '/start' } };
    const r = await fetch(API + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, body: JSON.stringify(upd) });
    assert.equal(r.status, 200);
    await sleep(500);
    const m = sends(stub, 1001)[0];
    assert.ok(m, 'sendMessage called');
    assert.equal(m.payload.reply_markup.inline_keyboard[0][0].web_app.url, 'https://tg-booking-miniapp.pages.dev');
    const c = JSON.parse(d1(`SELECT bot_started FROM customers WHERE id='1001'`))[0].results[0];
    assert.equal(c.bot_started, 1);
  });

  // Stop Pages before starting the reminders Worker on the same local D1 state
  await be.stop();

  console.log('\nReminders Worker (Cron Trigger)');
  await test('due reminders are sent exactly once across repeated cron runs', async () => {
    stub.reset();
    const stub2 = await (await import('./bot-stub.mjs')).startBotStub(8789);
    const now = Math.floor(Date.now() / 1000);
    const s24 = now + 20 * 3600, s2 = now + 90 * 60, sNew = now + 5 * 3600;
    d1(`INSERT OR IGNORE INTO customers (id, created_at, updated_at) VALUES ('6001',0,0),('6002',0,0),('6003',0,0)`);
    d1(`INSERT INTO bookings (id, customer_id, service_id, staff_id, start_at, end_at, duration_min, price_cents, created_at, updated_at) VALUES
      ('rem-24','6001','brows','nora',${s24},${s24 + 1800},30,2500,${now - 3 * 86400},0),
      ('rem-2','6002','brows','nora',${s2},${s2 + 1800},30,2500,${now - 3 * 86400},0),
      ('rem-new','6003','brows','nora',${sNew},${sNew + 1800},30,2500,${now - 600},0)`);
    const wenv = { ...wranglerEnv };
    const proc = spawn(process.execPath, [WR, 'dev', '--test-scheduled', '--port', '18791', '--ip', '127.0.0.1', '--persist-to', PERSIST, '--var', 'TELEGRAM_API_BASE:http://127.0.0.1:8789', '--var', `BOT_TOKEN:${FAKE_BOT_TOKEN}`], { cwd: ROOT + 'workers/reminders', env: wenv, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
    try {
      for (let i = 0; i < 80; i++) { try { await fetch('http://127.0.0.1:18791/'); break; } catch { await sleep(500); } if (i === 79) throw new Error('worker did not start\n' + log); }
      for (let i = 0; i < 3; i++) { const r = await fetch('http://127.0.0.1:18791/cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*'); assert.equal(r.status, 200, (await r.text()) + log.slice(-1500)); await sleep(800); }
      const msgs = stub2.calls.filter((c) => c.method === 'sendMessage');
      const to = (id) => msgs.filter((m) => String(m.payload.chat_id) === id);
      assert.equal(to('6001').length, 1, '24 h reminder once: ' + JSON.stringify(msgs.map((m) => m.payload.chat_id)));
      assert.match(to('6001')[0].payload.text, /tomorrow|24/i);
      assert.equal(to('6002').length, 1, '2 h reminder once'); assert.match(to('6002')[0].payload.text, /2 h|soon|in 2/i);
      assert.equal(to('6003').length, 0, 'booked inside the 24 h window → no 24 h reminder');
      const flags = JSON.parse(d1(`SELECT id, reminder_24h_at, reminder_2h_at FROM bookings WHERE id LIKE 'rem-%' ORDER BY id`))[0].results;
      assert.ok(flags.find((f) => f.id === 'rem-24').reminder_24h_at > 0); assert.ok(flags.find((f) => f.id === 'rem-2').reminder_2h_at > 0);
    } finally { proc.kill('SIGTERM'); stub2.close(); await sleep(400); }
  });
} catch (e) {
  console.error('FATAL', e, be.log().slice(-3000));
} finally {
  try { await be.stop(); } catch {}
  failed = finish('api.json');
}
process.exit(failed ? 1 : 0);
