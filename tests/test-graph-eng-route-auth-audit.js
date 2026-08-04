#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  runPipeline,
  nodePlanner,
  nodeWorker,
  nodeVerifier,
  PUBLIC_ALLOWLIST,
} = require('../tools/graph-eng-route-auth-audit.js');

console.log('=== graph-eng route auth audit ===\n');

// Planner selects route.ts files
const plan = nodePlanner('apps/hermes-control-plane/app/api', 5);
assert.ok(plan.totalFound >= 5, 'expected several API routes');
assert.strictEqual(plan.targets.length, 5);
assert.ok(plan.selected.every((r) => r.endsWith('route.ts')));
console.log('  planner ok', plan.totalFound, 'routes found');

// Full pipeline deterministic
const report = runPipeline({ max: 15, root: 'apps/hermes-control-plane/app/api' });
assert.strictEqual(report.schema, 'graph-eng/route-auth-audit-v1');
assert.strictEqual(report.graph.nodes.length, 5);
assert.ok(report.metrics.workers <= 15);
assert.ok(Array.isArray(report.confirmed));
assert.ok(report.humanGate);
assert.ok([0, 2].includes(report.humanGate.exitCode));
console.log('  pipeline ok', JSON.stringify(report.metrics));

// Verifier dual-witness: hash mismatch rejects
const fakeFinding = {
  route: 'apps/hermes-control-plane/app/api/health/route.ts',
  methods: ['GET'],
  authSignals: [],
  risk: 'high',
  notes: ['synthetic'],
  workerHash: 'deadbeefdeadbeef',
};
const mismatch = nodeVerifier(fakeFinding);
assert.strictEqual(mismatch.accepted, false);
assert.strictEqual(mismatch.reason, 'hash_mismatch_worker_stale');
console.log('  dual-witness hash mismatch ok');

// Health allowlist is not confirmable as high gap when re-scanned as high with wrong signals
const healthPath = path.join(
  path.resolve(__dirname, '..'),
  'apps/hermes-control-plane/app/api/health/route.ts',
);
assert.ok(fs.existsSync(healthPath));
const healthWorker = nodeWorker({
  path: healthPath,
  rel: 'apps/hermes-control-plane/app/api/health/route.ts',
});
// Health may be low risk due to allowlist path heuristics
assert.ok(PUBLIC_ALLOWLIST.has(healthWorker.route) || healthWorker.risk !== 'high'
  || healthWorker.notes.some((n) => /allowlist|public/i.test(n)));
console.log('  health route worker risk=', healthWorker.risk);

// CLI smoke
const { execFileSync } = require('child_process');
const tool = path.resolve(__dirname, '../tools/graph-eng-route-auth-audit.js');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-eng-'));
const outFile = path.join(outDir, 'report.json');
try {
  execFileSync(process.execPath, [tool, '--max=8', '--json', `--out=${outFile}`], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
  });
} catch (e) {
  // exit 2 is allowed when findings exist
  assert.ok(e.status === 2 || e.status === 0, `unexpected exit ${e.status}`);
}
assert.ok(fs.existsSync(outFile));
const cliReport = JSON.parse(fs.readFileSync(outFile, 'utf8'));
assert.strictEqual(cliReport.schema, 'graph-eng/route-auth-audit-v1');
fs.rmSync(outDir, { recursive: true, force: true });
console.log('  CLI smoke ok');

console.log('\n=== All graph-eng tests passed ===');
