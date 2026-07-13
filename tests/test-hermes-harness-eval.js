'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReport,
  compareProfiles,
  parseArgs,
  percentile,
  renderWiki,
  writeArtifacts,
} = require('../tools/hermes-harness-eval');

assert.strictEqual(parseArgs(['--since-hours', '24', '--json']).sinceHours, 24);
const comparisonArgs = parseArgs([
  '--baseline-profile', 'legacy-v1',
  '--candidate-profile', 'readonly-v2',
  '--holdout-case', 'heldout-tools',
  '--min-repeats', '3',
]);
assert.strictEqual(comparisonArgs.baselineProfile, 'legacy-v1');
assert.strictEqual(comparisonArgs.candidateProfile, 'readonly-v2');
assert.deepStrictEqual(comparisonArgs.holdoutCases, ['heldout-tools']);
assert.strictEqual(comparisonArgs.minRepeats, 3);
assert.throws(() => parseArgs(['--since-hours', '0']), /positive/);
assert.throws(() => parseArgs(['--baseline-profile', 'only-one']), /provided together/);
assert.throws(() => parseArgs(['--baseline-profile', 'same', '--candidate-profile', 'same']), /different/);
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
assert.strictEqual(report.profileComparison.status, 'not-requested');

function verifierTrace(caseId, profileId, status, offsetMinutes) {
  return {
    schema: 'hermes-grok45-harness/trace-v1',
    generatedAt: new Date(nowMs - offsetMinutes * 60 * 1000).toISOString(),
    caseId,
    profileId,
    model: 'grok-4.5',
    readiness: { status: 'ready_to_execute', blocker: null },
    execution: { status, exitCode: status === 'pass' ? 0 : 1, durationMs: 100 },
    overallStatus: status,
  };
}

const comparisonRecords = [];
for (let repeat = 0; repeat < 3; repeat += 1) {
  comparisonRecords.push(verifierTrace('dev-tools', 'legacy-v1', repeat === 0 ? 'pass' : 'fail', repeat + 1));
  comparisonRecords.push(verifierTrace('dev-tools', 'readonly-v2', 'pass', repeat + 4));
  comparisonRecords.push(verifierTrace('heldout-routing', 'legacy-v1', repeat < 2 ? 'pass' : 'fail', repeat + 7));
  comparisonRecords.push(verifierTrace('heldout-routing', 'readonly-v2', 'pass', repeat + 10));
}
const comparisonReport = buildReport({
  nowMs,
  sinceHours: 24,
  routeInput: { records: [], invalidLines: 0 },
  verifierInput: { records: comparisonRecords, invalidLines: 0 },
  baselineProfile: 'legacy-v1',
  candidateProfile: 'readonly-v2',
  holdoutCases: ['heldout-routing'],
  minRepeats: 3,
});
assert.strictEqual(comparisonReport.profileComparison.status, 'adopt');
assert.strictEqual(comparisonReport.profileComparison.gates.enoughRepeats, true);
assert.strictEqual(comparisonReport.profileComparison.gates.holdoutNoRegression, true);
assert.strictEqual(comparisonReport.gates.profilePromotionReady, true);
assert.strictEqual(comparisonReport.metrics.profileCounts['legacy-v1'], 6);
assert.strictEqual(comparisonReport.metrics.profileCounts['readonly-v2'], 6);

const regressedRecords = comparisonRecords.map((record) => record.caseId === 'heldout-routing'
  && record.profileId === 'readonly-v2'
  ? { ...record, overallStatus: 'fail', execution: { ...record.execution, status: 'fail', exitCode: 1 } }
  : record);
const rejected = compareProfiles(regressedRecords.map((record) => ({
  source: 'verifier',
  caseId: record.caseId,
  profileId: record.profileId,
  status: record.overallStatus,
})), {
  baselineProfile: 'legacy-v1',
  candidateProfile: 'readonly-v2',
  holdoutCases: ['heldout-routing'],
  minRepeats: 3,
});
assert.strictEqual(rejected.status, 'reject');
assert.strictEqual(rejected.gates.holdoutNoRegression, false);
const insufficient = compareProfiles(comparisonReport.profileComparison.perCase.flatMap(() => []), {
  baselineProfile: 'legacy-v1',
  candidateProfile: 'readonly-v2',
  holdoutCases: ['heldout-routing'],
  minRepeats: 3,
});
assert.strictEqual(insufficient.status, 'insufficient-data');

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

const exitOnlyFailure = buildReport({
  nowMs,
  sinceHours: 24,
  routeInput: {
    records: [{
      ...routeRecords[0],
      execution: { status: 'fail', exitCode: 1, durationMs: 123 },
    }],
    invalidLines: 0,
  },
  verifierInput: { records: [], invalidLines: 0 },
});
assert.strictEqual(exitOnlyFailure.metrics.failureClusters.route_fail_exit_1, 1);
assert.strictEqual(exitOnlyFailure.overallStatus, 'warn');

const wiki = renderWiki(report);
assert(wiki.includes('Ordinary `hermes-yolo` prompts route to Grok 4.5'));
assert(wiki.includes('Silent fallbacks: 0'));
assert(wiki.includes('Harness profile comparison'));
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
