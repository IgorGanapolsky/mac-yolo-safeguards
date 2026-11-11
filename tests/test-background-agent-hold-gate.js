#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewBackgroundAgent, SOURCE } = require('../tools/background-agent-hold-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.agentLeftRunning, false);
  assert.strictEqual(report.projectWritten, false);
  assert.strictEqual(report.localSpeedup, null);
  assert.strictEqual(report.localDetailGain, null);
  assert.strictEqual(report.source, SOURCE);
  const body = JSON.stringify(report);
  assert.ok(!body.includes('buy.stripe.com'));
  assert.ok(!body.includes('checkout.stripe.com'));
  assert.ok(!body.includes('/go/'));
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/background-agent-hold-gate.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('exec('));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/localSpeedup\s*[:=]\s*(true|false|[0-9])/.test(source));
  assert.ok(!/localDetailGain\s*[:=]\s*(true|false|[0-9])/.test(source));

  const clear = reviewBackgroundAgent({
    action: 'note',
    command: 'cat /Users/iganapolsky/workspace/mac-yolo-safeguards/README.md',
    note: 'Premiere is closed. Leave the media cache alone.',
  });
  assert.strictEqual(clear.ok, true);
  assert.strictEqual(clear.status, 'clear');
  assert.strictEqual(clear.humanReview, false);
  assertHeld(clear);

  const cited = reviewBackgroundAgent({
    action: 'note',
    note: 'See https://news.adobe.com/news/2026/11/adobe-powers-new-era-of-creativity',
  });
  assert.strictEqual(cited.ok, true);
  assertHeld(cited);

  const announced = reviewBackgroundAgent({
    action: 'note',
    note: 'Adobe announced always-on agents that continue working in the background when creators step away.',
  });
  assert.strictEqual(announced.ok, true);
  assertHeld(announced);

  const attributed = reviewBackgroundAgent({
    action: 'note',
    note: 'Adobe says the models deliver richer detail.',
  });
  assert.strictEqual(attributed.ok, true);
  assertHeld(attributed);

  const readProject = reviewBackgroundAgent({
    action: 'note',
    command: 'open poster.psd',
  });
  assert.strictEqual(readProject.ok, true);
  assertHeld(readProject);

  const industry = reviewBackgroundAgent({
    action: 'note',
    note: 'A choice of top industry AI models.',
  });
  assert.strictEqual(industry.ok, true);

  const away = reviewBackgroundAgent({
    action: 'note',
    note: 'Keep an always-on agent running after the person steps away.',
  });
  assert.strictEqual(away.ok, false);
  assert.ok(ids(away).includes('background_agent'));
  assert.strictEqual(away.humanReview, true);
  assert.strictEqual(away.agentLeftRunning, false);
  assertHeld(away);

  for (const action of ['background', 'always-on']) {
    const blocked = reviewBackgroundAgent({ action });
    assert.ok(ids(blocked).includes('background_agent'), action);
    assert.strictEqual(blocked.humanReview, true);
    assertHeld(blocked);
  }

  const install = reviewBackgroundAgent({ action: 'install' });
  assert.ok(ids(install).includes('vendor_install'));
  assert.strictEqual(install.humanReview, false);
  assertHeld(install);

  for (const command of [
    'npm install firefly',
    'enable local MCP for Premiere',
    'add Creative Cloud',
  ]) {
    const blocked = reviewBackgroundAgent({ action: 'note', command });
    assert.ok(ids(blocked).includes('vendor_install'), command);
    assertHeld(blocked);
  }

  for (const command of ['save logo.ai', 'export final.prproj', 'overwrite poster.psd', 'cp take.mov spot.aep']) {
    const blocked = reviewBackgroundAgent({ action: 'note', command });
    assert.ok(ids(blocked).includes('project_write'), command);
    assert.strictEqual(blocked.projectWritten, false);
    assertHeld(blocked);
  }

  const writeAction = reviewBackgroundAgent({ action: 'write-project' });
  assert.ok(ids(writeAction).includes('project_write'));
  assert.strictEqual(writeAction.humanReview, false);

  const localClaim = reviewBackgroundAgent({
    action: 'note',
    note: 'We delivered richer detail and hosted the world\'s largest creativity conference.',
  });
  assert.ok(ids(localClaim).includes('vendor_claim_as_local'));
  assert.strictEqual(localClaim.humanReview, false);
  assertHeld(localClaim);

  const stacked = reviewBackgroundAgent({
    action: 'install',
    note: 'Keep a background agent running. We delivered richer detail.',
    command: 'save logo.ai',
  });
  assert.ok(ids(stacked).includes('vendor_install'));
  assert.ok(ids(stacked).includes('background_agent'));
  assert.ok(ids(stacked).includes('project_write'));
  assert.ok(ids(stacked).includes('vendor_claim_as_local'));
  assert.strictEqual(stacked.humanReview, true);
  assert.strictEqual(stacked.applied, false);
  assertHeld(stacked);

  const clearCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/background-agent-hold-gate.js'),
    '--action', 'note',
    '--note', 'Premiere is closed.',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.applied, false);

  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/background-agent-hold-gate.js'),
    '--action', 'background',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.ok(blockedReport.findings.some((item) => item.id === 'background_agent'));
  assert.strictEqual(blockedReport.agentLeftRunning, false);

  console.log('test-background-agent-hold-gate: PASS');
}

main();
