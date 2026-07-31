'use strict';

// Hermetic scoring: do not quarantine routes from the live traffic log.
process.env.HERMES_IGNORE_EXPERT_HEALTH = '1';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildOutcomeContract,
  buildExecutionPlan,
  computeAdjustedRouteScore,
  decision,
  evaluateCanary,
  parseArgs,
  routeAllowed,
  ROUTES,
  scoreRoute,
  taskSignals,
  updateRouteReliability,
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
assert.strictEqual(routine.outcomeContract.schema, 'hermes-outcome-contract/v1');
assert.strictEqual(routine.outcomeContract.taskId, routine.id);
assert.strictEqual(routine.outcomeContract.deliveryRequired, false);
assert.strictEqual(routine.outcomeContract.accounting.maxCostUsd, 0);
assert(routine.pipeline.some((stage) => stage.id === 'outcome-gate'));
const routineOutcomePlan = buildExecutionPlan(routine);
assert(routineOutcomePlan.steps.some((step) => step.id === 'independent-outcome-verification'));
assert(routineOutcomePlan.steps.some((step) => step.id === 'final-outcome-gate'));
assert(!routineOutcomePlan.steps.some((step) => step.id === 'delivery-evidence'));
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
  '--ignore-expert-health',
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
  '--ignore-expert-health',
]));
assert.notStrictEqual(glmNoBudget.selectedRoute.id, 'glm52_reasoning');
assert(
  glmNoBudget.rejectedRoutes.some((route) => route.id === 'glm52_reasoning' && route.reasons.some((reason) => reason.includes('paid route'))),
);

// High-risk + paid without explicit $0 cap: default budget so GLM is not excluded by accident.
const highRiskDefaultBudget = decision(parseArgs([
  '--task', 'are you sure about architecture of gateway pairing cross-file',
  '--risk', 'high',
  '--paid-ok',
  '--ignore-expert-health',
]));
assert.strictEqual(highRiskDefaultBudget.budget.budgetDefaulted, true);
assert.ok(highRiskDefaultBudget.budget.maxCostUsd >= 0.1);
assert.notStrictEqual(highRiskDefaultBudget.selectedRoute.id, 'local_fast');

// Explicit $0 cap still forces zero-cost routes even when paid-ok + high risk.
const highRiskZeroCap = decision(parseArgs([
  '--task', 'are you sure about architecture of gateway pairing',
  '--risk', 'high',
  '--paid-ok',
  '--max-cost-usd', '0',
  '--ignore-expert-health',
]));
assert.strictEqual(highRiskZeroCap.budget.budgetDefaulted, false);
// Explicit $0 still allows local_fast; high-risk penalty may still pick another zero-cost route.
assert.strictEqual(highRiskZeroCap.budget.maxCostUsd, 0);
assert.ok(
  highRiskZeroCap.selectedRoute.costUsd === undefined ||
    Number(highRiskZeroCap.estimatedCostUsd) === 0,
);

const grok45 = decision(parseArgs([
  '--task', 'use Grok 4.5 as an independent verifier for the Hermes harness architecture with proof',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '60000',
]));
assert.strictEqual(grok45.signals.asksForGrok, true);
assert.strictEqual(grok45.selectedRoute.id, 'grok45_verifier_candidate');
assert.strictEqual(grok45.selectedRoute.provider, 'grok-build-cli');
assert.strictEqual(grok45.selectedRoute.model, 'grok-4.5');
assert.strictEqual(grok45.selectedRoute.candidateOnly, true);
assert.strictEqual(grok45.selectedRoute.billingMode, 'grok.com-oauth-quota');
assert.strictEqual(grok45.selectedRoute.apiPricing.inputPerMillionUsd, 2);
assert.strictEqual(grok45.selectedRoute.apiPricing.outputPerMillionUsd, 6);
assert.strictEqual(grok45.estimatedCostUsd, 0);
assert.strictEqual(grok45.requiresApproval, false);
assert.strictEqual(grok45.microAgentRecipe.id, 'grok45_independent_verification');
assert.strictEqual(grok45.microAgentRecipe.pattern, 'fusion');
assert(grok45.microAgentRecipe.panel.some((route) => route.role === 'independent-grok45-verifier'));
assert(grok45.microAgentRecipe.adoptionGates.includes('do-not-change-default-route'));
assert(grok45.microAgentRecipe.modelPriceProof.some((model) => model.slug === 'grok-4.5'));
const grokPlan = buildExecutionPlan(grok45);
assert.strictEqual(grokPlan.status, 'planned');
assert(grokPlan.steps.some((step) => step.id === 'panel'));

