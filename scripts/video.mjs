// Records a ~25 s walkthrough (browser preview, 390×844 @2x) and frames it into a 1280×768 MP4 + animated WebP.
import { chromium } from '/workspace/booking-demo/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8798';
const OUT = process.env.SHOTS_DIR || '/workspace/tg-booking-miniapp-shots';
const TMP = '/tmp/tgb-video'; rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const FF = '/usr/bin/ffmpeg';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/Berlin', colorScheme: 'light' });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
const frames = []; let recording = false;
const cdp = await ctx.newCDPSession(p);
cdp.on('Page.screencastFrame', async (f) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); if (recording) frames.push({ t: f.metadata.timestamp, data: f.data }); });
await p.clock.install({ time: Date.parse('2026-10-26T07:40:00Z') });
const t0 = Date.now();
await p.goto(BASE + '/'); await p.waitForSelector('[data-testid=greeting]');
await p.waitForTimeout(400);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 }); recording = true;
const w = (ms) => p.waitForTimeout(ms);
const mb = p.locator('[data-testid=main-button]');
await w(1600);
await p.click('[data-testid=service-gel-mani]'); await w(1100);
await p.click('[data-testid=staff-any]'); await w(700);
await mb.click(); await p.waitForSelector('[data-testid=slot]'); await w(900);
await p.click('[data-testid=day-2026-10-28]'); await w(900);
await p.locator('[data-testid=slot]').nth(4).click(); await w(900);
await mb.click(); await w(700);
await p.locator('[data-testid=client-name]').pressSequentially('Anna', { delay: 120 }); await w(300);
await p.locator('[data-testid=comment]').pressSequentially('Short almond, soft nude', { delay: 45 }); await p.locator('[data-testid=comment]').blur(); await w(900);
await mb.click(); await p.waitForSelector('[data-testid=success][data-status=done]'); await w(1800);
await p.click('[data-testid=to-bookings]'); await w(1400);
await p.click('[data-testid=theme-toggle]'); await w(1400);
await p.click('[data-testid=tab-book]'); await w(600);
await p.mouse.wheel(0, 900); await w(900);
await p.click('[data-testid=admin-toggle]'); await w(500);
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await w(700);
await p.click('[data-testid=tab-studio]'); await w(2200);
recording = false; await cdp.send('Page.stopScreencast'); await ctx.close();
// write frames + concat list with real timings
const lines = [];
frames.forEach((f, i) => { writeFileSync(`${TMP}/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64')); const d = i + 1 < frames.length ? frames[i + 1].t - f.t : 1.0; lines.push(`file 'f${String(i).padStart(5, '0')}.jpg'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); });
lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
writeFileSync(`${TMP}/list.txt`, lines.join('\n'));
const TOTAL = (frames.at(-1).t - frames[0].t + 1).toFixed(2); console.log('frames', frames.length, TOTAL);

// Frame: background + copy (under), phone bezel with a transparent screen (over)
const VW = 1280, VH = 768, SCALE = 0.82, PW = 390 * SCALE, PH = 844 * SCALE, X = 760, Y = (VH - PH) / 2;
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.setContent(`<!doctype html><html><body style="margin:0;width:${VW}px;height:${VH}px;overflow:hidden;background:linear-gradient(140deg,#fbf6f8 0%,#f6e9ef 60%,#f1dde7 100%);font-family:system-ui,sans-serif;color:#1b1416">
  <div style="position:absolute;width:520px;height:520px;right:-140px;top:-200px;border-radius:50%;background:#b22f64;filter:blur(70px);opacity:.2"></div>
  <div style="position:absolute;left:80px;top:${VH / 2 - 150}px;width:560px">
    <div style="font:600 14px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#b22f64">Telegram Mini App · booking demo</div>
    <div style="font:800 46px/1.08 system-ui;letter-spacing:-.02em;margin-top:14px">Petalune Nail Studio</div>
    <div style="font:400 19px/1.45 system-ui;margin-top:14px;color:#5e5258">Service → specialist → time → confirm.<br>Reschedule or cancel in “My bookings”.<br>Light &amp; dark, studio admin view.</div>
    <div style="display:inline-block;margin-top:26px;font:500 14px/1 system-ui;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.75);color:#5e5258">Demo by Ivan Litvin · fictional studio, sample prices</div>
  </div></body></html>`);
await page.screenshot({ path: `${TMP}/bg.png` });
const B = 12, R = 44;
execFileSync('/home/box/.venv-img/bin/python', ['-c', `
from PIL import Image, ImageDraw, ImageFilter
X,Y,PW,PH,B,R=${X},${Y},${PW},${PH},${B},${R}
S=4
bz=Image.new('RGBA',(${VW}*S,${VH}*S),(0,0,0,0)); d=ImageDraw.Draw(bz)
d.rounded_rectangle([(X-B)*S,(Y-B)*S,(X+PW+B)*S,(Y+PH+B)*S],radius=(R+B)*S,fill=(29,27,28,255))
d.rounded_rectangle([X*S,Y*S,(X+PW)*S,(Y+PH)*S],radius=R*S,fill=(0,0,0,0))
bz=bz.resize((${VW},${VH}),Image.LANCZOS)
sh=Image.new('RGBA',(${VW},${VH}),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([X-B,Y-B+18,X+PW+B,Y+PH+B+10],radius=R+B,fill=(40,10,25,110)); sh=sh.filter(ImageFilter.GaussianBlur(22))
bg=Image.open('${TMP}/bg.png').convert('RGBA'); bg.alpha_composite(sh); bg.convert('RGB').save('${TMP}/bg.png')
bz.save('${TMP}/bezel.png')
mw,mh=${Math.round(PW / 2) * 2},${Math.round(PH / 2) * 2}
m=Image.new('L',(mw*S,mh*S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,mw*S-1,mh*S-1],radius=R*S,fill=255); m.resize((mw,mh),Image.LANCZOS).save('${TMP}/mask.png')
`]);
await browser.close();

const filter = `[1:v]fps=30,scale=${Math.round(PW / 2) * 2}:${Math.round(PH / 2) * 2}:flags=lanczos,format=rgba[vv];[3:v]format=gray[m];[vv][m]alphamerge[v];[0:v][v]overlay=${Math.round(X)}:${Math.round(Y)}:shortest=1[a];[a][2:v]overlay=0:0:shortest=1,format=yuv420p[out]`;
execFileSync(FF, ['-y', '-loglevel', 'error', '-loop', '1', '-i', `${TMP}/bg.png`, '-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`, '-loop', '1', '-i', `${TMP}/bezel.png`, '-loop', '1', '-i', `${TMP}/mask.png`, '-filter_complex', filter, '-map', '[out]', '-t', TOTAL, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', '-an', `${OUT}/petalune-miniapp-demo.mp4`]);
execFileSync(FF, ['-y', '-loglevel', 'error', '-i', `${OUT}/petalune-miniapp-demo.mp4`, '-vf', 'fps=12,scale=640:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '62', '-compression_level', '6', '-loop', '0', '-an', `${OUT}/petalune-miniapp-demo.webp`]);
console.log('video done');
