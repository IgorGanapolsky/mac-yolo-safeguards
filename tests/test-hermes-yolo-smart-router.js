'use strict';

const assert = require('assert');

const {
  GRANITE_42_LOCAL_MODEL,
  buildContentFreeDecisionReceipt,
  classifyTask,
  evaluateOpenRouterCandidate,
  evaluationSummary,
  gradePrivateProbe,
  runPrivateEvaluations,
  selectSmartRoute,
} = require('../tools/hermes-yolo-smart-router.js');
const {
  buildRouteReceipt,
  resolveSmartRoute,
} = require('../hermes-yolo-wrapper.js');

const NOW = '2026-08-26T16:00:00.000Z';
const BASE_ROUTE = Object.freeze({
  provider: 'custom:litellm-gateway',
  model: 'kimi-code-k3',
});

function catalog(overrides = {}) {
  return {
    schema: 'hermes-yolo/openrouter-catalog-v1',
    fetchedAt: NOW,
    providerCredit: {
      checkedAt: NOW,
      totalCreditsUsd: 20,
      totalUsageUsd: 10,
      remainingUsd: 10,
    },
    models: [
      {
        id: 'openrouter/free',
        contextLength: 200000,
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsTools: true,
        supportsStructuredOutput: false,
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
      },
      {
        id: 'ibm-granite/granite-4.1-8b',
        contextLength: 131072,
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsTools: true,
        supportsStructuredOutput: true,
        inputPricePerMillion: 0.05,
        outputPricePerMillion: 0.10,
      },
      {
        id: 'bytedance-seed/seed-2.0-mini',
        contextLength: 262144,
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text'],
        supportsTools: true,
        supportsStructuredOutput: false,
        inputPricePerMillion: 0.10,
        outputPricePerMillion: 0.40,
      },
      {
        id: 'bytedance-seed/seed-2-1-turbo',
        contextLength: 262144,
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text'],
        supportsTools: true,
        supportsStructuredOutput: true,
        inputPricePerMillion: 0.50,
        outputPricePerMillion: 2.50,
      },
    ],
    ...overrides,
  };
}

function evaluations(overrides = {}) {
  const defaults = {
    local_granite42_8b: { score: 0.90 },
    openrouter_free: { score: 0.84, actualModel: 'meta-llama/llama-3.3-70b-instruct:free' },
    openrouter_granite41_8b: { score: 0.92 },
    openrouter_seed20_mini: { score: 0.91 },
    openrouter_seed21_turbo: { score: 0.96 },
  };
  return {
    schema: 'hermes-yolo/model-evals-v1',
    evaluations: Object.entries(defaults).map(([candidateId, values]) => ({
      candidateId,
      status: 'pass',
      score: values.score,
      failureRate: 0,
      sampleCount: 3,
      verifiedAt: NOW,
      actualModel: values.actualModel || null,
      ...overrides[candidateId],
    })),
  };
}

function input(overrides = {}) {
  return {
    task: 'summarize these release notes',
    env: {
      HERMES_YOLO_DYNAMIC_ROUTING: '1',
      HERMES_YOLO_DYNAMIC_ALLOW_PAID: '1',
    },
    now: NOW,
    baseRoute: BASE_ROUTE,
    catalog: catalog(),
    evaluations: evaluations(),
    localModels: [GRANITE_42_LOCAL_MODEL],
    budget: { month: '2026-08', limitUsd: 10, spentUsd: 6.7885, updatedAt: NOW },
    expectedInputTokens: 1000,
    expectedOutputTokens: 1000,
    maxCallUsd: 0.01,
    ...overrides,
  };
}

function considered(decision, id) {
  return decision.considered.find((item) => item.id === id);
}

assert.deepStrictEqual(
  classifyTask('review the private customer contract', { expectedContextTokens: 4000 }),
  {
    sensitive: true,
    requiresTools: false,
    requiresMultimodal: false,
    hardAgentic: false,
    expectedContextTokens: 4000,
  },
);

{
  const decision = selectSmartRoute(input({ env: {} }));
  assert.strictEqual(decision.enabled, false);
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.strictEqual(decision.reason, 'dynamic-routing-disabled');
}

{
  const exact = { choices: [{ message: { content: 'ROUTE_OK' } }] };
  const structured = { choices: [{ message: { content: '{"status":"ok","count":3}' } }] };
  const tool = { choices: [{ message: { tool_calls: [{ function: { name: 'lookup_build_status', arguments: '{"build_id":42}' } }] } }] };
  assert.strictEqual(gradePrivateProbe('exact-output', exact), true);
  assert.strictEqual(gradePrivateProbe('structured-json', structured), true);
  assert.strictEqual(gradePrivateProbe('required-tool-call', tool), true);
  assert.strictEqual(gradePrivateProbe('exact-output', { choices: [{ message: { content: 'Almost ROUTE_OK' } }] }), false);
}