const grokPrice = decision(parseArgs([
  '--task', 'verify Grok 4.5 API pricing before using xAI',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '60000',
]));
assert.strictEqual(grokPrice.modelCatalogQuery.endpoint, 'https://api.x.ai/v1/models');
assert.strictEqual(grokPrice.modelCatalogQuery.query.model, 'grok-4.5');
assert(grokPrice.modelCatalogCandidates.some((model) => model.slug === 'grok-4.5'));

const noImplicitGrok = decision(parseArgs([
  '--task', 'review this high-risk architecture with proof',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '60000',
]));
assert.notStrictEqual(noImplicitGrok.selectedRoute.id, 'grok45_verifier_candidate');
assert(
  noImplicitGrok.rejectedRoutes.some((route) => route.id === 'grok45_verifier_candidate' && route.reasons.some((reason) => reason.includes('explicit Grok request'))),
);

const parallelNoApproval = decision(parseArgs([
  '--task', 'use Parallel Search for the latest official agent retrieval architecture release',
  '--risk', 'medium',
  '--max-cost-usd', '0.01',
  '--latency-ms', '10000',
]));
assert.strictEqual(parallelNoApproval.signals.asksForParallel, true);
assert.strictEqual(parallelNoApproval.signals.needsFreshWeb, true);
assert.notStrictEqual(parallelNoApproval.selectedRoute.id, 'parallel_search_candidate');
assert(
  parallelNoApproval.rejectedRoutes.some((route) => route.id === 'parallel_search_candidate' && route.reasons.some((reason) => reason.includes('paid route'))),
);

const parallel = decision(parseArgs([
  '--task', 'use Parallel Search for the latest official agent retrieval architecture release with dense excerpts',
  '--risk', 'medium',
  '--max-cost-usd', '0.01',
  '--latency-ms', '10000',
  '--paid-ok',
]));
assert.strictEqual(parallel.selectedRoute.id, 'parallel_search_candidate');
assert.strictEqual(parallel.selectedRoute.provider, 'parallel-search');
assert.strictEqual(parallel.selectedRoute.model, 'search-v1');
assert.strictEqual(parallel.selectedRoute.candidateOnly, true);
assert.strictEqual(parallel.selectedRoute.apiPricing.defaultMode, 'turbo');
assert.strictEqual(parallel.selectedRoute.apiPricing.baseRequestUsd, 0.001);
assert.strictEqual(parallel.selectedRoute.apiPricing.baseRequestUsdByMode.advanced, 0.005);
assert.strictEqual(parallel.estimatedCostUsd, 0.001);
assert(parallel.selectedRoute.command.includes('--mode turbo'));
assert.strictEqual(parallel.requiresApproval, true);
assert.strictEqual(parallel.signals.mobile, false);
assert.strictEqual(parallel.microAgentRecipe.id, 'parallel_retrieval_workflow');
assert.strictEqual(parallel.microAgentRecipe.pattern, 'workflow');
assert(parallel.microAgentRecipe.roles.some((role) => role.id === 'retriever'));
assert.strictEqual(parallel.microAgentRecipe.retrievalPolicy.defaultMode, 'turbo');
assert.deepStrictEqual(parallel.microAgentRecipe.retrievalPolicy.escalationModes, ['basic', 'advanced']);
assert(parallel.microAgentRecipe.retrievalPolicy.trace.includes('ranked-results'));
assert(parallel.microAgentRecipe.retrievalPolicy.trace.includes('context-bounds'));
assert(parallel.policy.retrievalRule.includes('explicit Parallel Turbo'));
assert(parallel.policy.memoryRule.includes('inspectable wiki'));
const parallelPlan = buildExecutionPlan(parallel);
assert.strictEqual(parallelPlan.status, 'blocked');
assert(parallelPlan.steps.some((step) => step.id === 'approval-gate'));

