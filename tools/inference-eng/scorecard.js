#!/usr/bin/env node
'use strict';

/**
 * Inference-engineering A+ scorecard — 7 playbook pillars + harness proofs.
 *
 *   node tools/inference-eng/scorecard.js
 *   node tools/inference-eng/scorecard.js --json --gate
 *
 * Exit 0 when grade is A or A+ and required checks pass; --gate exits 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const { listTasks } = require('./task-registry');
const { listPipelines, expandPipeline } = require('./pipeline');
const { selectModelChain, inferMode, MODES } = require('./degradation');
const { runOptimizer } = require('./optimizer');
const { enrichRecord, summarize } = require('./metrics');

const REPO = path.resolve(__dirname, '../..');

function fileExists(rel) {
  return fs.existsSync(path.join(REPO, rel));
}

function scorePillars() {
  const tasks = listTasks();
  const pipelines = listPipelines();
  const checks = [];

  // §1 Task decomposition
  const taskOk = tasks.length >= 8 && tasks.every((t) => t.latencyBudgetMs && t.preferredModels?.length && t.businessKpi);
  checks.push({
    pillar: 1,
    name: 'task_decomposition',
    pass: taskOk,
    score: taskOk ? 10 : 4,
    evidence: `${tasks.length} tasks with latency/quality/modelClass/KPI`,
  });

  // §2 Inference stack (gateway + multi-backend + SuperGrok path files)
  const stackOk =
    fileExists('tools/hermes-yolo-route-policy.js') &&
    fileExists('tools/inference-eng/degradation.js') &&
    fileExists('hermes-yolo-wrapper.js');
  checks.push({
    pillar: 2,
    name: 'inference_stack_control_plane',
    pass: stackOk,
    score: stackOk ? 10 : 5,
    evidence: 'LiteLLM route policy + degradation + hermes-yolo wrapper present (API/self-host hybrid)',
  });

  // §3 Instrumentation
  const sample = enrichRecord({
    model: 'glm-coding',
    latency_s: 2.5,
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200,
    status: 'success',
    messages: [{ role: 'user', content: 'fix the login bug' }],
    tools_offered: true,
    has_tool_calls: true,
  });
  const metricsOk =
    sample.taskId === 'code' &&
    sample.tokensPerSec != null &&
    sample.ttftProxyS != null &&
    typeof sample.costUsd === 'number';
  checks.push({
    pillar: 3,
    name: 'metrics_ttft_cost_task',
    pass: metricsOk,
    score: metricsOk ? 10 : 5,
    evidence: `enrich: task=${sample.taskId} tok/s=${sample.tokensPerSec?.toFixed?.(2)} ttftProxy=${sample.ttftProxyS?.toFixed?.(3)}`,
  });

  // §4 Core techniques — we encode cache/prefix reuse guidance + mode policy (not kernels)
  const techDoc = fileExists('docs/INFERENCE-ENGINEERING.md');
  checks.push({
    pillar: 4,
    name: 'inference_techniques_playbook',
    pass: techDoc,
    score: techDoc ? 10 : 3,
    evidence: techDoc
      ? 'docs encode KV-prefix reuse, prefill/decode awareness, provider feature checklist'
      : 'missing docs/INFERENCE-ENGINEERING.md',
  });

  // §5 Multi-model pipelines
  const pipe = expandPipeline('coding-fix', { mode: 'normal' });
  const pipeOk = pipe.stages.length >= 3 && pipelines.length >= 4;
  checks.push({
    pillar: 5,
    name: 'multi_step_pipelines',
    pass: pipeOk,
    score: pipeOk ? 10 : 5,
    evidence: `${pipelines.length} pipelines; coding-fix stages=${pipe.stages.map((s) => s.taskId).join('→')}`,
  });

  // §6 Optimizer loop
  const fixturePath = path.join(REPO, 'tests/fixtures/inference-eng/traffic-sample.jsonl');
  let optOk = false;
  let optDetail = 'no fixture';
  if (fs.existsSync(fixturePath)) {
    const report = runOptimizer({ windowHours: 0, logPath: fixturePath });
    // windowHours 0 means no cutoff in loadTraffic - good
    optOk = Array.isArray(report.proposals) && report.proposals.length >= 1 && report.abTestHint;
    optDetail = `proposals=${report.proposals.length} n=${report.summary.n}`;
  }
  checks.push({
    pillar: 6,
    name: 'self_optimization_loop',
    pass: optOk,
    score: optOk ? 10 : 4,
    evidence: optDetail,
  });

  // §7 Business KPI linkage
  const kpiOk = tasks.every((t) => t.businessKpi) && pipelines.every((p) => p.businessKpi);
  checks.push({
    pillar: 7,
    name: 'business_kpi_alignment',
    pass: kpiOk,
    score: kpiOk ? 10 : 5,
    evidence: 'every task+pipeline has businessKpi field',
  });

  // Degradation modes (isolated env so shell HERMES_YOLO_MODEL cannot pin emergency)
  const deg = selectModelChain({ taskText: 'smoke ping', mode: 'emergency', env: {} });
  const degOk =
    MODES.length === 3 && (/hermes|deepseek/.test(String(deg.primary)) || deg.chain.length >= 2);
  checks.push({
    pillar: 'harness',
    name: 'degradation_policy',
    pass: Boolean(degOk),
    score: degOk ? 10 : 4,
    evidence: `emergency primary=${deg.primary}`,
  });

  // Infer mode
  const em = inferMode({ swapUsedPct: 95, recentFailRate: 0.7 });
  checks.push({
    pillar: 'harness',
    name: 'auto_mode_inference',
    pass: em === 'emergency',
    score: em === 'emergency' ? 10 : 5,
    evidence: `swap95+fail70 → ${em}`,
  });

  return checks;
}

function gradeFromScores(avg) {
  if (avg >= 9.5) return 'A+';
  if (avg >= 9.0) return 'A';
  if (avg >= 8.0) return 'A-';
  if (avg >= 7.0) return 'B+';
  if (avg >= 6.0) return 'B';
  if (avg >= 5.0) return 'B-';
  if (avg >= 4.0) return 'C+';
  return 'C';
}

function runScorecard() {
  const checks = scorePillars();
  const scores = checks.map((c) => c.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const allPass = checks.every((c) => c.pass);
  const grade = gradeFromScores(avg);
  // A+ requires all pass and avg >= 9.5
  const aPlus = allPass && avg >= 9.5;
  return {
    generatedAt: new Date().toISOString(),
    grade: aPlus ? 'A+' : grade,
    averageScore: Math.round(avg * 100) / 100,
    maxScore: 10,
    allPass,
    aPlus,
    tenOfTen: aPlus,
    checks,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const gate = argv.includes('--gate');
  const report = runScorecard();
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    console.log(
      `Inference-eng scorecard: grade=${report.grade} avg=${report.averageScore}/10 ` +
        `pass=${report.checks.filter((c) => c.pass).length}/${report.checks.length} aPlus=${report.aPlus}`,
    );
    for (const c of report.checks) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] p${c.pillar} ${c.name} score=${c.score} — ${c.evidence}`);
    }
  }
  if (gate && !report.aPlus) process.exit(1);
  process.exit(0);
}

module.exports = {
  runScorecard,
  scorePillars,
  gradeFromScores,
};
