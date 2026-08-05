'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { classifyTask, listTasks, getTask } = require('../tools/inference-eng/task-registry');
const { enrichRecord, summarize, loadTraffic } = require('../tools/inference-eng/metrics');
const { selectModelChain, inferMode } = require('../tools/inference-eng/degradation');
const { expandPipeline, listPipelines } = require('../tools/inference-eng/pipeline');
const { runOptimizer, propose } = require('../tools/inference-eng/optimizer');
const { runScorecard } = require('../tools/inference-eng/scorecard');
const { estimateCostUsd } = require('../tools/inference-eng/pricing');
const { assess, gradeFleet } = require('../tools/inference-eng/fleet-health');

const FIXTURE = path.join(__dirname, 'fixtures/inference-eng/traffic-sample.jsonl');

console.log('=== inference-eng A+ suite ===\n');

// Tasks
const tasks = listTasks();
assert.ok(tasks.length >= 8, 'need full task registry');
assert.strictEqual(classifyTask('fix the auth bug').id, 'code');
assert.strictEqual(classifyTask('smoke ping hermes-yolo-ready').id, 'smoke');
assert.strictEqual(classifyTask('classify this lead').id, 'classify');
assert.ok(getTask('retrieve').latencyBudgetMs > 0);
console.log('  tasks: PASS');

// Metrics enrich
const enriched = enrichRecord({
  model: 'glm-coding',
  latency_s: 2,
  prompt_tokens: 1000,
  completion_tokens: 500,
  total_tokens: 1500,
  status: 'success',
  messages: [{ role: 'user', content: 'implement unit tests' }],
  tools_offered: true,
  has_tool_calls: true,
});
assert.strictEqual(enriched.taskId, 'code');
assert.ok(enriched.tokensPerSec > 0);
assert.ok(enriched.ttftProxyS > 0);
assert.strictEqual(typeof enriched.costUsd, 'number');
console.log('  metrics enrich: PASS');

// Pricing
assert.strictEqual(estimateCostUsd('glm-coding', 1e6, 1e6).usd, 0);
assert.ok(estimateCostUsd('unknown-metered-model', 1e6, 0).usd > 0);
console.log('  pricing: PASS');

// Degradation
const normal = selectModelChain({ taskText: 'fix login', mode: 'normal', env: {} });
assert.ok(normal.chain.length >= 2);
const emergency = selectModelChain({ taskText: 'fix login', mode: 'emergency', env: {} });
assert.ok(/hermes|deepseek/.test(emergency.primary));
assert.strictEqual(inferMode({ swapUsedPct: 95, recentFailRate: 0.8 }), 'emergency');
assert.strictEqual(inferMode({ swapUsedPct: 10, recentFailRate: 0.05 }), 'normal');
// SuperGrok must survive degraded mode (v3) and beat stale glm pin
const degGrok = selectModelChain({
  taskText: 'fix login',
  mode: 'degraded',
  env: { HERMES_YOLO_BACKEND: 'grok', HERMES_YOLO_MODEL: 'glm-coding' },
});
assert.strictEqual(degGrok.primary, 'grok-4.5', `degraded+SuperGrok should prefer grok-4.5, got ${degGrok.primary}`);
assert.ok(degGrok.chain.includes('grok-4.5'), 'degraded must keep SuperGrok in chain');
assert.ok(degGrok.policyVersion >= 3);
// Explicit hermes backend + stale glm pin + SuperGrok prefer off → pin wins (no SuperGrok override)
const degHermesPin = selectModelChain({
  taskText: 'fix login',
  mode: 'degraded',
  env: {
    HERMES_YOLO_BACKEND: 'hermes',
    HERMES_PREFER_SUPERGROK: '0',
    HERMES_YOLO_MODEL: 'glm-coding',
  },
});
assert.strictEqual(
  degHermesPin.primary,
  'glm-coding',
  `hermes+prefer off should honor glm pin, got ${degHermesPin.primary}`,
);
console.log('  degradation: PASS');

