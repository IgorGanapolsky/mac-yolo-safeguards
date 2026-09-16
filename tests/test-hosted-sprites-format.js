#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const fmt = require('../tools/hosted-sprites-format');

const REPO = path.resolve(__dirname, '..');

function run() {
  assert.strictEqual(fmt.SCHEMA, 'hosted-sprites-format/v1');
  assert.ok(fmt.NEVER_BUY.includes('sprites'));
  assert.ok(fmt.NEVER_BUY.includes('sbd'));
  assert.ok(fmt.NEVER_BUY.includes('phoenix.new'));
  assert.strictEqual(fmt.PROTECTED_APP, 'igor-hermes-cloud-runner');
  console.log('PASS 1 invariants: refuse SKUs, protect the one Machine');

  const buy = fmt.classify('pip install sprites-py and point Claude at https://sprites.dev/mcp');
  assert.strictEqual(buy.place, 'refuse');
  assert.strictEqual(buy.reason, 'SPRITES_SKU_FORBIDDEN');
  assert.strictEqual(buy.buy, false);
  const sbd = fmt.classify('enable SBD Sprites block device private beta');
  assert.strictEqual(sbd.place, 'refuse');
  const phoenix = fmt.classify('subscribe to phoenix.new $20');
  assert.strictEqual(phoenix.place, 'refuse');
  const keep = fmt.classify('keep the one Fly Machine always-on');
  assert.strictEqual(keep.place, 'hosted-vps');
  assert.strictEqual(keep.reason, 'EXISTING_FLY_MACHINE_NOT_SPRITES');
  console.log('PASS 2 route: Sprites/SBD/phoenix refuse; existing Machine stays');

  const map = fmt.formatMap();
  assert.ok(map.mcpReachWithoutInstall.ours.includes('https://thumbgate.app/api/health'));
  assert.ok(!map.mcpReachWithoutInstall.ours.includes('https://sprites.dev/mcp'));
  assert.strictEqual(map.mcpReachWithoutInstall.claim, 'probe_not_live_e2e');
  assert.match(map.resourceNotPaste.ours, /resourceRef/);
  assert.match(map.checkpointNotSbd.ours, /heartbeat/);
  console.log('PASS 3 format map: reach/receipt/checkpoint without Sprites URLs as ours');

  const checkpoint = fmt.inspectCheckpoint(REPO);
  assert.strictEqual(checkpoint.kind, 'CONTROL_PLANE_CHECKPOINT');
  assert.strictEqual(checkpoint.vmDiskIsSourceOfTruth, false);
  assert.strictEqual(checkpoint.sbdPresent, false);
  assert.strictEqual(checkpoint.hasReceiptPointer, true);
  assert.strictEqual(checkpoint.hasInboundHeartbeat, true);
  console.log('PASS 4 live checkpoint rails are D1+heartbeat, not SBD');

  const doc = fmt.runDoctor({ repoRoot: REPO });
  assert.strictEqual(doc.weAreSprites, false);
  assert.strictEqual(doc.weAreSbd, false);
  assert.strictEqual(doc.buySprites, false);
  assert.strictEqual(doc.status, 'FORMAT_MAPPED_SKU_REFUSED');
  assert.strictEqual(doc.probeClaim, 'probe_not_live_e2e');
  console.log('PASS 5 doctor: FORMAT mapped, SKU refused, probe is not LIVE e2e');

  const cli = path.join(REPO, 'bin', 'hosted-sprites-format');
  const cliDoc = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliDoc.status, 0, cliDoc.stderr);
  assert.strictEqual(JSON.parse(cliDoc.stdout).status, 'FORMAT_MAPPED_SKU_REFUSED');
  const cliRefuse = spawnSync(cli, ['route', 'npm install @fly/sprites'], { encoding: 'utf8' });
  assert.strictEqual(cliRefuse.status, 2, cliRefuse.stderr);
  assert.strictEqual(JSON.parse(cliRefuse.stdout).reason, 'SPRITES_SKU_FORBIDDEN');
  const cliKeep = spawnSync(cli, ['route', 'use the fenced VPS'], { encoding: 'utf8' });
  assert.strictEqual(cliKeep.status, 0, cliKeep.stderr);
  assert.strictEqual(JSON.parse(cliKeep.stdout).place, 'hosted-vps');
  console.log('PASS 6 CLI doctor + refuse/exit 2');

  console.log('\nALL HOSTED-SPRITES-FORMAT TESTS PASSED (6/6)');
}

run();
