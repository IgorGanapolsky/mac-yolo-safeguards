#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  scanAlerts,
  openInvestigation,
  mitigateStep,
  closeInvestigation,
  stats,
} = require('../tools/alert-investigation-loop');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ail-'));
const latestFail = path.join(tmp, 'latest-fail.json');
const burn = path.join(tmp, 'burn.json');

fs.writeFileSync(
  latestFail,
  JSON.stringify({
    e2e: 'fail',
    unit: 'pass',
    detail: 'ship-guard failed',
    updatedAt: '2026-07-16T12:00:00Z',
  }),
);
fs.writeFileSync(
  burn,
  JSON.stringify({ burnAlertedDay: '2026-07-16', lastDegradedAt: Date.parse('2026-07-16T12:00:00Z') }),
);

test('scanAlerts surfaces e2e fail and burn', () => {
  const scan = scanAlerts({
    latestPath: latestFail,
    burnStatePath: burn,
    now: Date.parse('2026-07-16T12:30:00Z'),
  });
  assert.ok(scan.alertCount >= 2);
  assert.ok(scan.alerts.some((a) => a.id === 'continuous-e2e-fail'));
  assert.ok(scan.alerts.some((a) => a.id === 'hermes-token-burn'));
});

test('open → mitigate → close records ttmMs', () => {
  const stateDir = path.join(tmp, 'receipts');
  const t0 = Date.parse('2026-07-16T13:00:00Z');
  const alert = {
    id: 'continuous-e2e-fail',
    title: 'Continuous E2E failed',
    severity: 'high',
    detail: 'x',
    suggestedSteps: ['Read latest.json'],
  };
  const opened = openInvestigation(alert, { stateDir, now: t0 });
  assert.strictEqual(opened.status, 'open');
  mitigateStep(stateDir, opened.id, 'Read latest.json and kicked LaunchAgent', {
    now: t0 + 30_000,
  });
  const closed = closeInvestigation(stateDir, opened.id, 'mitigated', {
    now: t0 + 120_000,
  });
  assert.strictEqual(closed.status, 'closed');
  assert.strictEqual(closed.ttmMs, 120_000);
  const s = stats(stateDir);
  assert.strictEqual(s.closed, 1);
  assert.strictEqual(s.avgTtmMs, 120_000);
});

test('scan with pass latest returns no e2e-fail', () => {
  const passFile = path.join(tmp, 'latest-pass.json');
  fs.writeFileSync(
    passFile,
    JSON.stringify({ e2e: 'pass', unit: 'pass', updatedAt: '2026-07-16T12:00:00Z' }),
  );
  const scan = scanAlerts({
    latestPath: passFile,
    burnStatePath: path.join(tmp, 'no-burn.json'),
    now: Date.parse('2026-07-16T12:30:00Z'),
  });
  assert.ok(!scan.alerts.some((a) => a.id === 'continuous-e2e-fail'));
});

fs.rmSync(tmp, { recursive: true, force: true });

if (process.exitCode) {
  console.error('\nalert-investigation-loop tests FAILED');
  process.exit(1);
}
console.log('\nalert-investigation-loop tests OK');
