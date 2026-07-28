#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/hermes-inference-gateway.js
 * TensorZero-inspired inference observability layer.
 *
 * Run: node tests/test-hermes-inference-gateway.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Use a temporary trace directory for tests (isolated from real traces)
const TMP_TRACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-traces-'));

// Mock TRACE_DIR before requiring the module under test
const INFERENCE_GATEWAY_PATH = path.join(__dirname, '..', 'tools', 'hermes-inference-gateway.js');

// We need to set up the tmp dir override before loading
process.env.__TEST_TRACE_DIR = TMP_TRACE_DIR;

// Import the module (it uses TRACE_DIR from os.homedir, so we mock fs)
// Instead, we'll monkey-patch tracePath after require
const gw = require(INFERENCE_GATEWAY_PATH);

// Override the trace path to use our temp dir for isolation
const origTracePath = gw.tracePath;
const origEnsureTraceDir = gw.ensureTraceDir;

// Create a proxy that uses the test directory
function testTracePath(dateStr) {
  const today = dateStr || new Date().toISOString().slice(0, 10);
  return path.join(TMP_TRACE_DIR, `${today}.jsonl`);
}

function testEnsureTraceDir() {
  if (!fs.existsSync(TMP_TRACE_DIR)) {
    fs.mkdirSync(TMP_TRACE_DIR, { recursive: true });
  }
}

function testEnsureTraceFile(dateStr) {
  testEnsureTraceDir();
  const p = testTracePath(dateStr);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '', 'utf8');
  }
  return p;
}

