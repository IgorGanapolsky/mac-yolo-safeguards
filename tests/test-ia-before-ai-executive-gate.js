'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const {
  assessExecutiveOpportunity,
  parseArgs,
  safeErrorMessage,
  validateOpportunity,
} = require('../tools/ia-before-ai-executive-gate');

function baseOpportunity(overrides = {}) {
  return {
    company: 'Acme Support',
    executiveRole: 'CTO',
    businessPriority: 'reduce failed customer handoffs',
    repeatedFailure: 'agent retries create duplicate CRM updates',
    businessCostUsd: 12000,
    usesAgentsWeekly: true,
    budgetOwner: true,
    canShareEvidence: true,
    needsRepeatability: true,
    liveWorkflow: true,
    infrastructure: {
      dataInventory: true,
      identityAccess: true,
      deterministicWorkflow: true,
      retryIdempotency: true,
      evaluationCases: true,
      observability: true,
      humanApproval: true,
    },
    ...overrides,
  };
}

test('rejects generic agent interest without a live costly workflow', () => {
  const result = assessExecutiveOpportunity(baseOpportunity({
    repeatedFailure: '',
    businessCostUsd: 0,
    liveWorkflow: false,
    usesAgentsWeekly: false,
  }));

  assert.equal(result.qualified, false);
  assert.equal(result.route.offer, 'free_or_disqualify');
  assert.equal(result.route.priceUsd, 0);
  assert.equal(result.llmRequired, false);
  assert.match(result.stopReason, /live repeated failure/i);
  assert.equal(result.actions.send, false);
  assert.equal(result.actions.createCheckout, false);
});

test('rejects claimed cost when the buyer cannot share evidence', () => {
  const result = assessExecutiveOpportunity(baseOpportunity({ canShareEvidence: false }));

  assert.equal(result.qualified, false);
  assert.equal(result.route.offer, 'free_or_disqualify');
  assert.match(result.stopReason, /shareable evidence/i);
});

test('routes material pain with weak infrastructure to IA-before-AI diagnostic', () => {
  const result = assessExecutiveOpportunity(baseOpportunity({
    budgetOwner: false,
    infrastructure: {
      dataInventory: true,
      identityAccess: false,
      deterministicWorkflow: false,
      retryIdempotency: false,
      evaluationCases: false,
      observability: true,
      humanApproval: false,
    },
  }));

  assert.equal(result.qualified, true);
  assert.equal(result.route.offer, 'diagnostic');
  assert.equal(result.route.priceUsd, 499);
  assert.equal(result.iaReadiness.readyCount, 2);
  assert.deepEqual(result.iaReadiness.missing, [
    'identity_access',
    'deterministic_workflow',
    'retry_idempotency',
    'evaluation_cases',
    'human_approval',
  ]);
  assert.match(result.executiveHypothesis, /\$12,000/);
  assert.match(result.executiveQuestion, /leadership metric/i);
  assert.equal(result.actions.send, false);
});

test('routes an executive buyer with repeated costly pain to hardening sprint', () => {
  const result = assessExecutiveOpportunity(baseOpportunity({
    budgetOwner: false,
  }));

  assert.equal(result.qualificationScore, 8);
  assert.equal(result.route.offer, 'hardening_sprint');
  assert.equal(result.route.priceUsd, 1500);
  assert.match(result.paidAsk, /\$1,500/);
  assert.match(result.paidAsk, /one live workflow/i);
});

test('routes a fully qualified budget owner to partner pilot', () => {
  const result = assessExecutiveOpportunity(baseOpportunity());

  assert.equal(result.qualificationScore, 10);
  assert.equal(result.route.offer, 'partner_pilot');
  assert.equal(result.route.priceUsd, 3000);
  assert.match(result.paidAsk, /\$3,000/);
  assert.equal(result.provenance.sourceIds.length, 3);
});

test('critical infrastructure gaps cap even a high-score buyer at diagnostic', () => {
  const result = assessExecutiveOpportunity(baseOpportunity({
    infrastructure: {
      dataInventory: true,
      identityAccess: false,
      deterministicWorkflow: true,
      retryIdempotency: true,
      evaluationCases: true,
      observability: true,
      humanApproval: true,
    },
  }));

  assert.equal(result.qualificationScore, 10);
  assert.equal(result.iaReadiness.readyCount, 6);
  assert.equal(result.route.offer, 'diagnostic');
  assert.equal(result.route.priceUsd, 499);
});

test('strict schema rejects unknown fields, wrong types, and terminal control characters', () => {
  assert.throws(
    () => validateOpportunity({ ...baseOpportunity(), unexpected: true }),
    /unknown fields: \["unexpected"\]/i
  );
  assert.throws(
    () => validateOpportunity({ ...baseOpportunity(), usesAgentsWeekly: 'true' }),
    /usesAgentsWeekly must be a boolean/i
  );
  assert.throws(
    () => validateOpportunity({ ...baseOpportunity(), company: 'Safe\u001b]0;PWN\u0007' }),
    /company contains control characters/i
  );
  assert.throws(
    () => validateOpportunity({ ...baseOpportunity(), businessPriority: '   ' }),
    /businessPriority must not be empty/i
  );
  assert.throws(
    () => validateOpportunity({
      ...baseOpportunity(),
      infrastructure: { ...baseOpportunity().infrastructure, extra: false },
    }),
    /infrastructure contains unknown fields: \["extra"\]/i
  );
  assert.equal(safeErrorMessage('bad\u001b]0;PWN\u0007'), 'bad\\u001b]0;PWN\\u0007');
});

test('requires an input file or stdin but never accepts send flags', () => {
  assert.deepEqual(parseArgs(['--input', 'opportunity.json', '--json']), {
    input: 'opportunity.json',
    json: true,
  });
  assert.throws(() => parseArgs(['--send']), /unknown argument/i);
});

test('CLI reads a JSON file and emits a side-effect-free assessment', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-before-ai-'));
  const inputPath = path.join(tempDir, 'opportunity.json');
  fs.writeFileSync(inputPath, JSON.stringify(baseOpportunity({ budgetOwner: false })));

  const run = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'tools', 'ia-before-ai-executive-gate.js'), '--input', inputPath, '--json'],
    { encoding: 'utf8' }
  );

  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.route.offer, 'hardening_sprint');
  assert.deepEqual(result.actions, {
    send: false,
    createCheckout: false,
    mutateCustomerSystem: false,
  });
});

test('CLI fails closed on malformed file input', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-before-ai-invalid-'));
  const inputPath = path.join(tempDir, 'opportunity.json');
  fs.writeFileSync(inputPath, JSON.stringify({ ...baseOpportunity(), company: 42 }));

  const run = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'tools', 'ia-before-ai-executive-gate.js'), '--input', inputPath, '--json'],
    { encoding: 'utf8' }
  );

  assert.equal(run.status, 2);
  assert.match(run.stderr, /company must be a string/i);
  assert.equal(run.stdout, '');
});
