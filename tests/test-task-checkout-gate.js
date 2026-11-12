#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewTaskCheckout, SOURCE, DEFAULT_SHARED } = require('../tools/task-checkout-gate');

const OWN = '/Users/iganapolsky/workspace/wt-task-checkout-20261112';
const OTHER = '/Users/iganapolsky/workspace/wt-other-task';

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.devboxStarted, false);
  assert.strictEqual(report.firewallInstalled, false);
  assert.strictEqual(report.sharedWrite, false);
  assert.strictEqual(report.localSupplyChainPrevented, null);
  assert.strictEqual(report.localTimeToOperational, null);
  assert.strictEqual(report.source, SOURCE);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'applied',
    'devboxStarted',
    'findings',
    'firewallInstalled',
    'humanReview',
    'localSupplyChainPrevented',
    'localTimeToOperational',
    'ok',
    'sharedWrite',
    'source',
    'status',
  ]);
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/task-checkout-gate.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('exec('));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/localSupplyChainPrevented\s*[:=]\s*(true|false|[0-9])/.test(source));
  assert.ok(!/localTimeToOperational\s*[:=]\s*(true|false|[0-9"'])/.test(source));

  const cited = reviewTaskCheckout({
    action: 'note',
    note: 'See ' + SOURCE,
  });
  assert.strictEqual(cited.ok, true);
  assert.strictEqual(cited.humanReview, false);
  assertHeld(cited);

  const worktree = reviewTaskCheckout({
    action: 'task',
    taskPath: OWN,
    otherTaskPath: OTHER,
    command: 'git worktree add ' + OWN,
    note: 'Each task gets a git worktree. See ' + SOURCE,
  });
  assert.strictEqual(worktree.ok, true);
  assert.strictEqual(worktree.status, 'clear');
  assertHeld(worktree);

  const quoted = reviewTaskCheckout({
    action: 'note',
    note: 'depthfirst says the system was operational in less than a week and mentions preventing supply chain attacks.',
  });
  assert.strictEqual(quoted.ok, true);
  assertHeld(quoted);

  const install = reviewTaskCheckout({ action: 'install' });
  assert.ok(ids(install).includes('vendor_install'));
  assert.strictEqual(install.humanReview, false);
  assert.strictEqual(install.firewallInstalled, false);
  assertHeld(install);

  for (const command of [
    'npm install dependency firewall',
    'enable the dependency firewall',
    'brew install dfc',
    'install depthfirst',
  ]) {
    const blocked = reviewTaskCheckout({ action: 'note', command });
    assert.ok(ids(blocked).includes('vendor_install'), command);
    assertHeld(blocked);
  }

  const devbox = reviewTaskCheckout({ action: 'devbox' });
  assert.ok(ids(devbox).includes('remote_devbox'));
  assert.strictEqual(devbox.humanReview, true);
  assert.strictEqual(devbox.devboxStarted, false);
  assertHeld(devbox);

  for (const note of [
    'provision a private ec2',
    'launch a devbox',
    'tailscale up to the devbox',
    'dfc up',
  ]) {
    const blocked = reviewTaskCheckout({ action: 'note', note });
    assert.ok(ids(blocked).includes('remote_devbox'), note);
    assert.strictEqual(blocked.humanReview, true);
    assert.strictEqual(blocked.devboxStarted, false);
    assertHeld(blocked);
  }

  for (const input of [
    { action: 'share' },
    { action: 'task', taskPath: '' },
    { action: 'task', taskPath: DEFAULT_SHARED },
    { action: 'task', taskPath: DEFAULT_SHARED + '/' },
    { action: 'task', taskPath: DEFAULT_SHARED + '/tools' },
    { action: 'task', taskPath: OWN, otherTaskPath: OWN },
    { action: 'note', command: 'git checkout -b feat/example' },
  ]) {
    const blocked = reviewTaskCheckout(input);
    assert.ok(ids(blocked).includes('shared_checkout'), JSON.stringify(input));
    assert.strictEqual(blocked.humanReview, false);
    assert.strictEqual(blocked.sharedWrite, false);
    assertHeld(blocked);
  }

  const week = reviewTaskCheckout({
    action: 'note',
    note: 'We are operational in less than a week.',
  });
  assert.ok(ids(week).includes('vendor_claim_as_local'));
  assert.strictEqual(week.localTimeToOperational, null);
  assertHeld(week);

  const load = reviewTaskCheckout({
    action: 'note',
    note: 'This cut security-engineering load by roughly 70%.',
  });
  assert.ok(ids(load).includes('vendor_claim_as_local'));
  assert.strictEqual(load.localSupplyChainPrevented, null);
  assertHeld(load);

  const cves = reviewTaskCheckout({
    action: 'note',
    note: 'We remediated hundreds of CVEs.',
  });
  assert.ok(ids(cves).includes('vendor_claim_as_local'));
  assertHeld(cves);

  const stacked = reviewTaskCheckout({
    action: 'install',
    note: 'We are operational in less than a week.',
    command: 'git checkout -b feat/example',
    taskPath: DEFAULT_SHARED,
  });
  assert.ok(ids(stacked).includes('vendor_install'));
  assert.ok(ids(stacked).includes('shared_checkout'));
  assert.ok(ids(stacked).includes('vendor_claim_as_local'));
  assert.strictEqual(stacked.applied, false);
  assert.strictEqual(stacked.sharedWrite, false);
  assertHeld(stacked);

  const clearCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/task-checkout-gate.js'),
    '--action', 'task',
    '--task-path', OWN,
    '--other-task-path', OTHER,
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.applied, false);
  assert.strictEqual(clearReport.devboxStarted, false);

  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/task-checkout-gate.js'),
    '--action', 'devbox',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.ok(blockedReport.findings.some((item) => item.id === 'remote_devbox'));
  assert.strictEqual(blockedReport.devboxStarted, false);
  assert.strictEqual(blockedReport.humanReview, true);

  console.log('test-task-checkout-gate: PASS');
}

main();
