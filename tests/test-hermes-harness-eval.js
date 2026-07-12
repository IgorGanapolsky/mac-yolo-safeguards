'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReport,
  parseArgs,
  percentile,
  renderWiki,
  writeArtifacts,
} = require('../tools/hermes-harness-eval');

assert.strictEqual(parseArgs(['--since-hours', '24', '--json']).sinceHours, 24);
assert.throws(() => parseArgs(['--since-hours', '0']), /positive/);
assert.deepStrictEqual([percentile([100, 20, 50], 0.5), percentile([100, 20, 50], 0.95)], [50, 100]);

const nowMs = Date.parse('2026-07-12T12:00:00.000Z');
const routeRecords = [
  {
    schema: 'hermes-yolo/route-receipt-v1', generatedAt: '2026-07-12T11:00:00.000Z',
    route: { selectedBackend: 'grok-4.5', model: 'grok-4.5', reason: 'default-prompt-route', silentFallback: false, qwenSelected: false, qwenExplicit: false },
    execution: { status: 'pass', exitCode: 0, durationMs: 100 },
  },
  {
    schema: 'hermes-yolo/route-receipt-v1', generatedAt: '2026-07-12T11:10:00.000Z',
    route: { selectedBackend: 'grok-4.5', model: 'grok-4.5', reason: 'default-prompt-route', silentFallback: false, qwenSelected: false, qwenExplicit: false },
    execution: { status: 'pass', exitCode: 0, durationMs: 200 },
  },
  {
    schema: 'hermes-yolo/route-receipt-v1', generatedAt: '2026-07-12T11:20:00.000Z',
    route: { selectedBackend: 'hermes-legacy', model: 'qwen3:8b-64k', reason: 'hermes-admin-command', silentFallback: false, qwenSelected: true, qwenExplicit: true },
    execution: { status: 'pass', exitCode: 0, durationMs: 50 },
  },
];
const verifierRecords = [{
  schema: 'hermes-grok45-harness/trace-v1', generatedAt: '2026-07-12T11:30:00.000Z', model: 'grok-4.5',
  readiness: { status: 'ready_to_execute', blocker: null },
  execution: { status: 'pass', exitCode: 0, durationMs: 300 }, overallStatus: 'pass',
}];

const report = buildReport({
  nowMs,
  sinceHours: 24,
  routeInput: { records: routeRecords, invalidLines: 0 },
  verifierInput: { records: verifierRecords, invalidLines: 0 },
});
assert.strictEqual(report.overallStatus, 'pass');
assert.strictEqual(report.score, 100);
assert.strictEqual(report.metrics.totalRuns, 4);
assert.strictEqual(report.metrics.routeRuns, 3);
assert.strictEqual(report.metrics.verifierRuns, 1);
assert.strictEqual(report.metrics.silentFallbackCount, 0);
assert.strictEqual(report.metrics.qwenRunCount, 1);
assert.strictEqual(report.metrics.unexplainedQwenCount, 0);
assert.strictEqual(report.metrics.durationMs.p50, 100);
assert.strictEqual(report.metrics.durationMs.p95, 300);
assert.strictEqual(report.gates.enoughSamples, true);

const badReport = buildReport({
  nowMs,
  sinceHours: 24,
  routeInput: {
    records: [{
      ...routeRecords[0],
      route: { ...routeRecords[0].route, selectedBackend: 'hermes-legacy', model: 'qwen3:8b-64k', silentFallback: true, qwenSelected: true, qwenExplicit: false },
    }],
    invalidLines: 0,
  },
  verifierInput: { records: [], invalidLines: 0 },
});
assert.strictEqual(badReport.overallStatus, 'fail');
assert.strictEqual(badReport.metrics.silentFallbackCount, 1);
assert.strictEqual(badReport.metrics.unexplainedQwenCount, 1);

const wiki = renderWiki(report);
assert(wiki.includes('Ordinary `hermes-yolo` prompts route to Grok 4.5'));
assert(wiki.includes('Silent fallbacks: 0'));
assert(!wiki.includes('private prompt'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-harness-eval-test-'));
const out = path.join(temp, 'eval.json');
const wikiOut = path.join(temp, 'wiki.md');
writeArtifacts(report, { out, wikiOut });
assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).schema, 'hermes-harness-eval/v1');
assert(fs.readFileSync(wikiOut, 'utf8').includes('Score: 100/100'));
assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(wikiOut).mode & 0o777, 0o600);
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes harness eval tests: PASS');
