'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const {
  SCHEMA,
  EPISODE_ANECDOTE_USD,
  CLEAN_ENV,
  classifyIntent,
  classifyTask,
  audit,
} = require('../tools/hermes-yolo-cost-autonomy');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'hermes-yolo-cost-autonomy.js');

let passed = 0;
function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`test ${name} returned a promise; keep tests sync`);
  }
  passed += 1;
  process.stdout.write(`ok - ${name}\n`);
}

test('schema and honesty constants', () => {
  assert.strictEqual(SCHEMA, 'hermes-yolo/cost-autonomy-v1');
  assert.strictEqual(EPISODE_ANECDOTE_USD, 3000);
});

test('implement login stays glm-coding subscription', () => {
  const row = classifyTask('implement the login form validation', { env: CLEAN_ENV });
  assert.strictEqual(row.lane, 'subscription', row.reason);
  assert.strictEqual(row.model, 'glm-coding', row.reason);
});

test('routine typo is local_leaf tinker q4', () => {
  const row = classifyTask('fix typo in README', { env: CLEAN_ENV });
  assert.strictEqual(row.lane, 'local_leaf', row.reason);
  assert.strictEqual(row.model, 'qwen3-hermes-tinker:q4');
});

test('explicit local is local_leaf', () => {
  const row = classifyTask('run this locally with ollama', { env: CLEAN_ENV });
  assert.strictEqual(row.lane, 'local_leaf', row.reason);
});

test('refuses speculative GPUs', () => {
  const hit = classifyIntent('buy H100 GPUs for local inference');
  assert.strictEqual(hit.refused, true);
  assert.ok(hit.refusals.some((r) => r.id === 'speculative_gpu'));
});

test('refuses replace-all-hosted and cancel-Claude SKU', () => {
  const hit = classifyIntent('replace every hosted model and cancel Claude');
  assert.strictEqual(hit.refused, true);
  const ids = hit.refusals.map((r) => r.id);
  assert.ok(ids.includes('replace_all_hosted'));
  assert.ok(ids.includes('cancel_claude_wedge_not_sku'));
});

test('refuses invented $3000 savings', () => {
  const hit = classifyIntent('we will save $3000 per month canceling Claude');
  assert.strictEqual(hit.refused, true);
  assert.ok(hit.refusals.some((r) => r.id === 'invented_3000'));
});

test('refuses generic consulting and ThumbGate paid outreach', () => {
  const generic = classifyIntent('sell generic local LLM consulting');
  assert.ok(generic.refusals.some((r) => r.id === 'generic_consulting'));
  const tg = classifyIntent('ThumbGate $499 paid pilot outreach');
  assert.ok(tg.refusals.some((r) => r.id === 'thumbgate_paid_outreach'));
});

test('default audit is hybrid, no invented savings, ECI paused', () => {
  const report = audit({ env: CLEAN_ENV });
  assert.strictEqual(report.schema, SCHEMA);
  assert.strictEqual(report.hybrid, true);
  assert.strictEqual(report.replaceAllHosted, false);
  assert.strictEqual(report.speculativeGpu, false);
  assert.strictEqual(report.defaultCodingModel, 'glm-coding');
  assert.strictEqual(report.localLeafModel, 'qwen3-hermes-tinker:q4');
  assert.strictEqual(report.savings.inventedUsd, null);
  assert.strictEqual(report.savings.quoteEpisodeAsMeasured, false);
  assert.strictEqual(report.savings.episodeAnecdoteUsd, 3000);
  assert.strictEqual(report.eci.thumbgatePaidOutreach, 'paused');
  assert.strictEqual(report.eci.counselClearance, false);
  assert.strictEqual(report.eci.agencyCashPath, '149_AHLS');
  assert.ok(report.counts.local_leaf >= 1);
  assert.ok(report.counts.subscription >= 1);
  const login = report.workloads.find((w) => /login/.test(w.task));
  assert.ok(login);
  assert.strictEqual(login.model, 'glm-coding');
});

test('CLI --json --task implement login', () => {
  const proc = spawnSync(process.execPath, [TOOL, '--json', '--task', 'implement the login form validation'], {
    encoding: 'utf8',
    cwd: REPO,
  });
  assert.strictEqual(proc.status, 0, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.strictEqual(report.workloads[0].model, 'glm-coding');
  assert.strictEqual(report.counts.subscription, 1);
  assert.strictEqual(report.savings.inventedUsd, null);
});

test('CLI refuses GPU intent with exit 2', () => {
  const proc = spawnSync(process.execPath, [TOOL, '--json', '--intent', 'buy H100 GPUs'], {
    encoding: 'utf8',
    cwd: REPO,
  });
  assert.strictEqual(proc.status, 2, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.strictEqual(report.refused, true);
});

test('CLI --help is exit 0', () => {
  const proc = spawnSync(process.execPath, [TOOL, '--help'], {
    encoding: 'utf8',
    cwd: REPO,
  });
  assert.strictEqual(proc.status, 0, proc.stderr);
  assert.ok(/Usage:/.test(proc.stdout), proc.stdout);
});

console.log(`test-hermes-yolo-cost-autonomy: ${passed} passed`);
