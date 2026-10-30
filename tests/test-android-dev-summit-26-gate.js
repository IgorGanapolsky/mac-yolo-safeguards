#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewAgentChange, inspectHostText } = require('../tools/android-dev-summit-26-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/android-dev-summit-26-gate.js'), 'utf8');
  assert.ok(source.includes("['simctl', 'list', 'devices', 'booted']"));
  assert.ok(!source.includes("['simctl', 'boot'"));
  assert.ok(!source.includes('emulator -avd'));

  const previewBoot = reviewAgentChange({
    task: 'check the compose preview',
    command: 'emulator -avd Pixel_6',
    skillPresent: true,
    deviceConnected: true,
  });
  assert.strictEqual(previewBoot.ok, false);
  assert.ok(ids(previewBoot).includes('emulator_boot_for_preview'));
  assert.strictEqual(previewBoot.measuredSpeedup, null);
  assert.strictEqual(previewBoot.bootedByThisCommand, false);

  const previewReady = reviewAgentChange({
    task: 'check the hermes-mobile preview',
    previewCommand: 'npm test -- --testPathPattern=Hud',
    skillPresent: true,
    deviceConnected: false,
    diff: 'adjust the card spacing',
  });
  assert.strictEqual(previewReady.ok, true);
  assert.strictEqual(previewReady.measuredSpeedup, null);

  const previewMissing = reviewAgentChange({
    task: 'check the compose preview',
    skillPresent: true,
    diff: 'layout tweak',
  });
  assert.ok(ids(previewMissing).includes('preview_not_ready'));

  const noSkill = reviewAgentChange({
    task: 'check the android preview',
    previewCommand: 'npm test',
    skillPresent: false,
    diff: 'layout tweak',
  });
  assert.ok(ids(noSkill).includes('domain_skill_missing'));

  const vendor = reviewAgentChange({
    task: 'update the readme',
    diff: 'Agents finished UI tasks 77% faster with 3x fewer tokens.',
  });
  assert.ok(ids(vendor).includes('vendor_speed_claim'));
  assert.strictEqual(vendor.measuredSpeedup, null);

  const empty = reviewAgentChange({ task: 'review the agent diff', diff: '   ' });
  assert.ok(ids(empty).includes('empty_diff'));

  const lightbuild = reviewAgentChange({
    task: 'swap the build',
    files: 'hermes-mobile/package.json',
    diff: 'lightbuild build app',
  });
  assert.ok(ids(lightbuild).includes('experimental_build_in_production'));

  const xr = reviewAgentChange({
    task: 'install the xr emulator',
    diff: 'add an xr emulator device',
  });
  assert.ok(ids(xr).includes('xr_emulator_refused'));

  const looseBoot = reviewAgentChange({
    purpose: 'ship',
    task: 'ship the release proof',
    command: 'emulator -avd Pixel_6',
    diff: 'boot a new emulator',
  });
  assert.ok(ids(looseBoot).includes('unlisted_emulator_boot'));

  const ship = reviewAgentChange({
    task: 'ship the e2e release proof',
    command: 'bash hermes-mobile/scripts/run-fresh-user-e2e.sh',
    diff: 'xcrun simctl boot kept inside the ship script',
    skillPresent: true,
  });
  assert.strictEqual(ship.ok, true);
  assert.strictEqual(ship.purpose, 'ship');

  const previewFlagBoot = reviewAgentChange({
    task: 'check the hermes-mobile preview',
    diff: 'spacing',
    previewCommand: 'emulator -avd Pixel_6',
    skillPresent: true,
    deviceConnected: true,
  });
  assert.strictEqual(previewFlagBoot.ok, false);
  assert.ok(ids(previewFlagBoot).includes('emulator_boot_for_preview'));

  const mentionedScript = reviewAgentChange({
    task: 'ship the release proof',
    command: 'xcrun simctl boot arbitrary-device',
    diff: 'Compare hermes-mobile/scripts/run-fresh-user-e2e.sh',
  });
  assert.strictEqual(mentionedScript.ok, false);
  assert.ok(ids(mentionedScript).includes('unlisted_emulator_boot'));

  const compound = reviewAgentChange({
    task: 'ship the e2e release proof',
    command: 'bash hermes-mobile/scripts/run-fresh-user-e2e.sh && emulator -avd Pixel_6',
    diff: 'ship script plus a second boot',
  });
  assert.ok(ids(compound).includes('unlisted_emulator_boot'));

  const unmeasured = reviewAgentChange({
    task: 'memory',
    diff: 'fixed the leak in the session list',
  });
  assert.ok(ids(unmeasured).includes('unmeasured_fix'));
  assert.ok(ids(unmeasured).includes('fix_not_rechecked'));

  const measured = reviewAgentChange({
    task: 'memory',
    diff: 'fixed the leak in the session list',
    measurement: 'dumpsys meminfo before 180MB after 140MB',
    rechecked: true,
  });
  assert.strictEqual(measured.ok, true);

  const submit = reviewAgentChange({
    task: 'submit the build to the app store',
    diff: 'version bump',
  });
  assert.ok(ids(submit).includes('policy_check_missing'));

  const typo = reviewAgentChange({
    task: 'fix a typo in the readme',
    diff: 'corrected the button label',
  });
  assert.strictEqual(typo.ok, true);

  const host = inspectHostText('List of devices attached\nR3CT\tdevice\n', 'iPhone (Booted)\n');
  assert.strictEqual(host.connectedDevices, 1);
  assert.strictEqual(host.bootedSimulators, 1);
  assert.strictEqual(host.bootedByThisCommand, false);
  assert.strictEqual(host.measuredSpeedup, null);

  const cli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/android-dev-summit-26-gate.js'),
    '--json',
  ], { encoding: 'utf8', cwd: path.join(__dirname, '..') });
  assert.strictEqual(cli.status, 0);
  const live = JSON.parse(cli.stdout);
  assert.strictEqual(live.bootedByThisCommand, false);
  assert.strictEqual(live.measuredSpeedup, null);
  assert.strictEqual(typeof live.connectedDevices, 'number');
  assert.ok(!cli.stdout.includes('77%'));

  const missingDiff = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/android-dev-summit-26-gate.js'),
    '--review',
    '--task',
    'review the agent change',
    '--json',
  ], { encoding: 'utf8', cwd: path.join(__dirname, '..') });
  assert.strictEqual(missingDiff.status, 2);
  const missingReport = JSON.parse(missingDiff.stdout);
  assert.strictEqual(missingReport.ok, false);
  assert.ok(missingReport.findings.some((item) => item.id === 'empty_diff'));
  assert.strictEqual(missingReport.measuredSpeedup, null);

  console.log('test-android-dev-summit-26-gate: PASS');
}

main();
