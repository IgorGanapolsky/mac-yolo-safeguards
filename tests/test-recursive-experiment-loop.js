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
  parseArgs,
  planExperiments,
  scoreExperiment,
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
