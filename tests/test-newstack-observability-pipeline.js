'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  executePPL,
  evaluateAlertRules,
  getStandardFleetRules,
} = require('../tools/unified-alert-manager.js');

const {
  ConcurrentRetrievalGuard,
} = require('../tools/concurrent-retrieval-guard.js');

const {
  checkTier1Syntax,
  checkTier2HermeticTests,
  checkTier3VerifiableProof,
  checkTier4Governance,
  evaluateFullPipelineBarrier,
} = require('../tools/verified-pipeline-barrier.js');

// --- 1. PPL Unified Alert Manager Tests ---
test('executePPL correctly filters, groups, stats, and sorts cross-signal events', () => {
  const events = [
    { service: 'smart-ops', exitCode: 1, durationMs: 120 },
    { service: 'smart-ops', exitCode: 1, durationMs: 150 },
    { service: 'smart-ops', exitCode: 0, durationMs: 90 },
    { service: 'continuous-e2e', exitCode: 1, durationMs: 5000 },
    { service: 'continuous-e2e', exitCode: 1, durationMs: 6000 },
    { service: 'continuous-e2e', exitCode: 1, durationMs: 7000 },
  ];

  const pipeline = [
    { op: 'where', fn: e => e.exitCode === 1 },
    { op: 'stats', by: 'service', metrics: { totalDuration: items => items.reduce((acc, i) => acc + i.durationMs, 0) } },
    { op: 'where', fn: g => g.count >= 2 },
    { op: 'sort', field: 'count', order: 'desc' },
  ];

  const result = executePPL(events, pipeline);
  assert.equal(result.length, 2);
  assert.equal(result[0].service, 'continuous-e2e');
  assert.equal(result[0].count, 3);
  assert.equal(result[0].totalDuration, 18000);
  assert.equal(result[1].service, 'smart-ops');
  assert.equal(result[1].count, 2);
});

test('evaluateAlertRules enforces cooldown suppression window to kill alert fatigue', () => {
  const rules = [
    {
      id: 'test_crash_rule',
      name: 'Repeated Crashes',
      severity: 'P0',
      groupBy: 'service',
      cooldownMinutes: 15,
      pipeline: [
        { op: 'where', fn: e => e.exitCode !== 0 },
        { op: 'stats', by: 'service' },
        { op: 'where', fn: g => g.count >= 2 },
      ],
    },
  ];

  const events = [
    { service: 'smart-ops', exitCode: 1 },
    { service: 'smart-ops', exitCode: 1 },
  ];

  // First evaluation fires alert
  const eval1 = evaluateAlertRules(events, rules, {});
  assert.equal(eval1.alerts.length, 1);
  assert.equal(eval1.alerts[0].ruleId, 'test_crash_rule');
  assert.equal(eval1.alerts[0].target, 'smart-ops');

  // Immediate second evaluation is suppressed by 15m cooldown
  const eval2 = evaluateAlertRules(events, rules, eval1.state);
  assert.equal(eval2.alerts.length, 0); // Suppressed!
});

// --- 2. Concurrent Retrieval Guard Tests ---
test('ConcurrentRetrievalGuard coalesces concurrent identical queries (singleflight)', async () => {
  const guard = new ConcurrentRetrievalGuard({ ttlMs: 1000 });
  let underlyingCalls = 0;

  const mockFetcher = async (query) => {
    underlyingCalls += 1;
    await new Promise(r => setTimeout(r, 20)); // Simulated async RAG delay
    return [{ id: 'doc-1', text: `Result for ${query}` }];
  };

  // Launch 10 simultaneous identical queries
  const promises = Array.from({ length: 10 }, () =>
    guard.retrieve('how to handle spend guard', mockFetcher, { domain: 'lessons' })
  );

  const results = await Promise.all(promises);

  // Assert only 1 underlying execution happened
  assert.equal(underlyingCalls, 1);
  assert.equal(results.length, 10);
  assert.equal(results[0].results[0].id, 'doc-1');

  const metrics = guard.getMetrics();
  assert.equal(metrics.totalRequests, 10);
  assert.equal(metrics.coalescedHits, 9);
  assert.equal(metrics.underlyingExecutions, 1);
});

test('ConcurrentRetrievalGuard caches results in LRU cache', async () => {
  const guard = new ConcurrentRetrievalGuard({ ttlMs: 2000 });
  let calls = 0;
  const mockFetcher = async (query) => {
    calls += 1;
    return [{ text: query }];
  };

  const r1 = await guard.retrieve('query-A', mockFetcher);
  assert.equal(r1.source, 'fresh_fetch');
  assert.equal(calls, 1);

  const r2 = await guard.retrieve('query-A', mockFetcher);
  assert.equal(r2.source, 'cache_hit');
  assert.equal(calls, 1); // No new execution
});

// --- 3. Verified Pipeline Barrier Tests ---
test('evaluateFullPipelineBarrier passes on valid files, tests, receipts, and clean content', () => {
  const receipt = {
    taskId: 'T-NEWSTACK-20260819',
    timestamp: new Date().toISOString(),
    exitCode: 0,
  };

  const res = evaluateFullPipelineBarrier({
    files: ['package.json'],
    testCommands: ['node -v'],
    receipt,
    content: 'const safeCode = 123;',
  });

  assert.equal(res.passed, true);
  assert.equal(res.summary, 'ALL 4 VERIFICATION TIERS PASSED');
  assert.equal(res.tiers.tier1_syntax.passed, true);
  assert.equal(res.tiers.tier2_tests.passed, true);
  assert.equal(res.tiers.tier3_proof.passed, true);
  assert.equal(res.tiers.tier4_governance.passed, true);
});

test('evaluateFullPipelineBarrier catches governance violations (e.g. host mouse click or exposed tokens)', () => {
  const receipt = { taskId: 'T-1', timestamp: new Date().toISOString(), exitCode: 0 };
  const mockPat = ['g', 'h', 'p', '_123456789012345678901234567890123456'].join('');
  const res = evaluateFullPipelineBarrier({
    files: ['package.json'],
    testCommands: ['node -v'],
    receipt,
    content: `const dummyToken = "${mockPat}"; cliclick c:10,20;`,
  });

  assert.equal(res.passed, false);
  assert.equal(res.tiers.tier4_governance.passed, false);
  assert.ok(res.tiers.tier4_governance.errors.some(e => e.includes('Host Mouse Hijack')));
  assert.ok(res.tiers.tier4_governance.errors.some(e => e.includes('Exposed Raw Secret')));
});
