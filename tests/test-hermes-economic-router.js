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
assert.strictEqual(routine.microAgentRecipe.modelAlias, 'hermes/auto');
assert.strictEqual(routine.microAgentRecipe.pattern, 'confidence');
assert.strictEqual(routine.microAgentRecipe.id, 'local_confidence_escalation');
assert.strictEqual(routine.microAgentRecipe.hardCaps.maxConcurrent, 1);

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
assert.strictEqual(glm.microAgentRecipe.pattern, 'fusion');
assert.strictEqual(glm.microAgentRecipe.id, 'architecture_fusion');
assert.strictEqual(glm.microAgentRecipe.hardCaps.maxConcurrent, 2);
assert(glm.microAgentRecipe.panel.some((candidate) => candidate.role === 'cheap-first-pass'));
assert(glm.microAgentRecipe.panel.some((candidate) => candidate.role === 'deep-reviewer'));

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

const exactContract = decision(parseArgs([
  '--task', 'solve hidden-test hard reasoning with exact answer strict format and quorum synthesis',
  '--risk', 'high',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(exactContract.selectedRoute.id, 'glm52_reasoning');
assert.strictEqual(exactContract.signals.exactContract, true);
assert.strictEqual(exactContract.signals.highVarianceReasoning, true);
assert.strictEqual(exactContract.microAgentRecipe.pattern, 'remom');
assert.strictEqual(exactContract.microAgentRecipe.id, 'strict_contract_remom');
assert.strictEqual(exactContract.microAgentRecipe.breadth.minSuccessfulResponses, 2);
assert.strictEqual(exactContract.microAgentRecipe.synthesis.contractRepair, true);
assert.strictEqual(exactContract.microAgentRecipe.synthesis.preserveExactAnswer, true);
assert.strictEqual(exactContract.microAgentRecipe.outputContract.preserveExactAnswer, true);
assert.strictEqual(exactContract.microAgentRecipe.quorum.acceptBestValidEvidenceWhenSynthesisFails, true);
assert.strictEqual(exactContract.microAgentRecipe.fallback.condition, 'synthesis-timeout-or-contract-repair-failed');
assert(exactContract.policy.autoRecipeRule.includes('ReMoM'));

const ornith = decision(parseArgs([
  '--task', 'benchmark Ornith as an open-source coding model candidate',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert.strictEqual(ornith.selectedRoute.id, 'local_coder_candidate');
assert.strictEqual(ornith.selectedRoute.candidateOnly, true);
assert(ornith.selectedRoute.proofGates.includes('benchmark-before-default'));
assert.strictEqual(ornith.microAgentRecipe.pattern, 'ratings');
assert.strictEqual(ornith.microAgentRecipe.id, 'coding_candidate_ratings');
assert.strictEqual(ornith.microAgentRecipe.hardCaps.maxConcurrent, 2);
assert(ornith.microAgentRecipe.candidates.some((candidate) => candidate.role === 'baseline'));
assert(ornith.microAgentRecipe.candidates.some((candidate) => candidate.role === 'candidate'));

const mobile = decision(parseArgs([
  '--task', 'verify Hermes Mobile release with Maestro E2E proof',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '180000',
]));
assert.strictEqual(mobile.selectedRoute.id, 'mobile_e2e_gate');
assert(mobile.pipeline.some((stage) => stage.agent === 'mobile-verifier'));
assert.strictEqual(mobile.microAgentRecipe.pattern, 'workflow');
assert.strictEqual(mobile.microAgentRecipe.id, 'mobile_release_workflow');
assert.strictEqual(mobile.microAgentRecipe.hardCaps.maxConcurrent, 1);
assert(mobile.microAgentRecipe.runtimeGuards.includes('hermes-mobile-runtime lock'));
assert(mobile.microAgentRecipe.runtimeGuards.includes('swap ceiling'));

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
assert.strictEqual(payment.microAgentRecipe.pattern, 'workflow');
assert.strictEqual(payment.microAgentRecipe.id, 'approval_first_workflow');
assert(payment.microAgentRecipe.roles.some((role) => role.id === 'approval-boundary'));

const fugu = decision(parseArgs([
  '--task', 'use Sakana Fugu for hard multi-agent research review',
  '--risk', 'critical',
  '--max-cost-usd', '0.50',
  '--latency-ms', '60000',
  '--paid-ok',
]));
assert.strictEqual(fugu.selectedRoute.id, 'fugu_escalation');
assert.strictEqual(fugu.microAgentRecipe.pattern, 'fusion');
assert.strictEqual(fugu.microAgentRecipe.id, 'rare_research_fusion');
assert.strictEqual(fugu.requiresApproval, true);

const remom = decision(parseArgs([
  '--task', 'solve hard reasoning with strict JSON schema output contract and quorum synthesis',
  '--risk', 'high',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(remom.microAgentRecipe.pattern, 'remom');
assert.strictEqual(remom.microAgentRecipe.id, 'strict_contract_remom');
assert.strictEqual(remom.microAgentRecipe.breadth.minSuccessfulResponses, 2);
assert.strictEqual(remom.microAgentRecipe.synthesis.contractRepair, true);
assert.strictEqual(remom.microAgentRecipe.synthesis.preserveExactAnswer, true);
assert.strictEqual(remom.microAgentRecipe.fallback.condition, 'synthesis-timeout-or-contract-repair-failed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-economic-router-'));
const receiptPath = path.join(tmp, 'receipts.jsonl');
writeReceipt(routine, receiptPath);
const lines = fs.readFileSync(receiptPath, 'utf8').trim().split('\n');
assert.strictEqual(lines.length, 1);
assert.strictEqual(JSON.parse(lines[0]).id, routine.id);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('Hermes economic router tests: PASS');