const parallelTurbo = decision(parseArgs([
  '--task', 'use Parallel Turbo for quick current web grounding in a chat agent',
  '--risk', 'medium',
  '--max-cost-usd', '0.001',
  '--latency-ms', '250',
  '--paid-ok',
]));
assert.strictEqual(parallelTurbo.selectedRoute.id, 'parallel_search_candidate');
assert.strictEqual(parallelTurbo.signals.fastGrounding, true);
assert.strictEqual(parallelTurbo.estimatedLatencyMs, 200);

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
assert.strictEqual(payment.outcomeContract.deliveryRequired, false);

const externalDelivery = decision(parseArgs([
  '--task', 'publish the verified release to the authorized external channel',
  '--risk', 'critical',
  '--max-cost-usd', '0.10',
  '--latency-ms', '30000',
  '--paid-ok',
]));
assert.strictEqual(externalDelivery.outcomeContract.deliveryRequired, true);
assert(externalDelivery.outcomeContract.requiredStages.includes('delivery'));
const externalPlan = buildExecutionPlan(externalDelivery);
assert(externalPlan.steps.some((step) => step.id === 'delivery-evidence'));
assert(externalPlan.steps.some((step) => step.id === 'final-outcome-gate'));

const directContract = buildOutcomeContract('hermes-route-safeid', { maxCostUsd: 0.25 }, { externalDelivery: true });
assert.strictEqual(directContract.taskId, 'hermes-route-safeid');
assert.strictEqual(directContract.accounting.maxCostUsd, 0.25);
assert(!JSON.stringify(directContract).includes('private task'));

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

const nemotronNoBudget = decision(parseArgs([
  '--task', 'use NVIDIA Nemotron 3 Ultra for all-machine Hermes harness agentic planning and recovery',
  '--risk', 'critical',
  '--max-cost-usd', '0',
  '--latency-ms', '60000',
]));
assert.strictEqual(nemotronNoBudget.signals.asksForNemotron, true);
assert.notStrictEqual(nemotronNoBudget.selectedRoute.id, 'nemotron3_ultra_escalation');
assert(
  nemotronNoBudget.rejectedRoutes.some((route) => route.id === 'nemotron3_ultra_escalation' && route.reasons.some((reason) => reason.includes('paid route'))),
);

const nemotron = decision(parseArgs([
  '--task', 'use NVIDIA Nemotron 3 Ultra for all-machine Hermes harness agentic planning and recovery',
  '--risk', 'critical',
  '--max-cost-usd', '0.20',
  '--latency-ms', '60000',
  '--paid-ok',
]));
assert.strictEqual(nemotron.selectedRoute.id, 'nemotron3_ultra_escalation');
assert.strictEqual(nemotron.selectedRoute.provider, 'openrouter');
assert.strictEqual(nemotron.selectedRoute.model, 'nvidia/nemotron-3-ultra-550b-a55b');
assert.strictEqual(nemotron.selectedRoute.candidateOnly, true);
assert.strictEqual(nemotron.requiresApproval, true);
assert.strictEqual(nemotron.microAgentRecipe.id, 'nemotron3_ultra_candidate_fusion');
assert.strictEqual(nemotron.microAgentRecipe.pattern, 'fusion');
assert(nemotron.microAgentRecipe.modelPriceProof.some((model) => model.slug === 'nvidia/nemotron-3-ultra-550b-a55b'));
assert(nemotron.microAgentRecipe.adoptionGates.includes('do-not-change-default-route'));
assert.strictEqual(buildExecutionPlan(nemotron).status, 'blocked');

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
assert(catalog.modelCatalogCandidates.some((model) => model.slug === 'nvidia/nemotron-3-super-120b-a12b:free'));

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

