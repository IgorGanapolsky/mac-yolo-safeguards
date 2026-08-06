'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildOutcomeContract,
  decision,
  parseArgs,
  classifyTokenClass,
} = require('../tools/hermes-economic-router');

const { aggregate } = require('../tools/hermes-token-economics-dashboard');

// Token class classification
assert.strictEqual(classifyTokenClass('merge the PR to main and deploy'), 'produce');
assert.strictEqual(classifyTokenClass('publish the verified release to LinkedIn'), 'produce');
assert.strictEqual(classifyTokenClass('explain how the router works to the team'), 'teach');
assert.strictEqual(classifyTokenClass('write onboarding docs for the new skill'), 'teach');
assert.strictEqual(classifyTokenClass('endless loop of retry and rework'), 'spin');
assert.strictEqual(classifyTokenClass('the bug keeps failing; debug again and rerun'), 'spin');
assert.strictEqual(classifyTokenClass('implement a smoke test for the harness'), 'produce');

// Receipt includes tokenClass and dollarsPerAcceptedTask contract.
const routine = decision(parseArgs([
  '--task', 'quick local smoke test for hermes-yolo',
  '--risk', 'low',
  '--max-cost-usd', '0',
  '--latency-ms', '10000',
]));
assert.strictEqual(routine.tokenClass, 'produce', 'smoke test is produce');
assert.strictEqual(routine.outcomeContract.accounting.dollarsPerAcceptedTask, 'actual');
assert.strictEqual(routine.outcomeContract.accounting.acceptedTask.completed, false);
assert.strictEqual(routine.outcomeContract.tokenClass, 'produce');

// Teaching request exceeding the cap requires approval unless explicitly approved.
const teachUnapproved = decision(parseArgs([
  '--task', 'explain how the multi-agent pipeline architecture works to the new hire',
  '--risk', 'medium',
  '--max-cost-usd', '10.00',
  '--latency-ms', '30000',
  '--ignore-expert-health',
]));
assert.strictEqual(teachUnapproved.tokenClass, 'teach', 'architecture explain is teach');
assert.strictEqual(teachUnapproved.teachingBudget.requested, true, 'teaching budget requested');
assert.strictEqual(teachUnapproved.teachingBudget.approved, false, 'not approved because paid not ok');
assert.strictEqual(teachUnapproved.requiresApproval, true, 'teach cap exceeded requires approval');
assert(teachUnapproved.approvalReason.includes('teaching budget'), 'approvalReason mentions teaching budget');

// Teaching request with explicit cap approved.
const teachApproved = decision(parseArgs([
  '--task', 'teach the new skill onboarding flow with explicit budget',
  '--risk', 'medium',
  '--max-cost-usd', '10.00',
  '--latency-ms', '30000',
  '--paid-ok',
  '--ignore-expert-health',
]));
assert.strictEqual(teachApproved.tokenClass, 'teach');
assert.strictEqual(teachApproved.teachingBudget.requested, true);
assert.strictEqual(teachApproved.teachingBudget.approved, true, 'explicit cap + paidOk = approved');
assert.strictEqual(teachApproved.requiresApproval, false, 'approved teaching budget does not require approval');

// Spin classification.
const spin = decision(parseArgs([
  '--task', 'endless loop of retry and rework the failing test',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert.strictEqual(spin.tokenClass, 'spin', 'retry loop is spin');

// buildOutcomeContract directly with tokenClass.
const contract = buildOutcomeContract('test-id', { maxCostUsd: 0.25 }, { externalDelivery: true }, 'produce');
assert.strictEqual(contract.tokenClass, 'produce');
assert.strictEqual(contract.accounting.dollarsPerAcceptedTask, 'actual');
assert.strictEqual(contract.accounting.acceptedTask.completionGate, 'hermes-outcome-receipt-pass');

// Dashboard aggregation.
const now = new Date().toISOString();
const sampleReceipts = [
  { tokenClass: 'produce', estimatedCostUsd: 0, outcomeContract: { accounting: { actualCostUsd: 0, acceptedTask: { completed: true, verifiedBy: 'ci' } } }, teachingBudget: { requested: false, approved: false }, createdAt: now },
  { tokenClass: 'produce', estimatedCostUsd: 0.08, outcomeContract: { accounting: { actualCostUsd: 0.07, acceptedTask: { completed: true, verifiedBy: 'ci' } } }, teachingBudget: { requested: false, approved: false }, createdAt: now },
  { tokenClass: 'teach', estimatedCostUsd: 0.01, outcomeContract: { accounting: { actualCostUsd: 0.01, acceptedTask: { completed: false, verifiedBy: null } } }, teachingBudget: { requested: true, approved: false }, createdAt: now },
  { tokenClass: 'spin', estimatedCostUsd: 0.05, outcomeContract: { accounting: { actualCostUsd: 0.05, acceptedTask: { completed: false, verifiedBy: null } } }, teachingBudget: { requested: false, approved: false }, createdAt: now },
];
const report = aggregate(sampleReceipts);
assert.strictEqual(report.summary.totalReceipts, 4);
assert.strictEqual(report.totals.produce.count, 2);
assert.strictEqual(report.totals.teach.count, 1);
assert.strictEqual(report.totals.spin.count, 1);
assert.strictEqual(report.totals.produce.accepted, 2);
assert.strictEqual(report.totals.teach.accepted, 0);
assert.strictEqual(report.totals.teach.budgetRequested, 1);
assert.strictEqual(report.totals.produce.dollarsPerAcceptedTask, 0.035, '$0.07 / 2 accepted');
assert.strictEqual(report.summary.totalAccepted, 2);
assert.ok(report.summary.overallDollarsPerAcceptedTask > 0);

console.log('Hermes token economics tests: PASS');
