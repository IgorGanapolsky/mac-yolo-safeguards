#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewDecisionHold } = require('../tools/gemini-decisions-hold-gate');
const { hostnameOf } = require('../tools/lib/safe-url-host');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeldShape(report) {
  assert.strictEqual(report.purchased, false);
  assert.strictEqual(report.emailSent, false);
  assert.strictEqual(report.remoteCall, false);
  assert.strictEqual(report.localLatencyMs, null);
  assert.strictEqual(report.localCostPerMillionUsd, null);
  assert.strictEqual(report.localCheaperMultiple, null);
  assert.strictEqual(report.localLatencyDrop, null);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'emailSent',
    'findings',
    'localCheaperMultiple',
    'localCostPerMillionUsd',
    'localLatencyDrop',
    'localLatencyMs',
    'offer',
    'ok',
    'purchased',
    'remoteCall',
    'source',
    'status',
  ]);
  if (report.offer) assert.strictEqual(hostnameOf(report.offer.url), 'macyolosafeguards.io');
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/gemini-decisions-hold-gate.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/localLatencyMs\s*[:=]\s*[0-9]/.test(source));

  const pro = reviewDecisionHold({
    action: 'hold',
    signal: 'Cursor froze my Mac and filled swap',
  });
  assert.strictEqual(pro.ok, true);
  assert.strictEqual(pro.status, 'held');
  assert.strictEqual(pro.offer.path, '/go/pro');
  assert.strictEqual(pro.offer.label, 'Mac YOLO Pro Guard');
  assertHeldShape(pro);

  const diagnostic = reviewDecisionHold({
    action: 'hold',
    signal: 'Claude Code filled the disk on this Mac. Please diagnose what is wrong.',
  });
  assert.strictEqual(diagnostic.status, 'held');
  assert.strictEqual(diagnostic.offer.path, '/go/diagnostic');
  assertHeldShape(diagnostic);

  const sprint = reviewDecisionHold({
    action: 'hold',
    signal: 'Our team Macs keep freezing under Codex',
  });
  assert.strictEqual(sprint.status, 'held');
  assert.strictEqual(sprint.offer.path, '/go/sprint');
  assertHeldShape(sprint);

  const ambiguous = reviewDecisionHold({
    action: 'hold',
    signal: 'Please diagnose the sprint for our team Macs that freeze under Cursor',
  });
  assert.strictEqual(ambiguous.ok, true);
  assert.strictEqual(ambiguous.status, 'human');
  assert.strictEqual(ambiguous.offer, null);
  assertHeldShape(ambiguous);

  const broward = reviewDecisionHold({
    action: 'hold',
    signal: 'Check upcoming Broward sales against court and property records',
  });
  assert.strictEqual(broward.ok, false);
  assert.strictEqual(broward.status, 'blocked');
  assert.ok(ids(broward).includes('other_business'));
  assert.strictEqual(broward.offer, null);
  assertHeldShape(broward);

  const pilot = reviewDecisionHold({
    action: 'hold',
    signal: 'Cursor froze our Mac. We want the partner pilot.',
  });
  assert.strictEqual(pilot.status, 'human');
  assert.strictEqual(pilot.offer, null);

  const quiet = reviewDecisionHold({
    action: 'note',
    signal: 'What is a decision model?',
  });
  assert.strictEqual(quiet.ok, true);
  assert.strictEqual(quiet.status, 'clear');
  assert.strictEqual(quiet.offer, null);
  assertHeldShape(quiet);

  const named = reviewDecisionHold({ action: 'note', note: 'gemini' });
  assert.strictEqual(named.ok, true);

  const remote = reviewDecisionHold({
    action: 'call',
    signal: 'Cursor froze my Mac and filled swap',
  });
  assert.strictEqual(remote.ok, false);
  assert.ok(ids(remote).includes('remote_call'));
  assert.strictEqual(remote.offer, null);
  assert.strictEqual(remote.remoteCall, false);

  const endpoint = reviewDecisionHold({
    action: 'note',
    note: 'POST https://generativelanguage.googleapis.com/v1beta/decisions with GEMINI_API_KEY',
  });
  assert.ok(ids(endpoint).includes('remote_call'));
  assert.strictEqual(endpoint.offer, null);

  const recorded = reviewDecisionHold({
    action: 'record',
    note: 'We measured 150-250 ms, $0.10, 5x cheaper, and 40% lower latency.',
  });
  assert.ok(ids(recorded).includes('vendor_figure_as_local'));
  assert.strictEqual(recorded.localLatencyMs, null);
  assert.strictEqual(recorded.localCostPerMillionUsd, null);

  const cited = reviewDecisionHold({
    action: 'note',
    note: "Google's post says 150-250 ms, $0.10 per 1M, 5x cheaper, and 40% lower latency.",
  });
  assert.strictEqual(cited.ok, true);
  assert.strictEqual(cited.status, 'clear');
  assertHeldShape(cited);

  const plainPercent = reviewDecisionHold({ action: 'note', note: 'the page is 40% done' });
  assert.strictEqual(plainPercent.ok, true);

  const send = reviewDecisionHold({ action: 'send', signal: 'Cursor froze my Mac and filled swap' });
  assert.ok(ids(send).includes('send_or_charge'));
  assert.strictEqual(send.offer, null);
  assert.strictEqual(send.emailSent, false);

  const charge = reviewDecisionHold({ action: 'charge', signal: 'Cursor froze my Mac' });
  assert.ok(ids(charge).includes('send_or_charge'));
  assert.strictEqual(charge.purchased, false);

  const checkout = reviewDecisionHold({
    action: 'note',
    note: 'open checkout at buy.stripe.com for the freeze',
  });
  assert.ok(ids(checkout).includes('send_or_charge'));

  const gate = path.join(__dirname, '../tools/gemini-decisions-hold-gate.js');
  const clear = spawnSync(process.execPath, [
    gate,
    '--action', 'hold',
    '--signal', 'Cursor froze my Mac and filled swap',
  ], { encoding: 'utf8' });
  assert.strictEqual(clear.status, 0, clear.stdout + clear.stderr);

  const blockedCli = spawnSync(process.execPath, [
    gate,
    '--action', 'call',
    '--signal', 'Cursor froze my Mac and filled swap',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.strictEqual(blockedReport.remoteCall, false);
  assert.strictEqual(blockedReport.emailSent, false);
  assert.strictEqual(blockedReport.purchased, false);

  console.log('test-gemini-decisions-hold-gate: PASS');
}

main();
