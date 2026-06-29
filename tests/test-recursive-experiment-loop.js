#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_EXPERIMENTS,
  RECURSIVE_PUBLIC_PATTERNS,
  artifactCoverage,
  evaluateOutcome,
  metricDelta,
  parseArgs,
  planExperiments,
  readLedger,
  recordOutcome,
  scoreEfficiencyRun,
  scoreExperiment,
  statusPass,
  validateExperiment,
  validateExperiments,
} = require('../tools/recursive-experiment-loop');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-loop-'));
  for (const file of [
    'tools/agent-sync-brief.js',
    'tests/test-agent-sync-brief.js',
    'docs/AGENT-SYNC-BRIEF.md',
    'tools/hermes-source-packs.js',
    'tools/graphify-readiness.js',
    'graphify-out/graph.json',
  ]) {
    const fullPath = path.join(repo, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '{}\n');
  }
  return repo;
}

test('public patterns include reward-hack and variance validation gates', () => {
  const keys = RECURSIVE_PUBLIC_PATTERNS.map((pattern) => pattern.key);
  assert(keys.includes('reward-hack-validation'));
  assert(keys.includes('variance-validation'));
  assert(keys.includes('context-retention'));
});

test('default experiments include Arena-style token efficiency benchmark', () => {
  const experiment = DEFAULT_EXPERIMENTS.find((item) => item.id === 'arena_token_efficiency_benchmark');
  assert(experiment);
  assert(/output token/i.test(experiment.objective));
  assert(/tool_hallucinations/.test(experiment.targetMetric));
});

test('valid default experiments include metrics, evaluators, and checks', () => {
  const repo = fixtureRepo();
  const experiment = DEFAULT_EXPERIMENTS.find((item) => item.id === 'cross_agent_sync_packet');
  const validation = validateExperiment(experiment, repo);
  assert.strictEqual(validation.ok, true);
  assert(validation.coverage.ratio > 0);
});

test('missing evaluator and validation checks reject speculative ideas', () => {
  const validation = validateExperiment({
    id: 'vibes_only',
    objective: 'Improve everything',
    targetMetric: 'more good',
    implementation: 'Let an agent decide',
    retainedContext: 'state.json',
    branchCombinePlan: 'merge all branches',
    existingArtifacts: ['missing.js'],
  }, fixtureRepo());
  assert.strictEqual(validation.ok, false);
  assert(validation.issues.includes('missing evaluator'));
  assert(validation.issues.includes('missing rewardHackChecks'));
  assert(validation.issues.includes('missing varianceChecks'));
  assert(validation.issues.includes('no existing artifacts found'));
});

test('external side effects require approval gate', () => {
  const experiment = {
    ...DEFAULT_EXPERIMENTS.find((item) => item.id === 'checkout_recovery_experiment'),
    approvalRequired: false,
  };
  const validation = validateExperiment(experiment, fixtureRepo());
  assert.strictEqual(validation.ok, false);
  assert(validation.issues.includes('risky sideEffect requires approvalRequired=true'));
});

test('task keywords promote relevant experiment', () => {
  const plan = planExperiments({
    repo: fixtureRepo(),
    task: 'obsidian agent sync all agents everywhere',
    limit: 3,
  });
  assert.strictEqual(plan.schema, 'hermes-recursive-experiment-loop/v1');
  assert.strictEqual(plan.selected[0].id, 'cross_agent_sync_packet');
  assert(plan.guardrails.some((guardrail) => /reward-hack/.test(guardrail)));
});

test('score rewards artifact coverage and penalizes risk/cost', () => {
  const repo = fixtureRepo();
  const syncExperiment = DEFAULT_EXPERIMENTS.find((item) => item.id === 'cross_agent_sync_packet');
  const freezeExperiment = DEFAULT_EXPERIMENTS.find((item) => item.id === 'freeze_guard_feedback_loop');
  assert(scoreExperiment(syncExperiment, { repo, task: 'sync' }) > scoreExperiment(freezeExperiment, { repo, task: 'sync' }));
});

test('artifactCoverage reports present and missing source files', () => {
  const repo = fixtureRepo();
  const coverage = artifactCoverage({
    existingArtifacts: ['tools/agent-sync-brief.js', 'missing/file.js'],
  }, repo);
  assert.deepStrictEqual(coverage.present, ['tools/agent-sync-brief.js']);
  assert.deepStrictEqual(coverage.missing, ['missing/file.js']);
  assert.strictEqual(coverage.ratio, 0.5);
});

test('validateExperiments supports custom JSON files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-loop-file-'));
  const file = path.join(tmp, 'experiments.json');
  fs.writeFileSync(file, JSON.stringify([DEFAULT_EXPERIMENTS[0]], null, 2));
  const result = validateExperiments({ repo: fixtureRepo(), file });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 1);
});

test('parseArgs supports task and limit', () => {
  const args = parseArgs(['plan', '--json', '--task', 'checkout recovery', '--limit', '2']);
  assert.strictEqual(args._[0], 'plan');
  assert.strictEqual(args.json, true);
  assert.strictEqual(args.task, 'checkout recovery');
  assert.strictEqual(args.limit, 2);
});

