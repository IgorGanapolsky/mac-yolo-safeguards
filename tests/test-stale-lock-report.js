#!/usr/bin/env node
// plan.md locks are append-only and never expire, so agents must hand-audit before reclaiming.
// On 2026-07-27 that audit cost real time on three separate locks. This encodes the rules.
//
// The first version of this detector called 310 of 405 claims reclaimable — including claims
// filed an hour earlier — because it treated "no §1 task row" as staleness. A detector that
// says "steal anything" is worse than none: it causes the collisions the gate exists to stop.
const assert = require('assert');
const { parsePlan } = require('../tools/stale-lock-report.js');

const TODAY = '2026-07-27';
const run = (md, opts = {}) => parsePlan(md, { today: TODAY, ...opts });

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures += 1; console.error(`  FAIL ${name}: ${e.message}`); }
};

const task = (owner, status) => `| T-X | title | ${status} | ${owner} | \`a.ts\` | outcome |`;
const claim = (owner, date) => `- \`src/a.ts\`, \`plan.md\` → **${owner}** (T-X: reason) (${date}T00:00:00Z)`;

check('a fresh claim with no task row is NOT reclaimable', () => {
  // The exact false positive that made v1 useless.
  const [c] = run([claim('agent-today', '2026-07-27')].join('\n'));
  assert.strictEqual(c.stale, false, `expected fresh claim to be safe, got: ${c.reasons}`);
});

check('an orphaned claim older than 3d IS reclaimable', () => {
  const [c] = run([claim('agent-orphan', '2026-07-23')].join('\n'));
  assert.strictEqual(c.stale, true);
  assert.match(c.reasons.join(), /no task row/);
});

check('a claim whose task is done IS reclaimable even when recent', () => {
  const md = [task('agent-done', 'done'), claim('agent-done', '2026-07-26')].join('\n');
  const [c] = run(md);
  assert.strictEqual(c.stale, true);
  assert.match(c.reasons.join(), /done/);
});

check('an in_progress task protects its claim regardless of age', () => {
  const md = [task('agent-live', 'in_progress'), claim('agent-live', '2026-06-01')].join('\n');
  const [c] = run(md);
  // age still flags it, but the reason must never be "task finished"
  assert.ok(!/status: done/.test(c.reasons.join()));
});

check('released lines are ignored entirely', () => {
  const md = '- released `src/a.ts` → **agent-x** (done) (2026-06-01)';
  assert.strictEqual(run(md).length, 0);
});

check('blocked and pending count as active, not finished', () => {
  for (const s of ['blocked', 'pending']) {
    const md = [task(`agent-${s}`, s), claim(`agent-${s}`, '2026-07-26')].join('\n');
    assert.ok(!/status:/.test(run(md)[0].reasons.join()), `${s} treated as finished`);
  }
});

console.log(failures ? `stale-lock report: ${failures} failed` : 'stale-lock report: all checks passed');
process.exit(failures ? 1 : 0);
