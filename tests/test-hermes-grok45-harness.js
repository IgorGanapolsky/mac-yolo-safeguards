'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  billingReceipt,
  buildHarness,
  parseArgs,
  safeCapture,
  safeCommandSummary,
  sanitizeGrokOutput,
  writeReceipt,
  appendHistoryReceipt,
  historySummary,
  digest,
} = require('../tools/hermes-grok45-harness');

assert.strictEqual(digest('private task'), digest('private task'));
assert.notStrictEqual(digest('private task'), 'd340c58e605953a3e88');

const baseDoctor = {
  schema: 'grok-yolo/doctor-v1',
  ready: true,
  binary: '/fake/grok',
  version: '0.2.93',
  versionReady: true,
  model: 'grok-4.5',
  modelAvailable: true,
  availableModels: ['grok-4.5'],
  defaultModel: 'grok-4.5',
  authenticated: true,
  authMode: 'grok.com_oauth',
  billingMode: 'grok_plan_or_limited_free_quota',
  apiBillingActivatedByWrapper: false,
  blocker: null,
};

const args = parseArgs([
  '--task', 'verify the harness',
  '--repo', '/tmp/project',
  '--execute',
  '--max-turns', '7',
  '--timeout-ms', '5000',
  '--json',
]);
assert.strictEqual(args.task, 'verify the harness');
assert.strictEqual(args.execute, true);
assert.strictEqual(args.maxTurns, 7);
assert.strictEqual(args.timeoutMs, 5000);
assert.throws(() => parseArgs([]), /--task is required/);
assert.throws(() => parseArgs(['--task', 'x', '--max-turns', '0']), /integer/);

let runnerCalls = 0;
const oauthReceipt = buildHarness({
  ...args,
  doctor: baseDoctor,
  now: '2026-07-12T00:00:00.000Z',
  host: 'test-mac',
}, {
  runner: (binary, childArgs) => {
    runnerCalls += 1;
    assert.strictEqual(binary, '/fake/grok');
    assert(childArgs.includes('grok-4.5'));
    assert(childArgs.includes('--always-approve'));
    assert(!childArgs.includes('--check'));
    assert(childArgs.includes('--no-subagents'));
    return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({ text: 'GROK45-HERMES-OK', stopReason: 'EndTurn' }),
      stderr: '',
    };
  },
});
assert.strictEqual(runnerCalls, 1);
assert.strictEqual(oauthReceipt.overallStatus, 'pass');
assert.strictEqual(oauthReceipt.role, 'independent_verifier');
assert.strictEqual(oauthReceipt.candidateOnly, true);
assert.strictEqual(oauthReceipt.defaultHermesRouteChanged, false);
assert.strictEqual(oauthReceipt.billing.directApi, false);
assert.strictEqual(oauthReceipt.billing.paidApprovalRequired, false);
assert.strictEqual(oauthReceipt.execution.exitCode, 0);
assert(oauthReceipt.execution.stdout.includes('GROK45-HERMES-OK'));
assert(!oauthReceipt.execution.command.includes('verify the harness'));

const apiDoctor = {
  ...baseDoctor,
  authMode: 'xai_api_key',
  billingMode: 'xai_api_pay_as_you_go',
};
const blockedApi = buildHarness({
  ...args,
  doctor: apiDoctor,
  paidOk: false,
}, {
  runner: () => {
    throw new Error('runner must not execute without paid approval');
  },
});
assert.strictEqual(blockedApi.overallStatus, 'blocked');
assert.strictEqual(blockedApi.readiness.blocker, 'direct_xai_api_billing_requires_paid_ok');
assert.strictEqual(blockedApi.execution.attempted, false);

const paidApi = buildHarness({
  ...args,
  doctor: apiDoctor,
  paidOk: true,
}, {
  runner: () => ({ status: 0, signal: null, stdout: '{"result":"PAID-OK"}', stderr: '' }),
});
assert.strictEqual(paidApi.overallStatus, 'pass');
assert.strictEqual(paidApi.billing.paidApprovalPresent, true);

const blockedAuth = buildHarness({
  ...args,
  doctor: { ...baseDoctor, ready: false, authenticated: false, authMode: 'none', blocker: 'grok_authentication_required' },
}, {
  runner: () => {
    throw new Error('runner must not execute when auth is blocked');
  },
});
assert.strictEqual(blockedAuth.overallStatus, 'blocked');
assert.strictEqual(blockedAuth.readiness.blocker, 'grok_authentication_required');

const directBilling = billingReceipt(apiDoctor, false);
assert.strictEqual(directBilling.paidApprovalRequired, true);
assert.strictEqual(directBilling.apiPricing.perMillionTokens.input, 2);

const secretFixture = 'XAI_API_KEY=xai-' + 'b'.repeat(24);
assert(!safeCapture(secretFixture).includes('xai-'));
const sanitizedOutput = sanitizeGrokOutput(JSON.stringify({
  text: 'VISIBLE',
  stopReason: 'EndTurn',
  thought: 'do not persist private model reasoning',
  requestId: 'request-id',
}));
assert(sanitizedOutput.includes('VISIBLE'));
assert(!sanitizedOutput.includes('thought'));
assert(!sanitizedOutput.includes('request-id'));
const summarized = safeCommandSummary(['--rules', 'long policy', '-p', 'private task']);
assert(!summarized.includes('long policy'));
assert(!summarized.includes('private task'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-grok45-test-'));
const out = path.join(temp, 'latest.json');
writeReceipt(oauthReceipt, out);
const stored = JSON.parse(fs.readFileSync(out, 'utf8'));
assert.strictEqual(stored.schema, 'hermes-grok45-harness/v1');
assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
const historyPath = path.join(temp, 'history.jsonl');
appendHistoryReceipt(oauthReceipt, historyPath);
const trace = JSON.parse(fs.readFileSync(historyPath, 'utf8').trim());
assert.strictEqual(trace.schema, 'hermes-grok45-harness/trace-v1');
assert.strictEqual(trace.taskDigest, oauthReceipt.taskDigest);
assert.strictEqual(trace.overallStatus, 'pass');
assert.strictEqual(fs.statSync(historyPath).mode & 0o777, 0o600);
assert(!Object.prototype.hasOwnProperty.call(trace, 'task'));
assert(!Object.prototype.hasOwnProperty.call(trace.execution, 'stdout'));
assert(!JSON.stringify(historySummary(oauthReceipt)).includes('verify the harness'));
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes Grok 4.5 harness tests: PASS');
