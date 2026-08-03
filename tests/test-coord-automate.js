#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

test('SAFE_SCRUB_REASONS exported', () => {
  const { SAFE_SCRUB_REASONS } = require('../tools/linear-agent-bridge');
  assert.ok(SAFE_SCRUB_REASONS.includes('linear_done_still_locked'));
  assert.ok(SAFE_SCRUB_REASONS.includes('lock_on_unstarted'));
  assert.ok(SAFE_SCRUB_REASONS.includes('vault_says_released'));
});

test('coord-automate --ci exit 0', () => {
  const r = spawnSync(process.execPath, ['tools/coord-automate.js', '--ci', '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.mode, 'ci');
  assert.strictEqual(j.ok, true);
  assert.ok(j.preflight && j.preflight.ok);
});

test('offlinePreflight export', () => {
  const { offlinePreflight } = require('../tools/coord-automate');
  const r = offlinePreflight();
  assert.ok(r.ok, JSON.stringify(r.results?.filter((x) => !x.ok)));
});

console.log('test-coord-automate: done');