test('statusPass normalizes evaluator statuses', () => {
  assert.strictEqual(statusPass('pass'), true);
  assert.strictEqual(statusPass('success'), true);
  assert.strictEqual(statusPass('fail'), false);
  assert.strictEqual(statusPass('unknown'), null);
});

test('metricDelta supports higher-is-better and lower-is-better metrics', () => {
  assert.deepStrictEqual(metricDelta(10, 13, 'higher').improved, true);
  const lower = metricDelta(100, 80, 'lower');
  assert.strictEqual(lower.improved, true);
  assert.strictEqual(lower.delta, 20);
  assert.strictEqual(metricDelta('nope', 1).ok, false);
});

test('evaluateOutcome adopts only when evaluator, reward-hack, variance, and metric gates pass', () => {
  const outcome = evaluateOutcome({
    before: 4,
    after: 9,
    evaluator: 'pass',
    rewardHack: 'pass',
    variance: 'pass',
    minDelta: 1,
  });
  assert.strictEqual(outcome.decision, 'adopt');
  assert.strictEqual(outcome.okToAdopt, true);
});

test('evaluateOutcome retries incomplete evidence instead of adopting from vibes', () => {
  const outcome = evaluateOutcome({
    before: 4,
    after: 9,
    evaluator: 'pass',
    rewardHack: 'pass',
  });
  assert.strictEqual(outcome.decision, 'retry');
  assert(outcome.issues.includes('variance check missing'));
});

test('evaluateOutcome rejects failed evaluators and non-improvements', () => {
  const outcome = evaluateOutcome({
    before: 9,
    after: 4,
    evaluator: 'fail',
    rewardHack: 'pass',
    variance: 'pass',
  });
  assert.strictEqual(outcome.decision, 'reject');
  assert(outcome.issues.includes('evaluator failed'));
  assert(outcome.issues.some((issue) => /did not improve/.test(issue)));
});

test('recordOutcome appends a private ledger record and summarizes decisions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recursive-ledger-'));
  const ledger = path.join(tmp, 'ledger.jsonl');
  const result = recordOutcome({
    ledger,
    experiment: 'cross_agent_sync_packet',
    before: 1,
    after: 3,
    evaluator: 'pass',
    rewardHack: 'pass',
    variance: 'pass',
    evidence: 'unit test fixture',
  });
  assert.strictEqual(result.record.evaluation.decision, 'adopt');
  const summary = readLedger(ledger);
  assert.strictEqual(summary.total, 1);
  assert.strictEqual(summary.adopt, 1);
  assert.strictEqual(summary.latest[0].experimentId, 'cross_agent_sync_packet');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('parseArgs supports outcome recording flags', () => {
  const args = parseArgs([
    'record',
    '--experiment',
    'cross_agent_sync_packet',
    '--before',
    '1',
    '--after',
    '2',
    '--evaluator',
    'pass',
    '--reward-hack',
    'pass',
    '--variance',
    'pass',
  ]);
  assert.strictEqual(args._[0], 'record');
  assert.strictEqual(args.experiment, 'cross_agent_sync_packet');
  assert.strictEqual(args.before, 1);
  assert.strictEqual(args.after, 2);
});

test('scoreEfficiencyRun promotes efficient evaluated runs to cheap or local candidates', () => {
  const result = scoreEfficiencyRun({
    before: 40,
    after: 64,
    outputTokens: 800,
    inputTokens: 2000,
    toolHallucinations: 0,
    bashRecoveryFailures: 0,
    evaluator: 'pass',
  });
  assert.strictEqual(result.schema, 'hermes-agent-arena-efficiency/v1');
  assert.strictEqual(result.route, 'cheap_or_local_candidate');
  assert.strictEqual(result.per1kOutputTokens, 30);
  assert.strictEqual(result.gates.evaluatorPassed, true);
});

test('scoreEfficiencyRun refuses failed or hallucinated runs despite token efficiency', () => {
  const failed = scoreEfficiencyRun({
    before: 40,
    after: 80,
    outputTokens: 500,
    evaluator: 'fail',
  });
  assert.strictEqual(failed.route, 'do_not_promote');
  assert(failed.issues.includes('evaluator failed'));

  const hallucinated = scoreEfficiencyRun({
    before: 40,
    after: 80,
    outputTokens: 500,
    evaluator: 'pass',
    toolHallucinations: 4,
  });
  assert.strictEqual(hallucinated.route, 'do_not_promote');
  assert(hallucinated.issues.includes('tool hallucination penalty applied'));
});

test('parseArgs supports efficiency scoring flags', () => {
  const args = parseArgs([
    'efficiency',
    '--before',
    '10',
    '--after',
    '20',
    '--input-tokens',
    '100',
    '--output-tokens',
    '250',
    '--tool-hallucinations',
    '1',
    '--bash-recovery-failures',
    '2',
    '--latency-ms',
    '30000',
    '--cost-usd',
    '0.25',
    '--evaluator',
    'pass',
  ]);
  assert.strictEqual(args._[0], 'efficiency');
  assert.strictEqual(args.inputTokens, 100);
  assert.strictEqual(args.outputTokens, 250);
  assert.strictEqual(args.toolHallucinations, 1);
  assert.strictEqual(args.bashRecoveryFailures, 2);
  assert.strictEqual(args.latencyMs, 30000);
  assert.strictEqual(args.costUsd, 0.25);
});
