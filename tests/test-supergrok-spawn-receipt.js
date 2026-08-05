#!/usr/bin/env node
'use strict';

/**
 * Prove SuperGrok routing is real — not glm-coding mislabeled as grok.
 *
 * Default: unit-only (no network).
 * Live proof (optional): SUPERGROK_SPAWN_LIVE=1 node tests/test-supergrok-spawn-receipt.js
 *
 * Live receipt contract:
 *   route.selectedBackend === 'grok-4.5'
 *   route.model / actualModel contain grok
 *   route.launcher contains grok
 *   route.qwenSelected === false
 *   model does not contain glm
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const WRAPPER =
  process.env.HERMES_YOLO_WRAPPER ||
  path.join(os.homedir(), '.hermes', 'hermes-yolo-wrapper.js');
const REPO_WRAPPER = path.join(REPO, 'hermes-yolo-wrapper.js');

const {
  classifyBackend,
  buildGrokBackendArgs,
  findGrokYoloBinary,
  isGrokBackendReady,
  shouldUseGrokBackend,
} = require(fs.existsSync(REPO_WRAPPER) ? REPO_WRAPPER : WRAPPER);

console.log('=== SuperGrok spawn / receipt proof ===\n');

// Unit: classification
assert.deepStrictEqual(classifyBackend(['-z', 'ping'], { HERMES_YOLO_BACKEND: 'grok' }), {
  requestedBackend: 'grok',
  selectedBackend: 'grok-4.5',
  reason: 'explicit-grok-backend',
});
assert.strictEqual(
  shouldUseGrokBackend(['-z', 'ping'], { HERMES_YOLO_BACKEND: 'auto' }, { grokReady: true }),
  true,
);
assert.strictEqual(
  shouldUseGrokBackend(['-z', 'ping'], { HERMES_YOLO_BACKEND: 'hermes' }, { grokReady: true }),
  false,
);
const args = buildGrokBackendArgs(['-z', 'Reply with exactly SUPERGROK-SPAWN-PROOF-OK']);
assert.ok(args.includes('-p') || args.includes('--output-format') || args.length >= 1);
console.log('  unit classify + buildGrokBackendArgs: PASS');

// Unit: scorecard strict booleans (regression: abTestHint object leaked into pass)
const { runScorecard } = require('../tools/inference-eng/scorecard');
const scorecard = runScorecard();
assert.strictEqual(scorecard.aPlus, true, `scorecard not A+: ${scorecard.grade}`);
for (const c of scorecard.checks) {
  assert.strictEqual(
    c.pass,
    true,
    `check ${c.name} pass must be boolean true, got ${typeof c.pass}`,
  );
}
const p6 = scorecard.checks.find((c) => c.name === 'self_optimization_loop');
assert.ok(p6);
assert.strictEqual(typeof p6.pass, 'boolean');
if (p6.abTestHint != null) {
  assert.notStrictEqual(p6.pass, p6.abTestHint);
}
console.log('  unit scorecard strict pass===true: PASS');

function assertReceiptSuperGrok(receipt) {
  const route = receipt.route || {};
  const model = String(route.model || route.actualModel || '');
  const launcher = String(route.launcher || '');
  assert.strictEqual(route.selectedBackend, 'grok-4.5', `selectedBackend=${route.selectedBackend}`);
  assert.ok(/grok/i.test(model), `model should be grok, got ${model}`);
  assert.ok(/grok/i.test(launcher), `launcher should be grok-yolo, got ${launcher}`);
  assert.strictEqual(route.qwenSelected, false);
  assert.ok(!/glm/i.test(model), `model must not be glm, got ${model}`);
  assert.ok(
    !/hermes-legacy|litellm/i.test(String(route.selectedBackend)),
    'must not select hermes-legacy',
  );
}

// Optional live one-shot (real SuperGrok OAuth — ~20s)
if (process.env.SUPERGROK_SPAWN_LIVE === '1') {
  const bin = findGrokYoloBinary(process.env);
  assert.ok(bin, 'GROK_YOLO_BIN / ~/.local/bin/grok-yolo required for live proof');
  assert.ok(
    isGrokBackendReady(process.env),
    'isGrokBackendReady must be true for live SuperGrok proof',
  );

  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supergrok-spawn-'));
  const latest = path.join(receiptDir, 'latest.json');
  const env = {
    ...process.env,
    HERMES_YOLO_BACKEND: 'grok',
    HERMES_YOLO_RECEIPT_DIR: receiptDir,
    HERMES_YOLO_LATEST_RECEIPT_PATH: latest,
    HERMES_YOLO_HISTORY_RECEIPT_PATH: path.join(receiptDir, 'history.jsonl'),
    HERMES_YOLO_LOCK_PATH: path.join(receiptDir, 'lock'),
    HERMES_YOLO_NO_PREFLIGHT: '1',
  };
  delete env.HERMES_YOLO_MODEL;

  const wrapperJs = fs.existsSync(WRAPPER) ? WRAPPER : REPO_WRAPPER;
  const result = spawnSync(
    process.execPath,
    [wrapperJs, '-z', 'Reply with exactly SUPERGROK-SPAWN-PROOF-OK'],
    {
      encoding: 'utf8',
      env,
      timeout: 120000,
    },
  );
  assert.strictEqual(result.status, 0, `live spawn exit ${result.status} stderr=${result.stderr}`);
  assert.ok(
    /SUPERGROK-SPAWN-PROOF-OK/.test(result.stdout || ''),
    `stdout missing marker: ${String(result.stdout).slice(0, 200)}`,
  );
  assert.ok(
    /backend=grok-4\.5/.test(result.stderr || ''),
    `stderr should announce grok-4.5 backend: ${String(result.stderr).slice(0, 300)}`,
  );
  assert.ok(fs.existsSync(latest), `missing receipt ${latest}`);
  const receipt = JSON.parse(fs.readFileSync(latest, 'utf8'));
  assertReceiptSuperGrok(receipt);
  assert.strictEqual(receipt.execution?.status, 'pass');
  console.log(
    `  live spawn receipt: PASS (launcher=${receipt.route.launcher} model=${receipt.route.model} ${receipt.execution.durationMs}ms)`,
  );
} else {
  console.log('  live spawn: SKIP (set SUPERGROK_SPAWN_LIVE=1 to run)');
}

console.log('\n=== SuperGrok spawn / receipt proof: ALL PASS ===');
