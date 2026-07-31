'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runCycle, WATERMARK, ISOLATED, FULL_REBUILD_EVERY } = require('../tools/index-microbatch');

test('FULL_REBUILD_EVERY is a positive backstop cadence', () => {
  assert.ok(FULL_REBUILD_EVERY >= 2);
});

test('runCycle no-op or heal reports stable shape', () => {
  if (!fs.existsSync(ISOLATED)) {
    // Environment without isolated grepae clone — still prove failure is structured.
    const report = runCycle({ heal: false });
    assert.equal(report.ok, false);
    assert.ok(report.error);
    return;
  }
  const report = runCycle({ heal: false });
  assert.ok(report.checkedAt);
  assert.ok(report.triggers);
  assert.equal(typeof report.ok, 'boolean');
  // When watcher is up and watermark current, skip is success.
  if (report.skipped) assert.equal(report.ok, true);
});

test('watermark path is under isolated corpus', () => {
  assert.ok(WATERMARK.includes('semantic-index'));
  assert.ok(WATERMARK.endsWith('.index-watermark.json'));
});
