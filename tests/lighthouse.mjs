// Lighthouse (mobile form factor, default throttling) against the preview build.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
const LH = process.env.LH_PATH || '/workspace/cms-demo/scripts/node_modules/lighthouse/cli/index.js';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8798';
const out = new URL('../reports/lighthouse-mobile.json', import.meta.url).pathname;
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
execFileSync(process.execPath, [LH, BASE + '/', '--quiet', '--output=json', `--output-path=${out}`, '--form-factor=mobile',
  '--chrome-flags=--headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist'],
  { env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH || '/usr/bin/google-chrome' }, stdio: 'inherit' });
const r = JSON.parse(readFileSync(out, 'utf8'));
const scores = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
const m = (id) => r.audits[id]?.displayValue;
console.log('Lighthouse mobile:', scores, { FCP: m('first-contentful-paint'), LCP: m('largest-contentful-paint'), TBT: m('total-blocking-time'), CLS: m('cumulative-layout-shift') });
const CORE = ['performance', 'accessibility', 'best-practices', 'seo']; // 'agentic-browsing' is experimental: reported only
const failed = Object.entries(scores).filter(([k, s]) => CORE.includes(k) && s < 90);
if (failed.length) { console.log('Below 90:', failed); process.exit(1); }
