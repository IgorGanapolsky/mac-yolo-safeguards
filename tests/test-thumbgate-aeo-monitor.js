#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  HARD_MONTHLY_BUDGET_USD,
  PROVIDER_COST_PER_RUN_USD,
  analyzeVisibility,
  loadConfig,
  monthlySpend,
  runMonitor,
  visibilityDelta,
  writeReceipt,
} = require('../tools/thumbgate-aeo-monitor');

const config = loadConfig();
assert.strictEqual(config.queries.length, 3);
assert.strictEqual(config.monthlyBudgetUsd, HARD_MONTHLY_BUDGET_USD);

const results = [
  {
    url: 'https://thumbgate.app/',
    title: 'ThumbGate for Hermes',
    excerpts: ['Secure, private web control for Hermes agents.'],
  },
  {
    url: 'https://example.com/review',
    title: 'Agent control planes',
    excerpts: ['ThumbGate is a useful local-first option.'],
  },
  {
    url: 'https://example.net/other',
    title: 'Unrelated result',
    excerpts: ['No relevant brand mention.'],
  },
];
const metrics = analyzeVisibility(results, config);
assert.strictEqual(metrics.resultCount, 3);
assert.strictEqual(metrics.citationCount, 1);
assert.strictEqual(metrics.mentionCount, 2);
assert.strictEqual(metrics.citationShare, 0.3333);
assert.strictEqual(metrics.mentionShare, 0.6667);
assert.strictEqual(metrics.sentiment.positive, 2);
assert.strictEqual(metrics.status, 'present');

assert.deepStrictEqual(visibilityDelta(null, metrics), {
  baseline: true,
  citationChange: null,
  mentionChange: null,
  citationLoss: false,
});
assert.deepStrictEqual(visibilityDelta({ metrics: { citationCount: 2, mentionCount: 3 } }, metrics), {
  baseline: false,
  citationChange: -1,
  mentionChange: -1,
  citationLoss: true,
});

function technicalFetch(url) {
  const pathname = new URL(url).pathname;
  const bodies = {
    '/': '<script type="application/ld+json">FAQPage</script><h2>What is ThumbGate?</h2>',
    '/robots.txt': 'Disallow: /dashboard\nSitemap: https://thumbgate.app/sitemap.xml',
    '/sitemap.xml': '<loc>https://thumbgate.app/</loc>',
    '/llms.txt': '# ThumbGate for Hermes\nhttps://thumbgate.app/',
    '/.well-known/ai-catalog.json': '{"specVersion":"1.0"}',
  };
  return Promise.resolve({ ok: true, status: 200, text: async () => bodies[pathname] || '' });
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-aeo-test-'));
  const latest = path.join(temp, 'latest.json');
  const history = path.join(temp, 'history.jsonl');
  let providerCalls = 0;
  const receipt = await runMonitor({ execute: true, latest, history }, {
    config,
    now: '2026-07-22T12:00:00.000Z',
    fetchImpl: technicalFetch,
    buildSearchReceipt: async () => {
      providerCalls += 1;
      return {
        overallStatus: 'pass',
        pricing: { estimatedCostUsd: PROVIDER_COST_PER_RUN_USD },
        readiness: { blocker: null },
        execution: { attempted: true, status: 'pass', resultCount: results.length, durationMs: 120, transport: 'mock', results },
      };
    },
  });
  assert.strictEqual(providerCalls, 1);
  assert.strictEqual(receipt.overallStatus, 'pass');
  assert.strictEqual(receipt.technical.pass, true);
  assert.strictEqual(receipt.metrics.citationCount, 1);
  assert.strictEqual(receipt.cost.providerCostUsd, PROVIDER_COST_PER_RUN_USD);
  assert.strictEqual(receipt.cost.scheduledMaximumUsd, 0.005);
  assert.match(receipt.surface, /not direct Google AI Overview/);
  writeReceipt(receipt, latest, history);
  assert.strictEqual(fs.statSync(latest).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(history).mode & 0o777, 0o600);
  assert.strictEqual(monthlySpend(history, new Date('2026-07-22T12:01:00Z')), PROVIDER_COST_PER_RUN_USD);

  fs.writeFileSync(history, `${JSON.stringify({ generatedAt: '2026-07-22T12:00:00.000Z', cost: { providerCostUsd: HARD_MONTHLY_BUDGET_USD } })}\n`);
  const blocked = await runMonitor({ execute: true, latest, history }, {
    config,
    now: '2026-07-22T13:00:00.000Z',
    fetchImpl: technicalFetch,
    buildSearchReceipt: async () => {
      providerCalls += 1;
      throw new Error('provider must not be called after budget exhaustion');
    },
  });
  assert.strictEqual(blocked.overallStatus, 'blocked');
  assert.strictEqual(blocked.provider.blocker, 'monthly_budget_exhausted');
  assert.strictEqual(providerCalls, 1);

  fs.rmSync(temp, { recursive: true, force: true });
  console.log('ThumbGate AEO monitor tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
