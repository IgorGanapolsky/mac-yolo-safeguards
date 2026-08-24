#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  createExecutor,
  honesty,
  COUNSEL_CLEARANCE,
  HOSTED_PRICE_USD,
} = require('../tools/hosted-browser-ref-batch');

const TOOL = path.join(__dirname, '..', 'tools', 'hosted-browser-ref-batch.js');
const BIN = path.join(__dirname, '..', 'bin', 'hosted-browser-ref-batch');

console.log('=== test-hosted-browser-ref-batch ===');

assert.equal(COUNSEL_CLEARANCE, false);
assert.equal(HOSTED_PRICE_USD, 10);
assert.equal(honesty().anthropicRunsTheBrowser, false);
assert.equal(honesty().clonedAnthropicToolset, false);
assert.equal(honesty().notComputerUse, true);
assert.equal(honesty().clonedContinuityPicker, false);

const page = {
  url: 'https://example.com/form',
  refs: { ref_3: { role: 'button', name: 'Submit' }, ref_1: { role: 'textbox', name: 'Email' } },
};

{
  const ex = createExecutor();
  const read = ex.readPage(page);
  assert.equal(read.ok, true);
  assert.equal(read.snapshotId, 'snap_1');
  const click = ex.act({ op: 'left_click', ref: 'ref_3', snapshotId: 'snap_1' });
  assert.equal(click.decision, 'allow');
}

{
  const ex = createExecutor();
  const pixel = ex.act({ op: 'left_click', x: 640, y: 320 });
  assert.equal(pixel.deny, 'coords_not_refs');
  const coord = ex.act({ op: 'left_click', coordinate: { x: 10, y: 20 } });
  assert.equal(coord.deny, 'coords_not_refs');
  const noRef = ex.act({ op: 'left_click' });
  assert.equal(noRef.deny, 'coords_not_refs');
}

{
  const ex = createExecutor();
  ex.readPage(page);
  const nav = ex.act({ op: 'navigate', url: 'https://example.com/next' });
  assert.equal(nav.refsInvalidated, true);
  const stale = ex.act({ op: 'left_click', ref: 'ref_3', snapshotId: 'snap_1' });
  assert.equal(stale.deny, 'stale_ref');
  assert.equal(stale.requireReadPage, true);
}

{
  const ex = createExecutor();
  const missing = ex.act({ op: 'left_click', ref: 'ref_3' });
  assert.equal(missing.deny, 'stale_ref');
}

{
  const ex = createExecutor();
  const js = ex.act({ op: 'javascript_exec', code: 'alert(1)' });
  assert.equal(js.decision, 'confirm');
  assert.equal(js.deny, 'javascript_exec_requires_approval');
  const upload = ex.act({ op: 'file_upload', path: '/tmp/x' });
  assert.equal(upload.deny, 'file_upload_requires_approval');
}

{
  const ex = createExecutor();
  const extra = ex.act({ op: 'read_network' });
  assert.equal(extra.deny, 'optional_member_disabled');
}

{
  const ex = createExecutor();
  const meta = ex.act({ op: 'navigate', url: 'http://169.254.169.254/' });
  assert.equal(meta.deny, 'host_blocked');
}

{
  const ex = createExecutor();
  ex.readPage(page);
  const batch = ex.runBatch([
    { op: 'left_click', x: 640, y: 320 },
    { op: 'form_input', ref: 'ref_1', snapshotId: 'snap_1' },
    { op: 'left_click', ref: 'ref_3', snapshotId: 'snap_1' },
  ]);
  assert.equal(batch.stopped, true);
  assert.equal(batch.stop.deny, 'coords_not_refs');
  assert.equal(batch.executed.length, 1);
  assert.equal(batch.skippedCount, 2);
}

{
  const ex = createExecutor();
  ex.readPage(page);
  const batch = ex.runBatch([
    { op: 'left_click', ref: 'ref_3', snapshotId: 'snap_1' },
    { op: 'file_upload' },
    { op: 'form_input', ref: 'ref_1', snapshotId: 'snap_1' },
  ]);
  assert.equal(batch.stop.decision, 'confirm');
  assert.equal(batch.executed[0].decision, 'allow');
  assert.equal(batch.skippedCount, 1);
  assert.equal(batch.skipped[0].op, 'form_input');
}

function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
}

{
  const denied = run(TOOL, ['--act', JSON.stringify({ op: 'left_click', x: 640, y: 320 }), '--json']);
  assert.equal(denied.status, 2);
  assert.equal(JSON.parse(denied.stdout).deny, 'coords_not_refs');
}

{
  const ok = run(TOOL, ['--honesty', '--json']);
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).hostedHermesPriceUsd, 10);
}

{
  const binDenied = run(BIN, ['--act', JSON.stringify({ op: 'javascript_exec' }), '--json']);
  assert.equal(binDenied.status, 2);
}

console.log('PASS');
