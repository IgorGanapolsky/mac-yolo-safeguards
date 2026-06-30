'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  decision,
  parseArgs,
  taskSignals,
  writeReceipt,
} = require('../tools/hermes-economic-router');

assert.throws(() => parseArgs([]), /--task is required/);
assert.throws(() => parseArgs(['--task', 'x', '--risk', 'huge']), /Unsupported risk/);
assert.throws(() => parseArgs(['--task', 'x', '--max-cost-usd', '-1']), /non-negative/);

const routine = decision(parseArgs([
  '--task', 'quick local smoke test for hermes-yolo',
  '--risk', 'low',
  '--max-cost-usd', '0',
  '--latency-ms', '10000',
]));
assert.strictEqual(routine.selectedRoute.id, 'local_fast');
assert.strictEqual(routine.selectedRoute.model, 'qwen2.5:3b-64k');
assert.strictEqual(routine.estimatedCostUsd, 0);
assert.strictEqual(routine.requiresApproval, false);
assert(routine.pipeline.some((stage) => stage.id === 'treasurer'));

const glm = decision(parseArgs([
  '--task', 'are you sure? use GLM 5.2 for cross-file architecture debugging with proof',
  '--risk', 'high',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(glm.selectedRoute.id, 'glm52_reasoning');
assert.strictEqual(glm.selectedRoute.model, 'glm-5.2');
assert.strictEqual(glm.selectedRoute.provider, 'custom:zai-coding-glm');
assert.strictEqual(glm.requiresApproval, false);

const glmNoBudget = decision(parseArgs([
  '--task', 'use GLM 5.2 for a proof check',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert.notStrictEqual(glmNoBudget.selectedRoute.id, 'glm52_reasoning');
assert(
  glmNoBudget.rejectedRoutes.some((route) => route.id === 'glm52_reasoning' && route.reasons.some((reason) => reason.includes('paid route'))),
);

const ornith = decision(parseArgs([
  '--task', 'benchmark Ornith as an open-source coding model candidate',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert.strictEqual(ornith.selectedRoute.id, 'local_coder_candidate');
assert.strictEqual(ornith.selectedRoute.candidateOnly, true);
assert(ornith.selectedRoute.proofGates.includes('benchmark-before-default'));

const mobile = decision(parseArgs([
  '--task', 'verify Hermes Mobile release with Maestro E2E proof',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '180000',
]));
assert.strictEqual(mobile.selectedRoute.id, 'mobile_e2e_gate');
assert(mobile.pipeline.some((stage) => stage.agent === 'mobile-verifier'));

const payment = decision(parseArgs([
  '--task', 'prepare stablecoin wallet payment follow-up but do not send',
  '--risk', 'critical',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(taskSignals(payment.task).paidOrExternal, true);
assert.strictEqual(payment.requiresApproval, true);
assert(payment.pipeline.some((stage) => stage.id === 'approval-gate'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-economic-router-'));
const receiptPath = path.join(tmp, 'receipts.jsonl');
writeReceipt(routine, receiptPath);
const lines = fs.readFileSync(receiptPath, 'utf8').trim().split('\n');
assert.strictEqual(lines.length, 1);
assert.strictEqual(JSON.parse(lines[0]).id, routine.id);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('Hermes economic router tests: PASS');
