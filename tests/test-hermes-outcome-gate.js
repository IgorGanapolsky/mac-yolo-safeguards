'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReceipt,
  parseArgs,
  render,
  writeReceipt,
} = require('../tools/hermes-outcome-gate');

const passArgs = parseArgs([
  '--task-id', 't301-local-smoke',
  '--execution-status', 'pass',
  '--verification-status', 'pass',
  '--execution-evidence-id', 'focused-tests-pass',
  '--verification-evidence-id', 'independent-smoke-pass',
  '--duration-ms', '1250',
  '--actual-cost-usd', '0.001',
  '--max-cost-usd', '0.01',
  '--value-signal', 'latency-measured',
  '--value-signal', 'tests-pass',
]);
const passed = buildReceipt(passArgs, { nowMs: Date.parse('2026-07-14T03:00:00.000Z') });
assert.strictEqual(passed.schema, 'hermes-outcome-gate/receipt-v1');
assert.strictEqual(passed.overallStatus, 'pass');
assert.strictEqual(passed.completion.completed, true);
assert.strictEqual(passed.completion.draftOnly, false);
assert.strictEqual(passed.stages.delivery.status, 'not-required');
assert.deepStrictEqual(passed.metrics.valueSignals, ['latency-measured', 'tests-pass']);
assert(!JSON.stringify(passed).includes('private prompt'));

const draftOnly = buildReceipt(parseArgs([
  '--task-id', 'draft-only',
  '--execution-status', 'skipped',
  '--verification-status', 'skipped',
]), { nowMs: Date.parse('2026-07-14T03:01:00.000Z') });
assert.strictEqual(draftOnly.overallStatus, 'blocked');
assert.strictEqual(draftOnly.completion.completed, false);
assert.strictEqual(draftOnly.completion.draftOnly, true);
assert.strictEqual(draftOnly.completion.failureStage, 'execution');

const missingProof = buildReceipt(parseArgs([
  '--task-id', 'missing-proof',
  '--execution-status', 'pass',
  '--verification-status', 'pass',
]), { nowMs: Date.parse('2026-07-14T03:02:00.000Z') });
assert.strictEqual(missingProof.overallStatus, 'blocked');
assert(missingProof.completion.blockers.includes('execution_evidence_missing'));
assert(missingProof.completion.blockers.includes('verification_evidence_missing'));

const delivered = buildReceipt(parseArgs([
  '--task-id', 'external-delivery',
  '--execution-status', 'pass',
  '--verification-status', 'pass',
  '--delivery-required',
  '--delivery-status', 'pass',
  '--execution-evidence-id', 'execution-receipt',
  '--verification-evidence-id', 'verification-receipt',
  '--delivery-evidence-id', 'delivery-receipt',
]), { nowMs: Date.parse('2026-07-14T03:03:00.000Z') });
assert.strictEqual(delivered.overallStatus, 'pass');
assert.strictEqual(delivered.stages.delivery.required, true);

const overBudget = buildReceipt(parseArgs([
  '--task-id', 'over-budget',
  '--execution-status', 'pass',
  '--verification-status', 'pass',
  '--execution-evidence-id', 'execution-receipt',
  '--verification-evidence-id', 'verification-receipt',
  '--actual-cost-usd', '0.02',
  '--max-cost-usd', '0.01',
]), { nowMs: Date.parse('2026-07-14T03:04:00.000Z') });
assert.strictEqual(overBudget.overallStatus, 'fail');
assert.strictEqual(overBudget.completion.failureStage, 'budget');
assert(overBudget.completion.failures.includes('cost_cap_exceeded'));

assert.throws(() => parseArgs(['--task-id', 'raw prompt text']), /letters, numbers/);
assert.throws(() => parseArgs(['--task-id', 'https:\/\/example.com']), /letters, numbers/);
assert.throws(() => parseArgs(['--task-id', 'x', '--execution-status', 'maybe']), /unsupported/);
assert(render(passed).includes('Status: pass'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-outcome-gate-test-'));
const out = path.join(temp, 'receipts', 'latest.json');
const history = path.join(temp, 'receipts', 'history.jsonl');
const artifacts = writeReceipt(passed, { out, history });
assert.deepStrictEqual(artifacts, { out, history });
assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).id, passed.id);
assert.strictEqual(JSON.parse(fs.readFileSync(history, 'utf8').trim()).id, passed.id);
assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(history).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);

const existingParent = path.join(temp, 'caller-owned-existing-parent');
fs.mkdirSync(existingParent, { mode: 0o755 });
fs.chmodSync(existingParent, 0o755);
writeReceipt(passed, {
  out: path.join(existingParent, 'latest.json'),
  history: path.join(existingParent, 'history.jsonl'),
});
assert.strictEqual(fs.statSync(existingParent).mode & 0o777, 0o755);
assert.strictEqual(fs.statSync(path.join(existingParent, 'latest.json')).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(path.join(existingParent, 'history.jsonl')).mode & 0o777, 0o600);
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes outcome gate tests: PASS');
