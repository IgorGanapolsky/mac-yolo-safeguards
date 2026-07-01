'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildExecutionPlan,
  decision,
  parseArgs,
  taskSignals,
  writeReceipt,
} = require('../tools/hermes-economic-router');

assert.throws(() => parseArgs([]), /--task is required/);
assert.throws(() => parseArgs(['--task', 'x', '--risk', 'huge']), /Unsupported risk/);
assert.throws(() => parseArgs(['--task', 'x', '--max-cost-usd', '-1']), /non-negative/);
assert.strictEqual(parseArgs(['--task', 'x', '--execute-plan']).executePlan, true);

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
const routinePlan = buildExecutionPlan(routine);
assert.strictEqual(routinePlan.status, 'planned');
assert.strictEqual(routinePlan.steps[0].id, 'cheap-candidate');

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
assert.strictEqual(buildExecutionPlan(fugu).status, 'blocked');

const fusion = decision(parseArgs([
  '--task', 'use OpenRouter Fusion for a hard grounded answer with web search panel answers',
  '--risk', 'critical',
  '--max-cost-usd', '0.20',
  '--latency-ms', '40000',
  '--paid-ok',
]));
assert.strictEqual(fusion.selectedRoute.id, 'openrouter_fusion');
assert.strictEqual(fusion.microAgentRecipe.id, 'openrouter_fusion_panel');
assert.strictEqual(fusion.microAgentRecipe.pattern, 'fusion');
assert.strictEqual(fusion.requiresApproval, true);
assert(fusion.modelCatalogCandidates.some((model) => model.slug === 'sakana/fugu-ultra'));
const fusionPlan = buildExecutionPlan(fusion);
assert.strictEqual(fusionPlan.status, 'blocked');
assert(fusionPlan.steps.some((step) => step.id === 'approval-gate'));
assert.strictEqual(fusionPlan.steps.find((step) => step.id === 'panel').openRouterPayload.tools[0].type, 'openrouter:fusion');
assert.strictEqual(fusionPlan.steps.find((step) => step.id === 'panel').modelsApi.query.supported_parameters, 'tools');

const advisor = decision(parseArgs([
  '--task', 'use Advisor: cheap executor gets stuck then consult a stronger model',
  '--risk', 'high',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(advisor.selectedRoute.id, 'openrouter_advisor');
assert.strictEqual(advisor.microAgentRecipe.id, 'openrouter_advisor_escalation');
assert.strictEqual(advisor.microAgentRecipe.pattern, 'advisor');
assert(advisor.microAgentRecipe.modelPriceProof.some((model) => model.slug === 'z-ai/glm-5.2'));
const advisorPlan = buildExecutionPlan(advisor);
assert.strictEqual(advisorPlan.status, 'blocked');
assert.strictEqual(advisorPlan.steps.find((step) => step.id === 'advisor-consult').openRouterPayload.tools[0].type, 'openrouter:advisor');
assert.strictEqual(advisorPlan.steps.find((step) => step.id === 'advisor-consult').modelsApi.query.sort, 'intelligence-high-to-low');

const subagent = decision(parseArgs([
  '--task', 'use Subagent to delegate routine subtasks to a smaller worker model',
  '--risk', 'high',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(subagent.selectedRoute.id, 'openrouter_subagent');
assert.strictEqual(subagent.microAgentRecipe.id, 'openrouter_subagent_delegation');
assert.strictEqual(subagent.microAgentRecipe.pattern, 'subagent');
assert(subagent.microAgentRecipe.modelPriceProof.some((model) => model.slug === 'cohere/north-mini-code:free'));
const subagentPlan = buildExecutionPlan(subagent);
assert.strictEqual(subagentPlan.status, 'blocked');
assert.strictEqual(subagentPlan.steps.find((step) => step.id === 'worker-delegation').openRouterPayload.tools[0].type, 'openrouter:subagent');
assert.strictEqual(subagentPlan.steps.find((step) => step.id === 'worker-delegation').modelsApi.query.sort, 'pricing-low-to-high');

const catalog = decision(parseArgs([
  '--task', 'compare price with Models API before you commit to a model benchmark',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert.strictEqual(catalog.selectedRoute.id, 'local_fast');
assert(catalog.signals.needsModelPrice);
assert.strictEqual(catalog.modelCatalogQuery.query.sort, 'pricing-low-to-high');
assert(catalog.modelCatalogQuery.url.includes('/api/v1/models?'));
assert(catalog.modelCatalogCandidates.some((model) => model.slug === 'anthropic/claude-sonnet-5'));

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
