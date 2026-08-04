'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeUsage,
  estimateCostUsd,
  enrichReceiptWithUsage,
  buildTurnTrace,
  writeTurnTrace,
  loadAcl,
  checkDocumentAccess,
  filterMatchesByAcl,
  validateStructured,
  runtimeFaithfulnessGate,
  scoreProductionPillars,
} = require('../tools/production-ops');

const ACL = loadAcl(path.join(__dirname, 'fixtures/production/document-acl.example.json'));

test('token usage normalizes and rejects negatives', () => {
  const ok = normalizeUsage({ promptTokens: 100, completionTokens: 50, cacheReadTokens: 20 });
  assert.equal(ok.ok, true);
  assert.equal(ok.usage.promptTokens, 100);
  assert.equal(ok.usage.totalTokens, 150);

  const bad = normalizeUsage({ promptTokens: -1 });
  assert.equal(bad.ok, false);
});

test('metered cost prefers cache discount', () => {
  const usage = normalizeUsage({ promptTokens: 1_000_000, completionTokens: 0, cacheReadTokens: 500_000 }).usage;
  const usd = estimateCostUsd(usage, { inputPer1M: 2, outputPer1M: 6, cacheReadPer1M: 0.5 });
  // 0.5M full @ $2 + 0.5M cache @ $0.5 = 1.0 + 0.25 = 1.25
  assert.ok(Math.abs(usd - 1.25) < 1e-6, `usd=${usd}`);
});

test('enrichReceiptWithUsage sets token_meter source', () => {
  const receipt = { schema: 'hermes-economic-router/receipt-v1', estimatedCostUsd: 0.035 };
  const enriched = enrichReceiptWithUsage(
    receipt,
    { promptTokens: 1000, completionTokens: 500, model: 'test' },
    { inputPer1M: 1, outputPer1M: 2 },
  );
  assert.equal(enriched.costSource, 'token_meter');
  assert.equal(enriched.usage.ok, true);
  assert.ok(enriched.meteredCostUsd > 0);
});

test('turn trace includes retrieval top scores and writes jsonl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-trace-'));
  const trace = buildTurnTrace({
    query: 'agent swarm harness',
    route: { id: 'local_fast' },
    retrieval: {
      backend: 'weighted-rrf',
      matches: [
        { path: 'tools/agent-swarm-harness.js', rrfScore: 0.02 },
        { path: 'docs/AGENT-SWARM-HARNESS.md', score: 0.01 },
      ],
      latencyMs: 15,
    },
    usage: { promptTokens: 10, completionTokens: 4 },
  });
  assert.equal(trace.ok, true);
  assert.equal(trace.retrieval.topScores.length, 2);
  const file = writeTurnTrace(trace, { dir });
  assert.ok(fs.existsSync(file));
  const line = fs.readFileSync(file, 'utf8').trim().split('\n').pop();
  assert.equal(JSON.parse(line).schema, 'hermes-rag-turn-trace/v1');
});

test('document ACL enforces allow/deny and principal isolation', () => {
  assert.equal(checkDocumentAccess('tools/production-ops.js', 'org:demo', ACL).allowed, true);
  assert.equal(checkDocumentAccess('tools/secrets/keys.env', 'org:demo', ACL).allowed, false);
  assert.equal(checkDocumentAccess('tools/production-ops.js', 'org:readonly', ACL).allowed, false);
  assert.equal(checkDocumentAccess('docs/HERMES-RETRIEVAL-HARNESS.md', 'org:readonly', ACL).allowed, true);

  const filtered = filterMatchesByAcl(
    [
      { path: 'tools/production-ops.js' },
      { path: 'tools/secrets/x' },
      { path: 'business_os/private' },
    ],
    'org:demo',
    ACL,
  );
  assert.equal(filtered.matches.length, 1);
  assert.equal(filtered.filtered, 2);
});

test('structured output validation fail-closed', () => {
  const schema = {
    type: 'object',
    required: ['ok', 'route'],
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      route: { type: 'string', minLength: 1 },
    },
  };
  assert.equal(validateStructured({ ok: true, route: 'local' }, schema).ok, true);
  assert.equal(validateStructured({ ok: true, route: 'local', extra: 1 }, schema).ok, false);
  assert.equal(validateStructured({ ok: 'yes' }, schema).ok, false);
});

test('runtime faithfulness rejects unsupported answers', () => {
  const bad = runtimeFaithfulnessGate(
    'Kubernetes GPU autoscaler with guaranteed uptime.',
    ['Continuity continues eligible work on a fenced VPS when offline.'],
    { query: 'What is Continuity?', minFaithfulness: 0.5, minGroundedness: 0.35 },
  );
  assert.equal(bad.pass, false);
  const good = runtimeFaithfulnessGate(
    'Continuity continues eligible work on a fenced VPS when offline.',
    ['Continuity continues eligible work on a fenced VPS when offline.'],
    { query: 'What is Continuity offline VPS?', minFaithfulness: 0.5, minGroundedness: 0.35 },
  );
  assert.equal(good.pass, true);
});

test('production scorecard awards A+ when all hard pillars green', () => {
  const report = scoreProductionPillars();
  assert.equal(report.hardFail, false, JSON.stringify(report.pillars.filter((p) => !p.ok)));
  assert.equal(report.grade, 'A+');
  assert.equal(report.aPlus, true);
  assert.equal(report.ok, true);
  assert.equal(report.pillars.length, 5);
});

test('ACL load failure fail-closed: dual-path finalize clears matches', () => {
  const { finalizeRetrieveResult } = require('../tools/retrieval-dual-path');
  const out = finalizeRetrieveResult(
    {
      query: 'x',
      matches: [{ path: 'tools/production-ops.js' }, { path: 'docs/a.md' }],
      fusion: 'test',
    },
    { acl: '/nonexistent/acl-policy.json', principal: 'org:demo', _startedAt: Date.now() },
  );
  assert.equal(out.matches.length, 0);
  assert.equal(out.acl.failClosed, true);
  assert.equal(out.acl.filtered, 2);
});

test('null meteredCostUsd does not coerce to free token_meter spend', () => {
  const { rowFromReceipt } = require('../tools/agent-cost-analyzer');
  const row = rowFromReceipt(
    {
      schema: 'hermes-economic-router/receipt-v1',
      selectedRoute: { model: 'grok-4.5' },
      meteredCostUsd: null,
      costSource: 'token_meter',
      effectiveCostUsd: null,
      createdAt: new Date().toISOString(),
    },
    'test.jsonl',
    0,
  );
  assert.ok(row);
  assert.equal(row.meteredCostUsd, null);
  assert.equal(row.costSource, 'route_ceiling');
});

test('pricing field aliases map to non-zero metered cost for Grok-style apiPricing', () => {
  const { enrichReceiptWithUsage } = require('../tools/production-ops');
  const enriched = enrichReceiptWithUsage(
    { estimatedCostUsd: 0.01, selectedRoute: { apiPricing: { inputPerMillionUsd: 2, outputPerMillionUsd: 6, cachedInputPerMillionUsd: 0.5 } } },
    { promptTokens: 1_000_000, completionTokens: 0, cacheReadTokens: 0 },
    {
      inputPer1M: 2,
      outputPer1M: 6,
      cacheReadPer1M: 0.5,
    },
  );
  assert.equal(enriched.costSource, 'token_meter');
  assert.ok(enriched.meteredCostUsd >= 1.9 && enriched.meteredCostUsd <= 2.1);
});