const kimiK3LongCtx = decision(parseArgs([
  '--task', 'perform long-context analysis of the full repository codebase with multi-step agentic tool-use debugging',
  '--risk', 'high',
  '--max-cost-usd', '0.15',
  '--latency-ms', '60000',
  '--paid-ok',
]));
assert.strictEqual(kimiK3LongCtx.signals.longContextOrAgentic, true, 'long-context/agentic signal detected');
assert.strictEqual(kimiK3LongCtx.selectedRoute.id, 'kimi_k3_agentic_specialist');
assert.strictEqual(kimiK3LongCtx.selectedRoute.model, 'moonshotai/kimi-k3');
assert.strictEqual(kimiK3LongCtx.selectedRoute.provider, 'openrouter');
assert.strictEqual(kimiK3LongCtx.microAgentRecipe.pattern, 'fusion');
assert.strictEqual(kimiK3LongCtx.microAgentRecipe.id, 'kimi_k3_long_context_agentic');
assert(kimiK3LongCtx.microAgentRecipe.panel.some((p) => p.role === 'long-context-agentic-specialist'));
assert(kimiK3LongCtx.microAgentRecipe.panel.some((p) => p.role === 'local-baseline'));

const kimiK3Architecture = decision(parseArgs([
  '--task', 'review the multi-agent pipeline architecture for the million-token context window router',
  '--risk', 'high',
  '--max-cost-usd', '0.15',
  '--latency-ms', '60000',
  '--paid-ok',
]));
assert.strictEqual(kimiK3Architecture.signals.architecture, true, 'architecture signal detected');
assert.strictEqual(kimiK3Architecture.signals.longContextOrAgentic, true, 'long-context signal detected from "million-token context"');
assert.strictEqual(kimiK3Architecture.selectedRoute.id, 'kimi_k3_agentic_specialist');

const kimiK3NoBudget = decision(parseArgs([
  '--task', 'large-repo agentic workflow debugging with tool-use iteration',
  '--risk', 'high',
  '--max-cost-usd', '0',
  '--latency-ms', '60000',
]));
assert.strictEqual(kimiK3NoBudget.signals.longContextOrAgentic, true, 'signal still detected without budget');
assert.notStrictEqual(kimiK3NoBudget.selectedRoute.id, 'kimi_k3_agentic_specialist', 'K3 requires paid-ok');
assert(
  kimiK3NoBudget.rejectedRoutes.some((route) => route.id === 'kimi_k3_agentic_specialist' && route.reasons.some((reason) => reason.includes('paid route'))),
  'K3 rejected for missing paid-ok'
);

const catalogK3 = decision(parseArgs([
  '--task', 'compare price with Models API before you commit to a model benchmark',
  '--risk', 'medium',
  '--max-cost-usd', '0',
  '--latency-ms', '30000',
]));
assert(catalogK3.modelCatalogCandidates.some((model) => model.slug === 'moonshotai/kimi-k3'), 'K3 appears in catalog candidates');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-economic-router-'));
const receiptPath = path.join(tmp, 'receipts.jsonl');
writeReceipt(routine, receiptPath);
const lines = fs.readFileSync(receiptPath, 'utf8').trim().split('\n');
assert.strictEqual(lines.length, 1);
assert.strictEqual(JSON.parse(lines[0]).id, routine.id);
assert.strictEqual(fs.statSync(receiptPath).mode & 0o777, 0o600);
fs.rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Feedback-loop coverage (additive). T-INFERENCE-GATEWAY-ROI shipped the canary /
// reliability loop (computeAdjustedRouteScore, updateRouteReliability,
// evaluateCanary) and #1287 wired it into decision() via expertHealth — but
// none of these were covered by tests. These lock the pure feedback functions
// and the hard gates with values re-probed against origin/main.
// ---------------------------------------------------------------------------

const g = ROUTES.find((r) => r.id === 'grok45_verifier_candidate');
const localFast = ROUTES.find((r) => r.id === 'local_fast');

const grokArgs = {
  task: '@grok 4.5 verify architecture cross-file',
  risk: 'medium',
  maxCostUsd: 5,
  latencyMs: 120000,
  paidOk: true,
  ignoreExpertHealth: true,
};
const grokSignals = taskSignals(grokArgs.task);
const obsGood = { calls: 20, successCount: 20, totalCostUsd: 0.01, avgLatencyMs: 100 };
const obsBad = { calls: 20, successCount: 4, totalCostUsd: 0.01, avgLatencyMs: 100 };