{
  const summary = evaluationSummary('openrouter_free', [
    { pass: true, actualModel: 'free/model-a', costUsd: 0 },
    { pass: true, actualModel: 'free/model-b', costUsd: 0 },
    { pass: true, actualModel: 'free/model-b', costUsd: 0 },
  ], NOW);
  assert.strictEqual(summary.status, 'pass');
  assert.strictEqual(summary.sampleCount, 3);
  assert.deepStrictEqual(summary.actualModels, ['free/model-a', 'free/model-b']);
  assert.strictEqual(summary.actualModel, 'free/model-b');
}

async function testLiveEvaluationContract() {
  const responses = [
    { model: 'ibm-granite/granite-4.1-8b', choices: [{ message: { content: 'ROUTE_OK' } }], usage: { cost: 0.00001 } },
    { model: 'ibm-granite/granite-4.1-8b', choices: [{ message: { content: '{"status":"ok","count":3}' } }], usage: { cost: 0.00001 } },
    { model: 'ibm-granite/granite-4.1-8b', choices: [{ message: { tool_calls: [{ function: { name: 'lookup_build_status', arguments: '{"build_id":42}' } }] } }], usage: { cost: 0.00001 } },
  ];
  const requestedModels = [];
  const evaluation = await evaluateOpenRouterCandidate(
    { id: 'openrouter_granite41_8b', model: 'ibm-granite/granite-4.1-8b' },
    {
      verifiedAt: NOW,
      completion: async (payload) => {
        requestedModels.push(payload.model);
        return { response: responses.shift(), latencyMs: 12 };
      },
    },
  );
  assert.strictEqual(evaluation.status, 'pass');
  assert.strictEqual(evaluation.score, 1);
  assert.strictEqual(evaluation.totalCostUsd, 0.00003);
  assert.deepStrictEqual(requestedModels, Array(3).fill('ibm-granite/granite-4.1-8b'));
  assert.strictEqual(JSON.stringify(evaluation).includes('Return exactly'), false);
}

async function testProviderCreditStopsPaidEvaluation() {
  let calls = 0;
  const result = await runPrivateEvaluations({
    candidateId: 'openrouter_granite41_8b',
    verifiedAt: NOW,
    catalog: catalog({ providerCredit: { checkedAt: NOW, remainingUsd: -0.01 } }),
    completion: async () => { calls += 1; throw new Error('must not be called'); },
  });
  assert.strictEqual(calls, 0);
  assert.strictEqual(result.evaluations[0].status, 'fail');
  assert.strictEqual(result.evaluations[0].blocker, 'provider-credit-unavailable');
}

{
  const decision = selectSmartRoute(input({
    task: 'analyze this private customer incident and use tools',
  }));
  assert.strictEqual(decision.selected.id, 'local_granite42_8b');
  assert.strictEqual(decision.selected.provider, 'custom:ollama-local-64k');
  assert.strictEqual(decision.blocked, false);
  assert.strictEqual(considered(decision, 'openrouter_seed21_turbo').eligible, false);
  assert.ok(considered(decision, 'openrouter_seed21_turbo').reasons.includes('privacy-external-denied'));
}

{
  const noProviderCredit = catalog();
  delete noProviderCredit.providerCredit;
  const decision = selectSmartRoute(input({
    localModels: [],
    catalog: noProviderCredit,
    evaluations: evaluations({ openrouter_free: { status: 'fail', failureRate: 1 } }),
  }));
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.ok(considered(decision, 'openrouter_granite41_8b').reasons.includes('provider-credit-state-missing'));
}

{
  const decision = selectSmartRoute(input({
    localModels: [],
    catalog: catalog({ providerCredit: { checkedAt: NOW, remainingUsd: -0.19 } }),
    evaluations: evaluations({ openrouter_free: { status: 'fail', failureRate: 1 } }),
  }));
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.ok(considered(decision, 'openrouter_granite41_8b').reasons.includes('provider-credit-insufficient'));
}

{
  const decision = selectSmartRoute(input({
    task: 'analyze this confidential customer incident',
    localModels: [],
  }));
  assert.strictEqual(decision.selected, null);
  assert.strictEqual(decision.blocked, true);
  assert.strictEqual(decision.reason, 'sensitive-task-has-no-qualified-local-model');
}

{
  const failedFree = evaluations({
    openrouter_free: { status: 'fail', score: 0.99, failureRate: 1 },
  });
  const decision = selectSmartRoute(input({
    localModels: [],
    evaluations: failedFree,
  }));
  assert.strictEqual(decision.selected.id, 'openrouter_granite41_8b');
  assert.ok(considered(decision, 'openrouter_free').reasons.includes('private-eval-failed'));
}

