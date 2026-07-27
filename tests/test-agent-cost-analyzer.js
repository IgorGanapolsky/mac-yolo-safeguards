#!/usr/bin/env node
'use strict';

/**
 * Focused unit tests for tools/agent-cost-analyzer.js.
 * Pattern mirrors tests/test-agent-swarm-harness.js: plain `test()` harness with assert,
 * exercises the pure exported functions against fixture data, no live receipts required.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  readReceipts,
  rollupByModel,
  countFinishedAC,
  buildReport,
  formatHuman,
  DEFAULT_COST_MODEL,
} = require('../tools/agent-cost-analyzer');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${e.message}`);
    if (e.stack) console.error(e.stack.split('\n').slice(1, 3).join('\n'));
  }
}

function mkdtempFixture(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

// --- parseArgs -------------------------------------------------------------

test('parseArgs: defaults', () => {
  const a = parseArgs([]);
  assert.strictEqual(a.json, false);
  assert.strictEqual(a.validate, false);
  assert.strictEqual(a.sinceHours, 0);
  assert.ok(a.planPath.endsWith('plan.md'));
  assert.ok(a.receiptsRoot.includes('receipts'));
});

test('parseArgs: --json and --validate', () => {
  const a = parseArgs(['--json', '--validate']);
  assert.strictEqual(a.json, true);
  assert.strictEqual(a.validate, true);
});

test('parseArgs: --since-hours 24', () => {
  const a = parseArgs(['--since-hours', '24']);
  assert.strictEqual(a.sinceHours, 24);
});

test('parseArgs: --since-hours rejects non-positive', () => {
  assert.throws(() => parseArgs(['--since-hours', '0']), /positive number/);
  assert.throws(() => parseArgs(['--since-hours', 'abc']), /positive number/);
});

test('parseArgs: --help', () => {
  assert.strictEqual(parseArgs(['--help']).help, true);
  assert.strictEqual(parseArgs(['-h']).help, true);
});

test('parseArgs: unknown arg throws', () => {
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
});

test('parseArgs: --plan and --receipts resolve paths', () => {
  const a = parseArgs(['--plan', './foo/plan.md', '--receipts', '/tmp/rc']);
  assert.ok(a.planPath.endsWith('plan.md'));
  assert.ok(a.receiptsRoot.endsWith('rc'));
});

// --- readReceipts ----------------------------------------------------------

test('readReceipts: missing root returns empty + no errors', () => {
  const { rows, errors, scannedFiles } = readReceipts('/nope/does/not/exist', 0);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(scannedFiles, 0);
});

test('readReceipts: parses valid history.jsonl', () => {
  const dir = mkdtempFixture('aca-rc-');
  fs.mkdirpSync ? null : null;
  fs.mkdirSync(path.join(dir, 'hermes-yolo'), { recursive: true });
  const rec = {
    schema: 'hermes-yolo/route-receipt-v1',
    generatedAt: new Date().toISOString(),
    host: 'mac',
    route: { model: 'grok-4.5', selectedBackend: 'grok-4.5', requestedBackend: 'grok' },
    execution: { status: 'pass', exitCode: 0, durationMs: 1000 },
  };
  fs.writeFileSync(path.join(dir, 'hermes-yolo', 'history.jsonl'), JSON.stringify(rec) + '\n');
  const { rows, errors, scannedFiles } = readReceipts(dir, 0);
  assert.strictEqual(scannedFiles, 1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].model, 'grok-4.5');
  assert.strictEqual(rows[0].durationMs, 1000);
  assert.strictEqual(rows[0].status, 'pass');
  assert.strictEqual(errors.length, 0);
});

test('readReceipts: malformed line goes to errors, not rows', () => {
  const dir = mkdtempFixture('aca-bad-');
  fs.mkdirSync(path.join(dir, 'r'), { recursive: true });
  const file = path.join(dir, 'r', 'history.jsonl');
  fs.writeFileSync(file, '{not json\n\n{"schema":"x/route-receipt","route":{"model":"a"},"execution":{"durationMs":5}}\n');
  const { rows, errors } = readReceipts(dir, 0);
  assert.strictEqual(rows.length, 1); // only the valid line
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].reason, /json parse/);
  assert.strictEqual(errors[0].line, 1);
});

test('readReceipts: non-route receipts (no route object) are skipped', () => {
  const dir = mkdtempFixture('aca-skip-');
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  const file = path.join(dir, 'meta', 'history.jsonl');
  // outcome/zero-spend schemas have no `route` object → skipped under the route-presence filter
  fs.writeFileSync(file, '{"schema":"outcome-v1","execution":{"durationMs":1}}\n{"schema":"hermes-zero-spend/receipt-v1","policy":"blocked"}\n');
  const { rows } = readReceipts(dir, 0);
  assert.strictEqual(rows.length, 0);
});

test('readReceipts: --since-hours cutoff filters old receipts', () => {
  const dir = mkdtempFixture('aca-since-');
  fs.mkdirSync(path.join(dir, 'r'), { recursive: true });
  const old = {
    schema: 'r/route-receipt-v1',
    generatedAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    route: { model: 'grok-4.5' },
    execution: { durationMs: 100, status: 'pass' },
  };
  const recent = {
    schema: 'r/route-receipt-v1',
    generatedAt: new Date().toISOString(),
    route: { model: 'glm-coding' },
    execution: { durationMs: 200, status: 'pass' },
  };
  fs.writeFileSync(
    path.join(dir, 'r', 'history.jsonl'),
    JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n',
  );
  const { rows } = readReceipts(dir, 24);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].model, 'glm-coding');
});

// --- rollupByModel ---------------------------------------------------------

test('rollupByModel: aggregates counts and latency percentiles', () => {
  const rows = [
    { model: 'grok-4.5', durationMs: 100, status: 'pass' },
    { model: 'grok-4.5', durationMs: 200, status: 'pass' },
    { model: 'grok-4.5', durationMs: 300, status: 'fail' },
    { model: 'glm-coding', durationMs: 50, status: 'pass' },
  ];
  const out = rollupByModel(rows, DEFAULT_COST_MODEL);
  assert.strictEqual(out.length, 2);
  const grok = out.find((b) => b.model === 'grok-4.5');
  assert.ok(grok);
  assert.strictEqual(grok.invocations, 3);
  assert.strictEqual(grok.pass, 2);
  assert.strictEqual(grok.fail, 1);
  assert.strictEqual(grok.latencyMs.avg, 200);
  assert.strictEqual(grok.latencyMs.max, 300);
  assert.strictEqual(grok.successRate, +(2 / 3).toFixed(4));
  // sorted by invocations desc → grok first
  assert.strictEqual(out[0].model, 'grok-4.5');
});

test('rollupByModel: applies cost model per invocation', () => {
  const rows = [
    { model: 'qwen3:8b', durationMs: 10, status: 'pass' },
    { model: 'qwen3:8b', durationMs: 20, status: 'pass' },
  ];
  const out = rollupByModel(rows, DEFAULT_COST_MODEL);
  assert.strictEqual(out[0].invocations, 2);
  assert.strictEqual(out[0].estCostUsd, +(0.035 * 2).toFixed(4));
});

test('rollupByModel: empty rows → empty array', () => {
  assert.strictEqual(rollupByModel([], DEFAULT_COST_MODEL).length, 0);
});

test('rollupByModel: missing durationMs does not corrupt percentiles', () => {
  const rows = [
    { model: 'x', durationMs: null, status: 'pass' },
    { model: 'x', durationMs: 100, status: 'pass' },
  ];
  const out = rollupByModel(rows, DEFAULT_COST_MODEL);
  assert.strictEqual(out[0].invocations, 2);
  assert.strictEqual(out[0].latencyMs.avg, 100);
  assert.strictEqual(out[0].latencyMs.max, 100);
});

// --- countFinishedAC -------------------------------------------------------

const SAMPLE_PLAN = `# plan.md

## 1. Task Board

| Task ID | Description | Status | Owner |
|---|---|---|---|
| T-FOO-1 | do foo | done | alice |
| T-FOO-2 | do bar | in_progress | bob |
| T-FOO-3 | do baz | blocked | carol |
| T-FOO-4 | done long ago (released) | done | dave |
`;

test('countFinishedAC: counts done rows only', () => {
  const dir = mkdtempFixture('aca-plan-');
  const p = path.join(dir, 'plan.md');
  fs.writeFileSync(p, SAMPLE_PLAN);
  const ac = countFinishedAC(p);
  assert.strictEqual(ac.count, 2); // T-FOO-1 done + T-FOO-4 done
  assert.strictEqual(ac.inProgress, 1);
  assert.strictEqual(ac.blocked, 1);
});

test('countFinishedAC: missing plan returns error', () => {
  const ac = countFinishedAC('/nope/missing-plan.md');
  assert.strictEqual(ac.count, 0);
  assert.ok(ac.error);
});

// --- buildReport (integration) --------------------------------------------

test('buildReport: joins receipts + plan AC into AC-per-$', () => {
  const rcDir = mkdtempFixture('aca-rep-rc-');
  const planDir = mkdtempFixture('aca-rep-plan-');
  fs.mkdirSync(path.join(rcDir, 'runner'), { recursive: true });
  const rec1 = {
    schema: 'hermes-yolo/route-receipt-v1',
    generatedAt: new Date().toISOString(),
    route: { model: 'grok-4.5' },
    execution: { durationMs: 1000, status: 'pass' },
  };
  const rec2 = {
    schema: 'hermes-yolo/route-receipt-v1',
    generatedAt: new Date().toISOString(),
    route: { model: 'qwen3:8b' },
    execution: { durationMs: 500, status: 'pass' },
  };
  fs.writeFileSync(
    path.join(rcDir, 'runner', 'history.jsonl'),
    JSON.stringify(rec1) + '\n' + JSON.stringify(rec2) + '\n',
  );
  fs.writeFileSync(
    path.join(planDir, 'plan.md'),
    '| T-A-1 | a | done | x |\n| T-A-2 | b | done | y |\n',
  );
  const report = buildReport({
    receiptsRoot: rcDir,
    planPath: path.join(planDir, 'plan.md'),
    sinceHours: 0,
    json: false,
    validate: false,
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.fleet.totalInvocations, 2);
  assert.strictEqual(report.finishedAC.count, 2);
  // one paid route (qwen3:8b @ 0.035) → totalCost = 0.035
  assert.strictEqual(report.fleet.totalCostUsd, +0.035.toFixed(4));
  assert.strictEqual(report.productivity.finishedAcPerDollar, +(2 / 0.035).toFixed(2));
});

test('buildReport: zero spend yields null AC-per-$ with free-fleet note', () => {
  const rcDir = mkdtempFixture('aca-free-');
  const planDir = mkdtempFixture('aca-free-plan-');
  fs.mkdirSync(path.join(rcDir, 'r'), { recursive: true });
  fs.writeFileSync(
    path.join(rcDir, 'r', 'history.jsonl'),
    JSON.stringify({
      schema: 'r/route-receipt-v1',
      generatedAt: new Date().toISOString(),
      route: { model: 'grok-4.5' },
      execution: { durationMs: 100, status: 'pass' },
    }) + '\n',
  );
  fs.writeFileSync(path.join(planDir, 'plan.md'), '| T-A | a | done | x |\n');
  const report = buildReport({
    receiptsRoot: rcDir,
    planPath: path.join(planDir, 'plan.md'),
    sinceHours: 0,
  });
  assert.strictEqual(report.fleet.totalCostUsd, 0);
  assert.strictEqual(report.productivity.finishedAcPerDollar, null);
  assert.match(report.productivity.note, /effectively free/i);
});

// --- formatHuman -----------------------------------------------------------

test('formatHuman: renders header + model row', () => {
  const report = {
    ok: true,
    checkedAt: '2026-07-24T00:00:00.000Z',
    sinceHours: null,
    sources: { receiptsRoot: '/tmp', scannedFiles: 1, planPath: '/tmp/plan.md' },
    fleet: {
      totalInvocations: 2,
      totalCostUsd: 0.035,
      avgLatencyMs: 750,
      totalWallClockMs: 1500,
      receiptErrors: 0,
    },
    finishedAC: { count: 2, inProgress: 0, blocked: 0 },
    productivity: { finishedAcPerDollar: 57.14, note: 'x' },
    byModel: [
      {
        model: 'grok-4.5',
        invocations: 2,
        pass: 2,
        fail: 0,
        other: 0,
        successRate: 1,
        latencyMs: { avg: 750, p50: 750, p95: 750, max: 750 },
        estCostUsd: 0,
      },
    ],
    receiptErrors: [],
  };
  const out = formatHuman(report);
  assert.match(out, /Agent cost analyzer/);
  assert.match(out, /grok-4\.5/);
  assert.match(out, /AC per \$:/);
});

// --- summary ---------------------------------------------------------------

console.log('');
if (failed > 0) {
  console.error(`\nFAIL: ${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
} else {
  console.log(`\nPASS: ${passed} test(s) passed, 0 failed.`);
  process.exit(0);
}
