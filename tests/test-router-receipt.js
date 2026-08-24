'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyTier,
  isCheapCascade,
  isTogetherPreserve,
  isSilentSubstitution,
  isNoDeployments,
  receiptFrom,
  summarizeReceipts,
  gateFails,
  filterSinceHours,
} = require('../tools/router-receipt.js');

test('together glm-5.3 rewrite is preserve, not cheap cascade', () => {
  const rec = {
    model: 'zai-org/GLM-5.2',
    model_group: 'together-glm',
    api_base: 'https://api.together.xyz/v1',
    status: 'success',
    total_tokens: 40,
    latency_s: 0.75,
    response_cost: 0,
  };
  assert.equal(classifyTier(rec), 'per_token');
  assert.equal(isTogetherPreserve(rec), true);
  assert.equal(isCheapCascade(rec), false);
  assert.equal(isSilentSubstitution(rec), false);
});

test('glm-5.3 asked, served together via api_base, still preserve', () => {
  const rec = {
    model: 'zai-org/GLM-5.2',
    model_group: 'glm-5.3',
    api_base: 'https://api.together.xyz/v1',
    status: 'success',
  };
  assert.equal(isTogetherPreserve(rec), true);
  assert.equal(isCheapCascade(rec), false);
});

test('glm-5.3 served nemotron free is cheap-cascade quality risk', () => {
  const rec = {
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    model_group: 'glm-5.3',
    api_base: 'https://openrouter.ai/api/v1/chat/completions',
    status: 'success',
  };
  assert.equal(classifyTier(rec), 'free');
  assert.equal(isCheapCascade(rec), true);
  assert.equal(isSilentSubstitution(rec), true);
});

test('no deployments error is the desktop 429 class', () => {
  const rec = {
    model: 'glm-5.3',
    model_group: 'glm-5.3',
    api_base: '',
    status: 'failure',
    error:
      'No deployments available for selected model, Try again in 45 seconds. Passed model=glm-5.3.',
  };
  assert.equal(isNoDeployments(rec), true);
  assert.equal(receiptFrom(rec).no_deployments, true);
});

test('summarize proposes keep_in_group_failover on empty group, never auto-apply', () => {
  const rows = [
    {
      model: 'glm-5.3',
      model_group: 'glm-5.3',
      api_base: '',
      status: 'failure',
      error: 'No deployments available for selected model',
    },
  ];
  const s = summarizeReceipts(rows);
  assert.equal(s.totals.no_deployments, 1);
  const crit = s.proposals.find((p) => p.kind === 'streaming_empty_group');
  assert.ok(crit);
  assert.equal(crit.apply, false);
  assert.equal(gateFails(s), true);
});

test('cheap cascade without together is a high proposal, not a cost win', () => {
  const rows = [
    {
      model: 'qwen2.5:3b-64k',
      model_group: 'glm-coding',
      api_base: 'http://127.0.0.1:11434/api/generate',
      status: 'success',
    },
  ];
  const s = summarizeReceipts(rows);
  assert.equal(s.totals.cheap_cascade, 1);
  const p = s.proposals.find((x) => x.kind === 'cheap_cascade_quality_risk');
  assert.ok(p);
  assert.equal(p.apply, false);
  assert.equal(gateFails(s), false, 'cheap cascade is high, not critical empty-group');
});

test('malformed rows are counted, not treated as success', () => {
  const s = summarizeReceipts([null, {}, { model: 'x', status: 'success' }]);
  assert.equal(s.malformed, 2);
  assert.equal(s.totals.n, 1);
});

test('--since-hours drops historical empty-group so current health can pass', () => {
  const now = new Date('2026-08-24T22:00:00Z');
  const rows = [
    {
      model: 'glm-5.3',
      model_group: 'glm-5.3',
      status: 'failure',
      error: 'No deployments available for selected model',
      ts_end: '2026-08-23T21:00:00Z',
    },
    {
      model: 'zai-org/GLM-5.2',
      model_group: 'together-glm',
      api_base: 'https://api.together.xyz/v1',
      status: 'success',
      ts_end: '2026-08-24T21:50:00Z',
    },
  ];
  assert.equal(gateFails(summarizeReceipts(rows)), true);
  const windowed = filterSinceHours(rows, 2, now);
  assert.equal(windowed.droppedOld, 1);
  const s = summarizeReceipts(windowed.records);
  assert.equal(s.totals.n, 1);
  assert.equal(s.totals.no_deployments, 0);
  assert.equal(s.totals.together_preserve, 1);
  assert.equal(gateFails(s), false);
});
