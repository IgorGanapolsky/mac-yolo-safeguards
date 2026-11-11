#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewOpenShellPolicy, SOURCE } = require('../tools/openshell-policy-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.sandboxCreated, false);
  assert.strictEqual(report.credentialAttached, false);
  assert.strictEqual(report.localKernelEnforced, null);
  assert.strictEqual(report.localFormalProof, null);
  assert.strictEqual(report.source, SOURCE);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'applied',
    'credentialAttached',
    'findings',
    'humanReview',
    'localFormalProof',
    'localKernelEnforced',
    'ok',
    'sandboxCreated',
    'source',
    'status',
  ]);
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/openshell-policy-gate.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes("require('https')"));
  assert.ok(!source.includes("require('http')"));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('exec('));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('process.env'));
  assert.ok(!/localKernelEnforced\s*[:=]\s*(true|false|[0-9])/.test(source));
  assert.ok(!/localFormalProof\s*[:=]\s*(true|false|[0-9])/.test(source));

  const clear = reviewOpenShellPolicy({
    action: 'note',
    command: 'cat /Users/iganapolsky/workspace/mac-yolo-safeguards/README.md',
    proposedHosts: ['127.0.0.1'],
    currentHosts: ['127.0.0.1'],
    credentials: false,
  });
  assert.strictEqual(clear.ok, true);
  assert.strictEqual(clear.status, 'clear');
  assert.strictEqual(clear.humanReview, false);
  assertHeld(clear);

  const cited = reviewOpenShellPolicy({
    action: 'note',
    note: 'See https://github.com/NVIDIA/OpenShell',
  });
  assert.strictEqual(cited.ok, true);
  assertHeld(cited);

  const attributed = reviewOpenShellPolicy({
    action: 'note',
    note: "NVIDIA's OpenShell uses kernel-level enforcement and formally verified policy changes.",
  });
  assert.strictEqual(attributed.ok, true);
  assertHeld(attributed);

  const sameHost = reviewOpenShellPolicy({
    action: 'note',
    proposedHosts: ['api.openai.com'],
    currentHosts: ['API.OpenAI.com'],
  });
  assert.strictEqual(sameHost.ok, true);
  assertHeld(sameHost);

  const localClaim = reviewOpenShellPolicy({
    action: 'note',
    note: 'We have kernel-level enforcement and a formally verified policy.',
  });
  assert.strictEqual(localClaim.ok, false);
  assert.ok(ids(localClaim).includes('vendor_claim_as_local'));
  assert.strictEqual(localClaim.humanReview, false);
  assertHeld(localClaim);

  const telemetryClaim = reviewOpenShellPolicy({
    action: 'note',
    note: 'We collect anonymous telemetry.',
  });
  assert.ok(ids(telemetryClaim).includes('vendor_claim_as_local'));
  assertHeld(telemetryClaim);

  const widen = reviewOpenShellPolicy({
    action: 'note',
    proposedHosts: ['api.openai.com'],
    currentHosts: [],
  });
  assert.strictEqual(widen.ok, false);
  assert.ok(ids(widen).includes('policy_widening'));
  assert.strictEqual(widen.humanReview, true);
  assert.strictEqual(widen.applied, false);
  assertHeld(widen);

  const extraHost = reviewOpenShellPolicy({
    action: 'note',
    proposedHosts: ['127.0.0.1', 'api.openai.com'],
    currentHosts: ['127.0.0.1'],
  });
  assert.ok(ids(extraHost).includes('policy_widening'));

  for (const action of ['install', 'sandbox', 'widen']) {
    const blocked = reviewOpenShellPolicy({ action });
    assert.strictEqual(blocked.ok, false, action);
    assertHeld(blocked);
  }
  assert.ok(ids(reviewOpenShellPolicy({ action: 'install' })).includes('vendor_install'));
  assert.ok(ids(reviewOpenShellPolicy({ action: 'sandbox' })).includes('vendor_install'));
  assert.ok(ids(reviewOpenShellPolicy({ action: 'widen' })).includes('policy_widening'));
  assert.strictEqual(reviewOpenShellPolicy({ action: 'widen' }).humanReview, true);

  const commands = [
    'openshell sandbox create --name demo',
    'curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh',
    'npx skills add NVIDIA/OpenShell',
    'uv add openshell',
    'npm install @nvidia/openshell-sdk',
    'cargo add openshell-sdk',
    'go get github.com/ai-openshell/sdk-go',
    'docker run --rm ghcr.io/nvidia/openshell',
    'podman pull openshell:latest',
  ];
  for (const command of commands) {
    const blocked = reviewOpenShellPolicy({ action: 'note', command });
    assert.ok(ids(blocked).includes('vendor_install'), command);
    assertHeld(blocked);
  }

  const otherContainer = reviewOpenShellPolicy({
    action: 'note',
    command: 'docker run --rm nginx',
  });
  assert.strictEqual(otherContainer.ok, true);

  const telemetryOn = reviewOpenShellPolicy({
    action: 'note',
    note: 'OPENSHELL_TELEMETRY_ENABLED=true',
  });
  assert.ok(ids(telemetryOn).includes('telemetry_enable'));
  assertHeld(telemetryOn);

  const serverTelemetry = reviewOpenShellPolicy({
    action: 'note',
    note: 'server.telemetryEnabled=true',
  });
  assert.ok(ids(serverTelemetry).includes('telemetry_enable'));

  const telemetryOff = reviewOpenShellPolicy({
    action: 'note',
    note: 'OPENSHELL_TELEMETRY_ENABLED=false',
  });
  assert.strictEqual(telemetryOff.ok, true);
  assertHeld(telemetryOff);

  const credential = reviewOpenShellPolicy({
    action: 'note',
    credentials: true,
    note: 'attach a credential',
  });
  assert.ok(ids(credential).includes('policy_widening'));
  assert.strictEqual(credential.credentialAttached, false);
  assert.strictEqual(credential.humanReview, true);

  const stacked = reviewOpenShellPolicy({
    action: 'install',
    proposedHosts: ['api.openai.com'],
    currentHosts: [],
    note: 'We have kernel-level enforcement.',
  });
  assert.ok(ids(stacked).includes('vendor_install'));
  assert.ok(ids(stacked).includes('vendor_claim_as_local'));
  assert.ok(ids(stacked).includes('policy_widening'));
  assert.strictEqual(stacked.humanReview, true);
  assert.strictEqual(stacked.applied, false);
  assertHeld(stacked);

  const clearCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/openshell-policy-gate.js'),
    '--action', 'note',
    '--command', 'cat README.md',
    '--proposed', '127.0.0.1',
    '--current', '127.0.0.1',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.applied, false);

  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/openshell-policy-gate.js'),
    '--action', 'install',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.ok(blockedReport.findings.some((item) => item.id === 'vendor_install'));
  assert.strictEqual(blockedReport.sandboxCreated, false);

  console.log('test-openshell-policy-gate: PASS');
}

main();
