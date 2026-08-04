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
const normal = selectModelChain({ taskText: 'fix login', mode: 'normal' });
assert.ok(normal.chain.length >= 2);
const emergency = selectModelChain({ taskText: 'fix login', mode: 'emergency', env: {} });
assert.ok(/hermes|deepseek/.test(emergency.primary));
assert.strictEqual(inferMode({ swapUsedPct: 95, recentFailRate: 0.8 }), 'emergency');
assert.strictEqual(inferMode({ swapUsedPct: 10, recentFailRate: 0.05 }), 'normal');
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

// Scorecard A+
const scorecard = runScorecard();
console.log(`  scorecard grade=${scorecard.grade} avg=${scorecard.averageScore} aPlus=${scorecard.aPlus}`);
assert.strictEqual(scorecard.aPlus, true, `expected A+, got ${scorecard.grade} avg=${scorecard.averageScore}`);
assert.ok(scorecard.averageScore >= 9.5);
assert.ok(scorecard.checks.every((c) => c.pass));
console.log('  scorecard A+: PASS');

console.log('\n=== inference-eng A+ suite: ALL PASS ===');
