// Tiny test harness (no extra deps): sequential tests, summary, JSON report.
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
export { assert };
const results = [];
export async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: String(e?.stack || e) }); console.log(`  ✗ ${name}\n    ${String(e?.message || e).split('\n').join('\n    ')}`); }
}
export function finish(file) {
  const failed = results.filter((r) => !r.ok).length;
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../reports/${file}`, import.meta.url), JSON.stringify({ passed: results.length - failed, failed, results }, null, 2));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  return failed;
}