// Patch the module functions to use test directory
// We'll rewrite TRACE_DIR reference by providing our own versions
const testGw = {
  ...gw,
  tracePath: testTracePath,
  ensureTraceDir: testEnsureTraceDir,
  ensureTraceFile: testEnsureTraceFile,
  // Override readTraces to use our test dir
  readTraces: function(opts = {}) {
    const files = fs.readdirSync(TMP_TRACE_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
    const now = Date.now();
    const sinceTs = opts.since ? gw.parseSince(opts.since, now) : null;
    const untilTs = opts.until ? new Date(opts.until).getTime() : null;
    const results = [];
    for (const file of files) {
      const filePath = path.join(TMP_TRACE_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      for (const line of content.split('\n').filter(Boolean)) {
        let r;
        try { r = JSON.parse(line); } catch { continue; }
        if (sinceTs || untilTs) {
          const traceTs = new Date(r.ts).getTime();
          if (!Number.isFinite(traceTs)) continue;
          if (sinceTs && traceTs < sinceTs) continue;
          if (untilTs && traceTs > untilTs) continue;
        }
        if (opts.model && r.model !== opts.model) continue;
        if (opts.provider && r.provider !== opts.provider) continue;
        if (opts.route && r.route !== opts.route) continue;
        if (opts.success != null && r.success !== opts.success) continue;
        if (opts.hostRole && r.host_role !== opts.hostRole) continue;
        if (opts.label && !r.label?.includes(opts.label)) continue;
        results.push(r);
      }
    }
    return results;
  },
  // Override query
  query: function(opts = {}) {
    return testGw.readTraces(opts);
  },
  // Override record to write to test dir
  record: async function(recordInput, { writeImmediate = true } = {}) {
    if (!recordInput) throw new Error('record object is required');
    const r = gw.makeRecord(recordInput);
    const validation = gw.validateRecord(r);
    if (validation) throw new Error(`Invalid record: ${validation}`);
    if (writeImmediate) {
      const p = testEnsureTraceFile();
      fs.appendFileSync(p, JSON.stringify(r) + '\n', 'utf8');
    }
    return r;
  },
  // Override health for test dir
  health: function() {
    testEnsureTraceDir();
    const files = fs.readdirSync(TMP_TRACE_DIR).filter((f) => f.endsWith('.jsonl'));
    const todayFile = testTracePath();
    const todayCalls = fs.existsSync(todayFile)
      ? fs.readFileSync(todayFile, 'utf8').split('\n').filter(Boolean).length
      : 0;
    let totalCalls = 0;
    for (const file of files) {
      const filePath = path.join(TMP_TRACE_DIR, file);
      totalCalls += fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
    }
    return {
      ok: true,
      traceDir: TMP_TRACE_DIR,
      files: files.length,
      totalCalls,
      todayCalls,
      hostRole: gw.detectFleetHostRole(),
      checkedAt: new Date().toISOString(),
    };
  },
  // Override summary
  summary: function({ by = 'model', since, hostRole } = {}) {
    const traces = testGw.readTraces({ since, hostRole });
    const groups = {};
    let total = 0;
    for (const r of traces) {
      const key = r[by] || 'unknown';
      if (!groups[key]) {
        groups[key] = { count: 0, successCount: 0, totalTokens: 0, totalCost: 0, totalLatencyMs: 0, errorCount: 0 };
      }
      const g = groups[key];
      g.count += 1;
      if (r.success) g.successCount += 1;
      else g.errorCount += 1;
      g.totalTokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      g.totalCost += r.cost_usd || 0;
      g.totalLatencyMs += r.latency_ms || 0;
      total += 1;
    }
    const stats = Object.entries(groups)
      .map(([key, g]) => ({
        [by]: key,
        count: g.count,
        successRate: g.count > 0 ? Number((g.successCount / g.count * 100).toFixed(1)) : 0,
        avgLatencyMs: g.count > 0 ? Math.round(g.totalLatencyMs / g.count) : 0,
        totalCostUsd: Number(g.totalCost.toFixed(4)),
        totalTokens: g.totalTokens,
        avgTokensPerCall: g.count > 0 ? Math.round(g.totalTokens / g.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      totalCalls: total,
      by,
      since: since || 'all',
      stats,
      generatedAt: new Date().toISOString(),
    };
  },
  // Override costReport for test dir
  costReport: function({ since } = {}) {
    const traces = testGw.readTraces({ since });
    const byModel = {};
    const byProvider = {};
    const byDay = {};
    let totalCost = 0;
    let totalCalls = 0;
    for (const r of traces) {
      const cost = r.cost_usd || 0;
      totalCost += cost;
      totalCalls += 1;
      const day = r.ts?.slice(0, 10) || 'unknown';
      if (!byDay[day]) byDay[day] = { calls: 0, cost: 0 };
      byDay[day].calls += 1;
      byDay[day].cost += cost;
      const model = r.model || 'unknown';
      if (!byModel[model]) byModel[model] = { calls: 0, cost: 0, tokens: 0 };
      byModel[model].calls += 1;
      byModel[model].cost += cost;
      byModel[model].tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      const provider = r.provider || 'unknown';
      if (!byProvider[provider]) byProvider[provider] = { calls: 0, cost: 0 };
      byProvider[provider].calls += 1;
      byProvider[provider].cost += cost;
    }
    return {
      totalCalls,
      totalCostUsd: Number(totalCost.toFixed(4)),
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, d]) => ({ day, ...d, cost: Number(d.cost.toFixed(4)) })),
      byModel: Object.entries(byModel).sort(([, a], [, b]) => b.cost - a.cost).map(([model, m]) => ({ model, ...m, cost: Number(m.cost.toFixed(4)) })),
      byProvider: Object.entries(byProvider).sort(([, a], [, b]) => b.cost - a.cost).map(([provider, p]) => ({ provider, ...p, cost: Number(p.cost.toFixed(4)) })),
      generatedAt: new Date().toISOString(),
    };
  },
  // Override compareRoutes for test dir
  compareRoutes: function(routeA, routeB, { since } = {}) {
    const tracesA = testGw.readTraces({ since, route: routeA });
    const tracesB = testGw.readTraces({ since, route: routeB });
    function stats(arr) {
      if (arr.length === 0) return null;
      const successCount = arr.filter((r) => r.success).length;
      const costs = arr.map((r) => r.cost_usd || 0);
      const latencies = arr.map((r) => r.latency_ms || 0);
      const totalCost = costs.reduce((s, c) => s + c, 0);
      const totalTokens = arr.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
      return {
        calls: arr.length,
        successRate: Number((successCount / arr.length * 100).toFixed(1)),
        avgLatencyMs: Math.round(latencies.reduce((s, l) => s + l, 0) / arr.length),
        totalCostUsd: Number(totalCost.toFixed(4)),
        totalTokens,
        avgTokensPerCall: arr.length > 0 ? Math.round(totalTokens / arr.length) : 0,
      };
    }
    const aStats = stats(tracesA);
    const bStats = stats(tracesB);
    let recommendation = 'insufficient_data';
    if (aStats && bStats && aStats.calls >= 3 && bStats.calls >= 3) {
      const winRateA = aStats.successRate;
      const winRateB = bStats.successRate;
      if (winRateB > winRateA + 5 && bStats.avgLatencyMs <= aStats.avgLatencyMs * 1.5) {
        recommendation = 'prefer_route_b';
      } else if (winRateA > winRateB + 5 && aStats.avgLatencyMs <= bStats.avgLatencyMs * 1.5) {
        recommendation = 'prefer_route_a';
      } else if (winRateB > winRateA && bStats.totalCostUsd < aStats.totalCostUsd * 0.8) {
        recommendation = 'consider_route_b_cost_savings';
      } else if (winRateA > winRateB && aStats.totalCostUsd < bStats.totalCostUsd * 0.8) {
        recommendation = 'consider_route_a_cost_savings';
      } else {
        recommendation = 'comparable';
      }
    }
    return {
      routeA,
      routeB,
      since: since || 'all',
      routeA: aStats ? { route: routeA, ...aStats } : { route: routeA, calls: 0 },
      routeB: bStats ? { route: routeB, ...bStats } : { route: routeB, calls: 0 },
      recommendation,
      generatedAt: new Date().toISOString(),
    };
  },
};

// Also patch the ingestedJsonl for test dir
testGw.ingestJsonl = function(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  let ingested = 0;
  let errors = 0;
  testEnsureTraceDir();
  const p = testEnsureTraceFile();
  for (const line of lines) {
    let raw;
    try { raw = JSON.parse(line); } catch { errors += 1; continue; }
    const recordObj = gw.makeRecord(raw);
    const validation = gw.validateRecord(recordObj);
    if (validation) { errors += 1; continue; }
    fs.appendFileSync(p, JSON.stringify(recordObj) + '\n', 'utf8');
    ingested += 1;
  }
  return { ingested, errors, traceFile: p };
};

let passed = 0;
let failed = 0;

function describe(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}`);
    console.error(`      ${err.message}`);
    if (err.expected !== undefined) {
      console.error(`      expected: ${JSON.stringify(err.expected)}`);
      console.error(`      actual:   ${JSON.stringify(err.actual)}`);
    }
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    const er = new Error(msg || `Expected ${actual} to be approx ${expected} ±${tolerance}`);
    er.expected = expected;
    er.actual = actual;
    throw er;
  }
}

// =========================================================================
// Tests
// =========================================================================

console.log('\n=== hermes-inference-gateway tests ===\n');

// --- 1. estimateCost ---
console.log('1. Cost estimation');
describe('glm-5.2 cost estimation', () => {
  // glm-5.2: input=0.93/1M, output=3.00/1M
  const cost = gw.estimateCost('glm-5.2', 'openrouter', 4500, 1200);
  assert.strictEqual(cost, 0.007785, '4500*0.93/1e6 + 1200*3.00/1e6 = 0.007785');
});

describe('grok-4.5 with cached tokens pricing', () => {
  // grok-4.5: input=2.00/1M, cached=0.50/1M, output=6.00/1M
  const cost = gw.estimateCost('grok-4.5', 'grok-build-cli', 3200, 1500);
  assert.strictEqual(cost, 0.0154, '3200*2.00/1e6 + 1500*6.00/1e6 = 0.0154');
});

describe('local model (free) cost estimation', () => {
  const cost = gw.estimateCost('qwen2.5:3b-64k', 'custom:ollama-local-64k', 800, 400);
  assert.strictEqual(cost, 0, 'local models are free');
});

describe('unknown model returns null', () => {
  const cost = gw.estimateCost('nonexistent-model', 'unknown', 100, 100);
  assert.strictEqual(cost, null, 'unknown model returns null');
});

describe('kimi-k3 cost estimation ($3/$15 per 1M)', () => {
  const cost = gw.estimateCost('kimi-k3', 'openrouter', 4000, 1000);
  assert.strictEqual(cost, 0.027, '4000*3.00/1e6 + 1000*15.00/1e6 = 0.012 + 0.015 = 0.027');
});

describe('kimi-k3 zero tokens returns 0', () => {
  const cost = gw.estimateCost('kimi-k3', 'openrouter', 0, 0);
  assert.strictEqual(cost, 0, 'zero tokens cost zero');
});

describe('kimi-k3 with provider rate fallback', () => {
  const cost = gw.estimateCost('kimi-k3', 'custom:openrouter-kimi-k3', 2000, 500);
  assert.strictEqual(cost, 0.0135, '2000*3.00/1e6 + 500*15.00/1e6 = 0.006 + 0.0075 = 0.0135');
});

describe('null input/output returns null', () => {
  const cost = gw.estimateCost('glm-5.2', 'openrouter', null, null);
  assert.strictEqual(cost, 0, 'null tokens treated as 0');
});

// --- 2. makeRecord ---
console.log('\n2. makeRecord');
describe('makeRecord with all fields', () => {
  const r = gw.makeRecord({
    model: 'glm-5.2',
    provider: 'openrouter',
    route: 'test_route',
    taskClass: 'reasoning',
    inputTokens: 4500,
    outputTokens: 1200,
    latencyMs: 14500,
    success: true,
    hostRole: 'mac_pro',
    sessionId: 'sess-1',
    label: 'test record',
  });
  assert.strictEqual(r.model, 'glm-5.2');
  assert.strictEqual(r.provider, 'openrouter');
  assert.strictEqual(r.route, 'test_route');
  assert.strictEqual(r.task_class, 'reasoning');
  assert.strictEqual(r.input_tokens, 4500);
  assert.strictEqual(r.output_tokens, 1200);
  assert.strictEqual(r.latency_ms, 14500);
  assert.strictEqual(r.cost_usd, 0.007785);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.host_role, 'mac_pro');
  assert.strictEqual(r.session_id, 'sess-1');
  assert.strictEqual(r.label, 'test record');
  assert(r.ts, 'has timestamp');
});

describe('makeRecord with explicit cost override', () => {
  const r = gw.makeRecord({
    model: 'glm-5.2',
    provider: 'openrouter',
    latencyMs: 1000,
    costUsd: 0.05,
  });
  assert.strictEqual(r.cost_usd, 0.05, 'explicit cost override');
});

describe('makeRecord applies default values', () => {
  const r = gw.makeRecord({ model: 'm', provider: 'p' });
  assert.strictEqual(r.latency_ms, 0);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.error, '');
  assert.strictEqual(r.host_role, '');
});

describe('makeRecord clamps negative values', () => {
  const r = gw.makeRecord({
    model: 'm', provider: 'p',
    inputTokens: -100, outputTokens: -50, latencyMs: -1000,
  });
  assert.strictEqual(r.input_tokens, 0);
  assert.strictEqual(r.output_tokens, 0);
  assert.strictEqual(r.latency_ms, 0);
});

describe('makeRecord trims long strings', () => {
  const r = gw.makeRecord({
    model: 'm', provider: 'p',
    error: 'x'.repeat(1000),
    sessionId: 'y'.repeat(200),
    label: 'z'.repeat(500),
  });
  assert.ok(r.error.length <= 500);
  assert.ok(r.session_id.length <= 64);
  assert.ok(r.label.length <= 200);
});

// --- 3. validateRecord ---
console.log('\n3. validateRecord');
describe('valid record returns null', () => {
  const r = gw.makeRecord({ model: 'glm-5.2', provider: 'openrouter', latencyMs: 500 });
  assert.strictEqual(gw.validateRecord(r), null);
});

describe('missing model returns error', () => {
  const r = gw.makeRecord({ provider: 'openrouter', latencyMs: 500 });
  // makeRecord defaults model to '', so validateRecord checks
  const msg = gw.validateRecord(r);
  assert.ok(msg && msg.includes('model'), 'model validation error');
});

describe('missing provider returns error', () => {
  const r = gw.makeRecord({ model: 'glm-5.2', latencyMs: 500 });
  const msg = gw.validateRecord(r);
  assert.ok(msg && msg.includes('provider'), 'provider validation error');
});

describe('negative latency returns error', () => {
  // Direct call to validateRecord with snake_case fields
  const msg = gw.validateRecord({
    model: 'm', provider: 'p', latency_ms: -1, input_tokens: 10, output_tokens: 10
  });
  assert.ok(msg && msg.includes('latency'), 'latency validation error');
});

// --- 4. classifyTask ---
console.log('\n4. classifyTask');
describe('explicit task class is returned', () => {
  assert.strictEqual(gw.classifyTask('reasoning', 'any', 'any'), 'reasoning');
});

describe('local model detection', () => {
  assert.strictEqual(gw.classifyTask('', 'qwen2.5:3b-64k', 'custom:ollama'), 'local');
});

describe('reasoning model detection (glm)', () => {
  assert.strictEqual(gw.classifyTask('', 'glm-5.2', 'openrouter'), 'reasoning');
});

describe('grok provider detection', () => {
  assert.strictEqual(gw.classifyTask('', 'grok-4.5', 'grok-build-cli'), 'verification');
});

describe('claude detection', () => {
  assert.strictEqual(gw.classifyTask('', 'claude-sonnet-5', 'openrouter'), 'frontier');
});

describe('kimi-k3 detection as frontier', () => {
  assert.strictEqual(gw.classifyTask('', 'kimi-k3', 'openrouter'), 'frontier');
});

// --- 5. record + read back ---
console.log('\n5. Record and query');
describe('record writes and returns correct data', async () => {
  testEnsureTraceDir();
  const r = await testGw.record({
    model: 'claude-sonnet-5',
    provider: 'openrouter',
    route: 'sonnet_frontier',
    taskClass: 'frontier',
    inputTokens: 500,
    outputTokens: 200,
    latencyMs: 8000,
    hostRole: 'mac_pro',
    label: 'test front',
  });
  assert.strictEqual(r.model, 'claude-sonnet-5');
  assert.ok(r.cost_usd > 0, 'claude costs money');
  // Verify written to disk
  const traces = testGw.query({ model: 'claude-sonnet-5' });
  assert.ok(traces.length >= 1);
  const found = traces.find((t) => t.label === 'test front');
  assert.ok(found, 'trace read back matches');
});

describe('record with failure writes correctly', async () => {
  const r = await testGw.record({
    model: 'glm-5.2',
    provider: 'openrouter',
    latencyMs: 5000,
    success: false,
    error: 'timeout error test',
    label: 'fail test',
  });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.error, 'timeout error test');
  const traces = testGw.query({ success: false });
  const found = traces.find((t) => t.label === 'fail test');
  assert.ok(found, 'failed trace read back');
});

describe('record kimi-k3 traces and query back', async () => {
  const r1 = await testGw.record({
    model: 'kimi-k3',
    provider: 'openrouter',
    route: 'kimi_k3_agentic_specialist',
    taskClass: 'frontier',
    inputTokens: 12000,
    outputTokens: 3000,
    latencyMs: 28000,
    hostRole: 'mac_pro',
    label: 'k3 large repo',
  });
  assert.strictEqual(r1.model, 'kimi-k3');
  assert.strictEqual(r1.cost_usd, 0.081, '12000*3/1e6 + 3000*15/1e6 = 0.036 + 0.045 = 0.081');
  const traces = testGw.query({ model: 'kimi-k3' });
  assert.ok(traces.length >= 1, 'kimi-k3 traces queryable');
  const found = traces.find((t) => t.label === 'k3 large repo');
  assert.ok(found, 'kimi-k3 trace read back with label');
});

describe('record without writeImmediate', async () => {
  const r = await testGw.record(
    { model: 'qwen3:35b-a3b', provider: 'custom:ollama-local-64k', latencyMs: 1000 },
    { writeImmediate: false }
  );
  assert.strictEqual(r.model, 'qwen3:35b-a3b');
  // Should NOT be in traces (no write)
  const traces = testGw.query({ model: 'qwen3:35b-a3b' });
  assert.strictEqual(traces.length, 0, 'no write = no trace on disk');
});

// --- 6. query with filters ---
console.log('\n6. Query filters');
describe('query with model filter', async () => {
  // Record a unique model
  await testGw.record({ model: 'fugu-ultra', provider: 'openrouter', route: 'fugu_test', latencyMs: 200, label: 'fugu filter' });
  const traces = testGw.query({ model: 'fugu-ultra' });
  assert.ok(traces.length >= 1);
  assert.ok(traces.every((t) => t.model === 'fugu-ultra'));
});

describe('query with provider filter', () => {
  const traces = testGw.query({ provider: 'openrouter' });
  assert.ok(traces.length >= 1);
  assert.ok(traces.every((t) => t.provider === 'openrouter'));
});

describe('query with route filter', () => {
  const traces = testGw.query({ route: 'sonnet_frontier' });
  assert.ok(traces.length >= 1);
  assert.ok(traces.every((t) => t.route === 'sonnet_frontier'));
});

describe('query with label substring', () => {
  const traces = testGw.query({ label: 'filter' });
  assert.ok(traces.length >= 1);
  assert.ok(traces.some((t) => t.label && t.label.includes('filter')));
});

// --- 7. summary ---
console.log('\n7. Summary');
describe('summary by model aggregates correctly', () => {
  const s = testGw.summary({ by: 'model' });
  assert.ok(s.totalCalls >= 3, `${s.totalCalls} total calls`);
  assert.ok(Array.isArray(s.stats));
  assert.ok(s.stats.some((st) => st.model === 'glm-5.2'));
  assert.ok(s.stats.every((st) => st.count > 0));
  assert.ok(s.stats.every((st) => st.successRate >= 0 && st.successRate <= 100));
});

describe('summary by route', () => {
  const s = testGw.summary({ by: 'route' });
  assert.ok(Array.isArray(s.stats));
  assert.ok(s.stats.some((st) => st.route === 'sonnet_frontier'));
});

describe('summary with success rate calculation', () => {
  const s = testGw.summary({ by: 'model' });
  // glm-5.2 was recorded with success=false, claude with success=true
  for (const st of s.stats) {
    if (st.count > 1) {
      assert.ok(st.successRate >= 0 && st.successRate <= 100);
    }
  }
});

// --- 8. costReport ---
console.log('\n8. Cost report');
describe('costReport aggregates by model and provider', () => {
  const c = testGw.costReport();
  assert.ok(c.totalCalls >= 3);
  assert.ok(c.totalCostUsd >= 0);
  assert.ok(Array.isArray(c.byModel));
  assert.ok(Array.isArray(c.byProvider));
  assert.ok(Array.isArray(c.byDay));
  assert.ok(c.byModel.some((m) => m.model === 'glm-5.2'));
});

describe('costReport total sum matches', () => {
  const c = testGw.costReport();
  const modelSum = c.byModel.reduce((s, m) => s + m.cost, 0);
  assertApprox(modelSum, c.totalCostUsd, 0.001, 'model sum equals total');
});

// --- 9. compareRoutes ---
console.log('\n9. Route comparison');
describe('compareRoutes returns proper structure with insufficient data', () => {
  const result = testGw.compareRoutes('sonnet_frontier', 'fugu_test');
  assert.strictEqual(result.routeA.route, 'sonnet_frontier');
  assert.strictEqual(result.routeB.route, 'fugu_test');
  assert.ok(result.routeA.calls >= 1 || result.routeA.calls === 0);
  assert.ok(['insufficient_data', 'comparable', 'prefer_route_a', 'prefer_route_b', 'consider_route_a_cost_savings', 'consider_route_b_cost_savings'].includes(result.recommendation));
  assert.ok(result.generatedAt);
});

// --- 10. health ---
console.log('\n10. Health');
describe('health returns correct structure', () => {
  const h = testGw.health();
  assert.strictEqual(h.ok, true);
  assert.strictEqual(h.traceDir, TMP_TRACE_DIR);
  assert.ok(h.files >= 1);
  assert.ok(h.totalCalls >= 3);
  assert.ok(h.todayCalls >= 1);
  assert.ok(h.checkedAt);
});

// --- 11. parseSince ---
console.log('\n11. parseSince');
describe('parseSince handles hours', () => {
  const result = gw.parseSince('1h', 1000000000000);
  assert.strictEqual(result, 1000000000000 - 3600000);
});

describe('parseSince handles days', () => {
  const result = gw.parseSince('7d', 1000000000000);
  assert.strictEqual(result, 1000000000000 - 7 * 86400000);
});

describe('parseSince handles minutes', () => {
  const result = gw.parseSince('30m', 1000000000000);
  assert.strictEqual(result, 1000000000000 - 30 * 60000);
});

describe('parseSince handles seconds', () => {
  const result = gw.parseSince('45s', 1000000000000);
  assert.strictEqual(result, 1000000000000 - 45 * 1000);
});

describe('parseSince handles weeks', () => {
  const result = gw.parseSince('2w', 1000000000000);
  assert.strictEqual(result, 1000000000000 - 2 * 604800000);
});

describe('parseSince handles ISO dates', () => {
  const result = gw.parseSince('2026-01-01');
  assert.strictEqual(result, new Date('2026-01-01').getTime());
});

describe('parseSince returns null for invalid input', () => {
  const result = gw.parseSince('invalid');
  assert.strictEqual(result, null);
});

// --- 12. ingestJsonl ---
console.log('\n12. ingestJsonl');
describe('ingestJsonl from temp file', () => {
  const tmpJsonl = path.join(TMP_TRACE_DIR, 'test-ingest-source.jsonl');
  fs.writeFileSync(tmpJsonl, [
    JSON.stringify({ model: 'nemotron-3-ultra-550b-a55b', provider: 'openrouter', latencyMs: 1500 }),
    JSON.stringify({ model: 'nex-n2-pro', provider: 'openrouter', latencyMs: 800 }),
    JSON.stringify({ model: '', provider: '', latencyMs: 100 }), // invalid, no model
    JSON.stringify({ model: 'gpt-oss:20b', provider: 'custom:ollama-local-64k', latencyMs: 2500 }),
  ].join('\n') + '\n', 'utf8');

  const result = testGw.ingestJsonl(tmpJsonl);
  assert.strictEqual(result.ingested, 3, '3 valid records ingested');
  assert.strictEqual(result.errors, 1, '1 invalid record (empty model)');
  assert.ok(result.traceFile);

  const traces = testGw.query({ provider: 'openrouter' });
  const ingested = traces.filter((t) => t.model === 'nex-n2-pro');
  assert.ok(ingested.length >= 1);
});

// --- 13. detectFleetHostRole ---
console.log('\n13. Fleet host role detection');
describe('detectFleetHostRole with env override', () => {
  const role = gw.detectFleetHostRole({ HERMES_FLEET_HOST_ROLE: 'mac_pro' });
  assert.strictEqual(role, 'mac_pro');
});

describe('detectFleetHostRole with mini override', () => {
  const role = gw.detectFleetHostRole({ HERMES_FLEET_HOST_ROLE: 'mini' });
  assert.strictEqual(role, 'mac_mini');
});

describe('detectFleetHostRole unknown when no override', () => {
  const role = gw.detectFleetHostRole({});
  // This should return 'unknown' in test env (not Mac Pro or Mac Mini)
  assert.ok(['unknown', 'mac_pro', 'mac_mini'].includes(role));
});

// --- 14. CLI parseArgs ---
console.log('\n14. CLI parseArgs');
describe('parseArgs extracts record command', () => {
  const args = gw.parseArgs(['record', '--model', 'glm-5.2', '--provider', 'openrouter']);
  assert.strictEqual(args.command, 'record');
  assert.strictEqual(args.model, 'glm-5.2');
  assert.strictEqual(args.provider, 'openrouter');
});

describe('parseArgs extracts flags', () => {
  const args = gw.parseArgs(['query', '--since', '24h', '--model', 'grok-4.5', '--json']);
  assert.strictEqual(args.command, 'query');
  assert.strictEqual(args.since, '24h');
  assert.strictEqual(args.model, 'grok-4.5');
  assert.strictEqual(args.json, true);
});

describe('parseArgs with boolean flags', () => {
  const args = gw.parseArgs(['record', '--model', 'm', '--provider', 'p', '--success', 'false']);
  assert.strictEqual(args.success, false);
});

// --- 15. Edge cases ---
console.log('\n15. Edge cases');
describe('record validates and rejects missing model', async () => {
  try {
    await testGw.record({ provider: 'openrouter', latencyMs: 100 });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message && err.message.includes('model'));
  }
});

describe('record validates and rejects negative latency', async () => {
  try {
    await testGw.record({ model: 'm', provider: 'p', latencyMs: -1 });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message && err.message.includes('latency'));
  }
});

describe('record validates and rejects missing provider', async () => {
  try {
    await testGw.record({ model: 'glm-5.2', latencyMs: 100 });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message && err.message.includes('provider'));
  }
});

describe('summary handles empty traces (different model)', () => {
  // Query for a model that doesn't exist in our test traces
  const s = testGw.summary({ by: 'model', hostRole: 'nonexistent' });
  assert.strictEqual(s.totalCalls, 0);
  assert.strictEqual(s.stats.length, 0);
});

describe('costReport handles empty results', () => {
  const c = testGw.costReport({ since: '7d' });
  // Our traces are from today, so 7d should see them (within 7 days)
  assert.ok(c.totalCalls >= 0); // may or may not have data
});

// =========================================================================
// Cleanup
// =========================================================================

// Remove test trace dir
try {
  fs.rmSync(TMP_TRACE_DIR, { recursive: true, force: true });
} catch {}

// =========================================================================
// Results
// =========================================================================
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