// computeAdjustedRouteScore: null observed === scoreRoute (no behavior change w/o data)
assert.strictEqual(
  computeAdjustedRouteScore(g, grokArgs, grokSignals, null),
  scoreRoute(g, grokArgs, grokSignals),
);
// over-performing observed (1.0 vs prior 0.81) boosts score (180 -> 199)
assert.strictEqual(computeAdjustedRouteScore(g, grokArgs, grokSignals, obsGood), 199);
assert(computeAdjustedRouteScore(g, grokArgs, grokSignals, obsGood) > scoreRoute(g, grokArgs, grokSignals));
// under-performing observed (0.2 vs 0.81) penalizes score (180 -> 150)
assert.strictEqual(computeAdjustedRouteScore(g, grokArgs, grokSignals, obsBad), 150);
assert(computeAdjustedRouteScore(g, grokArgs, grokSignals, obsBad) < scoreRoute(g, grokArgs, grokSignals));

// updateRouteReliability: Bayesian blend of prior (0.81) with observed success rate (prior weight 3)
assert.strictEqual(updateRouteReliability(g, { calls: 10, successCount: 10, totalCostUsd: 0, avgLatencyMs: 100 }), 0.9562);
assert.strictEqual(updateRouteReliability(g, { calls: 10, successCount: 0, totalCostUsd: 0, avgLatencyMs: 100 }), 0.1869);
assert.strictEqual(updateRouteReliability(g, { calls: 10, successCount: 5, totalCostUsd: 0, avgLatencyMs: 100 }), 0.5715);
// no observations -> prior unchanged
assert.strictEqual(updateRouteReliability(g, { calls: 0, successCount: 0, totalCostUsd: 0, avgLatencyMs: 100 }), 0.81);

// evaluateCanary: candidate-vs-default A/B vote (min 5 calls, >=5% delta, <=1.5x latency, <=1.3x cost)
const canaryDefault = { calls: 10, successCount: 8, totalCostUsd: 0.01, avgLatencyMs: 210 };
const goodCanary = { calls: 10, successCount: 9, totalCostUsd: 0.01, avgLatencyMs: 200 };
const promote = evaluateCanary(g, localFast, goodCanary, canaryDefault);
assert.strictEqual(promote.ok, true);
assert.strictEqual(promote.vote, 'promote');
const reject = evaluateCanary(g, localFast, { calls: 10, successCount: 3, totalCostUsd: 0.01, avgLatencyMs: 200 }, canaryDefault);
assert.strictEqual(reject.ok, false);
assert.strictEqual(reject.vote, 'reject');
assert(reject.reasons.some((r) => r.includes('success rate')));
const insufficient = evaluateCanary(g, localFast, { calls: 2, successCount: 2, totalCostUsd: 0.01, avgLatencyMs: 200 }, canaryDefault);
assert.strictEqual(insufficient.ok, false);
assert.strictEqual(insufficient.vote, 'insufficient_data');
assert.strictEqual(insufficient.scores, null);
const hold = evaluateCanary(g, localFast, { calls: 10, successCount: 9, totalCostUsd: 0.01, avgLatencyMs: 9999 }, canaryDefault);
assert.strictEqual(hold.ok, false);
assert.strictEqual(hold.vote, 'hold');

// routeAllowed gates: paid route blocked without --paid-ok; risk ceiling enforced
const fuguRoute = ROUTES.find((r) => r.id === 'fugu_escalation');
const fuguSignals = taskSignals('fugu research sakana');
assert.strictEqual(
  routeAllowed(fuguRoute, { task: 'fugu research', risk: 'critical', maxCostUsd: 0.5, latencyMs: 60000, paidOk: false }, fuguSignals).allowed,
  false,
);
assert.strictEqual(
  routeAllowed(fuguRoute, { task: 'fugu research', risk: 'critical', maxCostUsd: 0.5, latencyMs: 60000, paidOk: true }, fuguSignals).allowed,
  true,
);
// risk ceiling: local_fast (medium ceiling) blocks a critical-risk task
assert.strictEqual(
  routeAllowed(localFast, { task: 'x', risk: 'critical', maxCostUsd: 0, latencyMs: 50000, paidOk: true }, taskSignals('x')).allowed,
  false,
);

console.log('Hermes economic router tests: PASS');
