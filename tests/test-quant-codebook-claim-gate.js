#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewQuantClaim, unmeasuredQuantRoute } = require('../tools/quant-codebook-claim-gate');
const { clerkModelAllowed, pinLiveClerkRequest, buildVllmGuidedRequest } = require('../tools/vllm-inference-router');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function assertNullMeasurements(report) {
  assert.strictEqual(report.localBytes, null);
  assert.strictEqual(report.localRetention, null);
  assert.strictEqual(report.localTokensPerSecond, null);
  assert.strictEqual(report.epochsSaved, null);
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/quant-codebook-claim-gate.js'), 'utf8');
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes('execFile'));
  assert.ok(!source.includes('hf download'));
  assert.ok(!/localBytes\s*[:=]\s*[0-9]/.test(source));

  const llama = reviewQuantClaim({
    action: 'serve',
    modelId: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  });
  assert.strictEqual(llama.ok, true);
  assertNullMeasurements(llama);

  for (const modelId of [
    'e-means-qwen',
    'lookatmyquant/Qwen3.5-4B',
    'Qwen3.5-4B',
    'bonsai-2',
    'bonsai 2',
  ]) {
    const blocked = reviewQuantClaim({ action: 'serve', modelId });
    assert.strictEqual(blocked.ok, false, modelId);
    assert.ok(ids(blocked).includes('unmeasured_quant_route'), modelId);
    assertNullMeasurements(blocked);
  }

  const bareBonsai = reviewQuantClaim({ action: 'serve', modelId: 'bonsai' });
  assert.strictEqual(bareBonsai.ok, true);

  const planner = reviewQuantClaim({ action: 'serve', modelId: 'qwen2.5-coder:latest' });
  assert.strictEqual(planner.ok, true);
  assert.strictEqual(unmeasuredQuantRoute('qwen2.5-14b-16k:latest'), false);

  const install = reviewQuantClaim({ action: 'install', modelId: 'anything' });
  assert.ok(ids(install).includes('install_or_spend'));

  const recorded = reviewQuantClaim({
    action: 'record',
    note: '8.41 GB to 1.23 GB, 91.9%, 110 tk/s, 10x fewer epochs',
  });
  assert.ok(ids(recorded).includes('vendor_figure_as_local'));
  assertNullMeasurements(recorded);

  const cited = reviewQuantClaim({
    action: 'note',
    note: "The author's post is not a measurement we made: 8.41 GB to 1.23 GB, 91.9%, 110 tk/s, 10x fewer epochs.",
  });
  assert.strictEqual(cited.ok, true);
  assertNullMeasurements(cited);

  const uncited = reviewQuantClaim({
    action: 'note',
    note: 'We measured 1.23 GB and 110 tk/s.',
  });
  assert.ok(ids(uncited).includes('vendor_figure_as_local'));

  const req = buildVllmGuidedRequest({
    workerId: 'RevenueTruthWorker',
    systemPrompt: 'Follow the JSON contract.',
    sharedSchemaPrefix: 'Schema Contract: {"status":"PASS"}',
    userPrompt: 'pin check',
  });
  const quantPin = pinLiveClerkRequest(req, 'lookatmyquant/Qwen3.5-4B-e-means');
  assert.strictEqual(quantPin.applied, false);
  assert.strictEqual(quantPin.reason, 'unmeasured_quant_route');
  const livePin = pinLiveClerkRequest(req, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(livePin.applied, true);
  assert.strictEqual(livePin.model_id, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  const largePin = pinLiveClerkRequest(req, 'mlx-community/Some-30B-4bit');
  assert.strictEqual(largePin.applied, false);
  assert.strictEqual(largePin.reason, 'model_refused_too_large_for_this_mac');
  assert.strictEqual(clerkModelAllowed('mlx-community/Llama-3.2-1B-Instruct-4bit'), true);
  assert.strictEqual(clerkModelAllowed('qwen2.5-coder:latest'), true);

  const clear = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/quant-codebook-claim-gate.js'),
    '--action', 'serve',
    '--model', 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  ], { encoding: 'utf8' });
  assert.strictEqual(clear.status, 0);

  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/quant-codebook-claim-gate.js'),
    '--action', 'serve',
    '--model', 'Qwen3.5-4B-e-means',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);

  console.log('test-quant-codebook-claim-gate: PASS');
}

main();
