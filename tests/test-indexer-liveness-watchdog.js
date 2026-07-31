#!/usr/bin/env node
'use strict';

// Coverage for the indexer liveness watchdog.
//
// The property under test is the DISCRIMINATION, not the alarm. Anything can
// alert on "watermark is old". The hard part — and the reason the original
// outage stayed invisible for days — is telling apart:
//
//   IDLE     nothing changed, so an old watermark is CORRECT
//   STALLED  work is pending and the watermark is not advancing
//
// A watchdog that conflates them fires every quiet night, gets muted, and is
// then absent on the night that matters. Several tests below exist purely to
// prove the tool stays silent when it should.
//
// Every input is injected — no test touches ~/.hermes, git, or pgrep.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { assess, enforce, readWatermark } = require(path.join(ROOT, 'tools', 'indexer-liveness-watchdog.js'));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); pass += 1; } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`); fail += 1; process.exitCode = 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-'));
const corpus = path.join(dir, 'corpus');
fs.mkdirSync(path.join(corpus, '.grepai'), { recursive: true });

const NOW = '2026-07-31T12:00:00Z';
const ago = (min) => new Date(Date.parse(NOW) - min * 60000).toISOString();
const base = (over = {}) => ({
  corpus, now: NOW, pids: ['123'], graceMinutes: 30,
  watermark: ago(5), behind: 0, headTime: ago(10), ...over,
});

// --- the core discrimination ---------------------------------------------------

test('STALLED: alive, watermark frozen, work pending', () => {
  const r = assess(base({ watermark: ago(894), behind: 1, headTime: ago(60) }));
  assert.equal(r.state, 'STALLED');
  assert.match(r.reason, /liveness is not progress/);
  assert.match(r.reason, /894m/);
});

test('IDLE: watermark ancient but NOTHING pending — must not alarm', () => {
  // The false-positive that would get this watchdog muted.
  const r = assess(base({ watermark: ago(5000), behind: 0, headTime: ago(6000) }));
  assert.equal(r.state, 'IDLE', `an idle indexer must not be reported as stalled: ${r.reason}`);
  assert.match(r.reason, /not a fault/);
});

test('HEALTHY: work pending but the watermark advanced inside the grace window', () => {
  const r = assess(base({ watermark: ago(3), behind: 2, headTime: ago(4) }));
  assert.equal(r.state, 'HEALTHY');
});

test('a stall is detected from index-behind-content even at 0 commits behind', () => {
  // Corpus already pulled, but the index never caught up to the pulled content.
  const r = assess(base({ behind: 0, headTime: ago(200), watermark: ago(600) }));
  assert.equal(r.state, 'STALLED');
  assert.match(r.reason, /index older than corpus content/);
});

test('DEAD: no process at all', () => {
  const r = assess(base({ pids: null, behind: 1, headTime: ago(60), watermark: ago(600) }));
  assert.equal(r.state, 'DEAD');
  assert.match(r.reason, /cannot advance/);
});

test('DEAD is reported even when nothing is pending', () => {
  // A missing indexer is a fault regardless of queue depth.
  const r = assess(base({ pids: null, behind: 0, headTime: ago(6000), watermark: ago(5000) }));
  assert.equal(r.state, 'DEAD');
});

// --- cannot-determine is a failure --------------------------------------------

test('an unreadable watermark is UNKNOWN, never healthy', () => {
  const r = assess(base({ watermark: null }));
  assert.equal(r.state, 'UNKNOWN');
  assert.match(r.reason, /cannot read/);
});

test('a missing corpus is UNKNOWN, never healthy', () => {
  const r = assess({ ...base(), corpus: path.join(dir, 'nope') });
  assert.equal(r.state, 'UNKNOWN');
});

// --- the grace window is real --------------------------------------------------

test('grace is honoured at its boundary and breached just past it', () => {
  const inside = assess(base({ watermark: ago(29), behind: 1, headTime: ago(40) }));
  const outside = assess(base({ watermark: ago(31), behind: 1, headTime: ago(40) }));
  assert.equal(inside.state, 'HEALTHY', 'inside grace must not alarm');
  assert.equal(outside.state, 'STALLED', 'past grace with work pending must alarm');
});

// --- watermark parsing ---------------------------------------------------------

test('readWatermark parses the space-separated timestamp grepai writes', () => {
  const cfg = path.join(corpus, '.grepai', 'config.yaml');
  fs.writeFileSync(cfg, 'watch:\n    debounce_ms: 500\n    last_index_time: 2026-07-30 19:28:45.587184-04:00\n');
  const d = readWatermark(cfg);
  assert.ok(d instanceof Date && !Number.isNaN(d.getTime()), 'must parse the real on-disk format');
  assert.equal(d.getUTCFullYear(), 2026);
});

test('readWatermark returns null rather than a guess when the field is absent', () => {
  const cfg = path.join(dir, 'no-watermark.yaml');
  fs.writeFileSync(cfg, 'watch:\n    debounce_ms: 500\n');
  assert.equal(readWatermark(cfg), null);
});

test('reading the watermark NEVER rewrites the config', () => {
  // A YAML round-trip here corrupts the timestamp and takes the index down.
  const cfg = path.join(dir, 'immutable.yaml');
  const body = 'watch:\n    last_index_time: 2026-07-30 19:28:45.587184-04:00\n';
  fs.writeFileSync(cfg, body);
  const before = fs.readFileSync(cfg, 'utf8');
  readWatermark(cfg);
  assert.equal(fs.readFileSync(cfg, 'utf8'), before, 'config bytes must be untouched');
});

// --- enforcement gating --------------------------------------------------------

test('enforce refuses to restart a HEALTHY or IDLE indexer', () => {
  for (const state of ['HEALTHY', 'IDLE']) {
    const r = enforce({ state, pids: ['1'] }, { corpus, dryRun: true });
    assert.equal(r.restarted, false, `${state} must not be restarted`);
    assert.match(r.reason, /does not warrant/);
  }
});

test('enforce would restart on STALLED and on DEAD', () => {
  for (const state of ['STALLED', 'DEAD']) {
    const r = enforce({ state, pids: ['1'] }, { corpus, dryRun: true });
    assert.equal(r.wouldRestart, true, `${state} must warrant a restart`);
  }
});

console.log(`\n=== indexer-liveness-watchdog: ${pass} passed, ${fail} failed ===`);
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
