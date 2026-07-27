#!/usr/bin/env node
// Regression guard for the class of failure that let Sentry APPS-3S sit unnoticed for two
// days: a FATAL WatchdogTermination on release 1.5 at a 50% crash-free rate. Sentry had the
// data; nothing evaluated it and nobody was paged.
const assert = require('assert');
const { evaluateRelease } = require('../scripts/check-release-health.js');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures += 1; console.error(`  FAIL ${name}: ${e.message}`); }
};

check('fails the real 1.5 regression (50% crash-free)', () => {
  const r = evaluateRelease({ version: '1.5', crashFreeRate: 50, sessions: 100 });
  assert.strictEqual(r.status, 'failed');
  assert.match(r.reason, /50% < 95%/);
});

check('passes a healthy release (100% crash-free)', () => {
  const r = evaluateRelease({ version: '1.4', crashFreeRate: 100, sessions: 100 });
  assert.strictEqual(r.status, 'passed');
});

check('fails just below threshold (94.9%)', () => {
  assert.strictEqual(evaluateRelease({ version: 'x', crashFreeRate: 94.9, sessions: 50 }).status, 'failed');
});

check('passes exactly at threshold (95%)', () => {
  assert.strictEqual(evaluateRelease({ version: 'x', crashFreeRate: 95, sessions: 50 }).status, 'passed');
});

check('does NOT fail a release nobody has run yet (low sessions)', () => {
  // A brand-new release with 3 sessions must not page anyone at 3am.
  const r = evaluateRelease({ version: '1.6', crashFreeRate: 0, sessions: 3 });
  assert.strictEqual(r.status, 'skipped');
});

check('does NOT fail when Sentry reports no crash-free data', () => {
  const r = evaluateRelease({ version: '1.7', crashFreeRate: null, sessions: 500 });
  assert.strictEqual(r.status, 'skipped');
});

check('threshold is configurable', () => {
  assert.strictEqual(evaluateRelease({ version: 'x', crashFreeRate: 96, sessions: 99 }, { min: 99 }).status, 'failed');
});

console.log(failures ? `release health gate: ${failures} failed` : 'release health gate: all checks passed');
process.exit(failures ? 1 : 0);