{
  const decision = selectSmartRoute(input({
    localModels: [],
    catalog: catalog({ fetchedAt: '2026-08-25T00:00:00.000Z' }),
  }));
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.strictEqual(decision.fallback, true);
  assert.ok(considered(decision, 'openrouter_granite41_8b').reasons.includes('catalog-stale'));
}

{
  const decision = selectSmartRoute(input({
    task: 'inspect this screenshot and autonomously fix the multi-file coding bug using tools',
    localModels: [],
  }));
  assert.strictEqual(decision.selected.id, 'openrouter_seed21_turbo');
}

{
  const decision = selectSmartRoute(input({
    task: 'summarize the attached video',
    localModels: [],
    expectedContextTokens: 220000,
  }));
  assert.strictEqual(decision.selected.id, 'openrouter_seed20_mini');
}

{
  const allExternalFail = evaluations({
    openrouter_free: { status: 'fail', failureRate: 1 },
  });
  const decision = selectSmartRoute(input({
    localModels: [],
    evaluations: allExternalFail,
    budget: { month: '2026-08', limitUsd: 10, spentUsd: 10, updatedAt: NOW },
  }));
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.strictEqual(decision.fallback, true);
  assert.ok(considered(decision, 'openrouter_seed21_turbo').reasons.includes('monthly-budget-exhausted'));
}

{
  const decision = selectSmartRoute(input({
    localModels: [],
    evaluations: evaluations({
      openrouter_free: { status: 'fail', failureRate: 1 },
    }),
    budget: {
      month: '2026-08',
      limitUsd: 10,
      spentUsd: 6.7885,
      updatedAt: '2026-08-26T12:00:00.000Z',
    },
  }));
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
  assert.ok(considered(decision, 'openrouter_granite41_8b').reasons.includes('monthly-budget-state-stale'));
}

{
  const decision = selectSmartRoute(input({
    localModels: [],
    catalog: catalog({
      models: [
        ...catalog().models,
        {
          id: 'ibm-granite/granite-4.2-8b',
          contextLength: 131072,
          inputModalities: ['text'],
          outputModalities: ['text'],
          supportsTools: true,
          inputPricePerMillion: 0.05,
          outputPricePerMillion: 0.10,
        },
      ],
    }),
  }));
  assert.strictEqual(
    decision.considered.some((item) => item.model === 'ibm-granite/granite-4.2-8b'),
    false,
    'Granite 4.2 must remain a local-only candidate until an exact configured route is added',
  );
}

{
  const task = 'private merger notes for Project Nightingale';
  const decision = selectSmartRoute(input({ task }));
  const receipt = buildContentFreeDecisionReceipt(decision, { task, generatedAt: NOW });
  const serialized = JSON.stringify(receipt);
  assert.strictEqual(receipt.schema, 'hermes-yolo/smart-route-decision-v1');
  assert.ok(receipt.taskDigest);
  assert.strictEqual(serialized.includes('Project Nightingale'), false);
  assert.strictEqual(serialized.includes(task), false);
}

{
  const env = {
    HERMES_YOLO_DYNAMIC_ROUTING: '1',
    HERMES_YOLO_DYNAMIC_ALLOW_PAID: '1',
  };
  const decision = resolveSmartRoute(
    ['-z', 'summarize these release notes'],
    env,
    BASE_ROUTE,
    {
      module: require('../tools/hermes-yolo-smart-router.js'),
      catalog: catalog(),
      evaluations: evaluations({
        openrouter_free: { status: 'fail', failureRate: 1 },
      }),
      budget: { month: '2026-08', limitUsd: 10, spentUsd: 6.7885, updatedAt: NOW },
      localModels: [],
    },
  );
  assert.strictEqual(decision.selected.id, 'openrouter_granite41_8b');
  const smartRouting = buildContentFreeDecisionReceipt(decision, {
    task: 'summarize these release notes',
    generatedAt: NOW,
  });
  const receipt = buildRouteReceipt({
    generatedAt: NOW,
    rawArgs: ['-z', 'summarize these release notes'],
    provider: decision.selected.provider,
    model: decision.selected.model,
    smartRouting,
    status: 'pass',
    exitCode: 0,
  });
  assert.strictEqual(receipt.policy.smartRouting.decision.selectedId, 'openrouter_granite41_8b');
  assert.strictEqual(JSON.stringify(receipt).includes('summarize these release notes'), false);
}

{
  const decision = resolveSmartRoute(
    ['doctor'],
    { HERMES_YOLO_DYNAMIC_ROUTING: '1' },
    BASE_ROUTE,
  );
  assert.strictEqual(decision.enabled, false);
  assert.strictEqual(decision.reason, 'admin-or-flag-command-bypass');
  assert.deepStrictEqual(decision.selected, BASE_ROUTE);
}

Promise.all([
  testLiveEvaluationContract(),
  testProviderCreditStopsPaidEvaluation(),
]).then(() => {
  console.log('PASS: hermes-yolo smart router is privacy-, evidence-, capability-, and budget-gated');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