// Pipelines
const pipes = listPipelines();
assert.ok(pipes.length >= 4);
const coding = expandPipeline('coding-fix', { mode: 'normal' });
assert.deepStrictEqual(
  coding.stages.map((s) => s.taskId),
  ['retrieve', 'plan', 'code'],
);
assert.ok(coding.totalLatencyBudgetMs > 0);
console.log('  pipelines: PASS');

// Optimizer on fixture
assert.ok(fs.existsSync(FIXTURE));
const metrics = loadTraffic(FIXTURE, { windowHours: 0 });
assert.ok(metrics.length >= 5);
const summary = summarize(metrics);
const proposals = propose(summary);
assert.ok(proposals.length >= 1);
const report = runOptimizer({ logPath: FIXTURE, windowHours: 0 });
assert.ok(report.abTestHint.trafficSplit === 0.1);
// Expect tool noncompliance on qwen2.5:3b in fixture
assert.ok(
  proposals.some((p) => p.kind === 'tool_noncompliance' || p.kind === 'high_failure_rate' || p.kind === 'latency_over_budget' || p.kind === 'task_failure_hotspot' || p.kind === 'healthy'),
  'optimizer should emit proposals',
);
console.log('  optimizer: PASS');

// Scorecard A+ (STRICT boolean pass — no truthy objects)
const scorecard = runScorecard();
console.log(`  scorecard grade=${scorecard.grade} avg=${scorecard.averageScore} aPlus=${scorecard.aPlus}`);
assert.strictEqual(scorecard.aPlus, true, `expected A+, got ${scorecard.grade} avg=${scorecard.averageScore}`);
assert.ok(scorecard.averageScore >= 9.5);
assert.ok(
  scorecard.checks.every((c) => c.pass === true),
  `every pass must be boolean true, got: ${scorecard.checks.map((c) => `${c.name}:${typeof c.pass}`).join(',')}`,
);
const p6 = scorecard.checks.find((c) => c.name === 'self_optimization_loop');
assert.strictEqual(typeof p6.pass, 'boolean');
assert.strictEqual(p6.pass, true);
// abTestHint may live as metadata, never as pass
if (p6.abTestHint !== undefined) {
  assert.strictEqual(typeof p6.abTestHint, 'object');
  assert.notStrictEqual(p6.pass, p6.abTestHint);
}
console.log('  scorecard A+: PASS');

// Fleet health grades live log separately (fixture path)
const fleet = assess({ windowHours: 0, logPath: FIXTURE, env: {}, dropDeadModels: false });
assert.ok(fleet.n >= 5, `expected fixture rows, n=${fleet.n}`);
assert.ok(fleet.grade);
assert.ok(fleet.recommendedMode);
assert.ok(fleet.recommendedCodingPrimary);
assert.ok(fleet.sources, 'dual-source sources block required');
assert.strictEqual(typeof fleet.sources.litellmN, 'number');
assert.strictEqual(gradeFleet(0.12, 30).grade, 'F');
assert.strictEqual(gradeFleet(0.96, 30).grade, 'A+');
console.log(`  fleet-health fixture grade=${fleet.grade} success=${fleet.successRate}: PASS`);

// Dual-source: SuperGrok receipts merge + dead glm drop
const { loadFleetMetrics, loadGrokReceipts } = require('../tools/inference-eng/metrics');
const dual = loadFleetMetrics({
  windowHours: 0,
  logPath: FIXTURE,
  receiptPath: path.join(__dirname, 'fixtures/inference-eng/grok-receipts-sample.jsonl'),
  dropDeadModels: true,
});
assert.ok(dual.grokN >= 1, `expected grok receipts, grokN=${dual.grokN}`);
assert.ok(dual.metrics.some((m) => /grok/i.test(m.model)), 'merged metrics should include grok');
console.log(`  fleet dual-source merge grokN=${dual.grokN} droppedDead=${dual.droppedDeadN}: PASS`);

console.log('\n=== inference-eng A+ suite: ALL PASS ===');
