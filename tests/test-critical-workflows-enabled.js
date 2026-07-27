#!/usr/bin/env node
// On 2026-07-27 a production Android release was blocked because "Internal Distribution" was
// disabled_manually — the only way to earn the internal-signoff/* statuses the release gate
// requires. Nobody knew until a release needed it, and NO COMMIT disabled it (UI toggle), so
// code review could never have caught it. Same shape as OTA compiled out of the binary:
// a safety net switched off silently.
const assert = require('assert');
const { evaluate, CRITICAL } = require('../tools/assert-critical-workflows-enabled.js');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures += 1; console.error(`  FAIL ${name}: ${e.message}`); }
};
const active = (names) => names.map((name) => ({ name, state: 'active' }));

check('all active = no problems', () => {
  assert.deepStrictEqual(evaluate(active(CRITICAL)), []);
});

check('the exact 2026-07-27 failure is detected', () => {
  const wf = active(CRITICAL).map((w) =>
    w.name === 'Internal Distribution' ? { ...w, state: 'disabled_manually' } : w,
  );
  const p = evaluate(wf);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].name, 'Internal Distribution');
  assert.match(p[0].reason, /silently gone/);
});

check('a renamed or deleted workflow is caught, not silently skipped', () => {
  const wf = active(CRITICAL).filter((w) => w.name !== 'CI');
  const p = evaluate(wf);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].state, 'MISSING');
});

check('disabled_inactivity counts too (GitHub auto-disables idle cron workflows)', () => {
  // GitHub disables scheduled workflows after 60 days of repo inactivity — same blast radius.
  const wf = active(CRITICAL).map((w) =>
    w.name === 'Release health' ? { ...w, state: 'disabled_inactivity' } : w,
  );
  assert.strictEqual(evaluate(wf).length, 1);
});

check('non-critical workflows being disabled is NOT an error', () => {
  const wf = [...active(CRITICAL), { name: 'Some Experiment', state: 'disabled_manually' }];
  assert.deepStrictEqual(evaluate(wf), []);
});

console.log(failures ? `critical workflow guard: ${failures} failed` : 'critical workflow guard: all checks passed');
process.exit(failures ? 1 : 0);
