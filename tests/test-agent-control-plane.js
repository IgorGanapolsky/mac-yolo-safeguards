#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  claimCheck,
  evaluateE2e,
  scoreHealth,
  parseLockOwner,
  fileMentionedInLock,
  verify,
  pulse,
  readJsonl,
} = require('../tools/agent-control-plane');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('parseLockOwner extracts bold owner', () => {
  assert.strictEqual(
    parseLockOwner('`foo.ts` → **cursor-x** (T-1)'),
    'cursor-x',
  );
});

test('fileMentionedInLock matches backtick path', () => {
  const line = '- `tools/foo.js`, `plan.md` → **cursor** (T-1)';
  assert.strictEqual(fileMentionedInLock(line, 'tools/foo.js'), true);
  assert.strictEqual(fileMentionedInLock(line, 'tools/bar.js'), false);
});

test('claimCheck allows free files', () => {
  const result = claimCheck({ fileLocks: [] }, 'tools/new-tool.js', 'cursor-a');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.reason, 'free');
});

test('claimCheck blocks other agent ownership', () => {
  const locks = [
    '- `tools/foo.js`, `plan.md` → **gemini** (T-1) (2026-07-16)',
  ];
  const result = claimCheck({ fileLocks: locks }, 'tools/foo.js', 'cursor-a');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'owned-by-other');
  assert.deepStrictEqual(result.owners, ['gemini']);
});

test('claimCheck allows self ownership', () => {
  const locks = ['- `tools/foo.js` → **cursor-a** (T-1)'];
  const result = claimCheck({ fileLocks: locks }, 'tools/foo.js', 'cursor-a');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.reason, 'owned-by-self');
});

test('evaluateE2e treats skipped as not ship-ok', () => {
  const e = evaluateE2e({ e2e: 'skipped', unit: 'pass', updatedAt: '2026-07-16T00:00:00Z' });
  assert.strictEqual(e.shipClaimOk, false);
  assert.match(e.honestNote, /skipped/);
});

test('scoreHealth penalizes e2e fail and missing agents', () => {
  const health = scoreHealth({
    plan: { ok: true, activeTasks: [], fileLocks: [] },
    agents: [{ label: 'x', ok: false }],
    e2e: { e2e: 'fail', unit: 'pass', ageMs: 1000 },
  });
  assert.ok(health.score < 70);
  assert.ok(health.findings.some((f) => f.code === 'e2e-fail'));
  assert.ok(health.findings.some((f) => f.code === 'launchagent-down'));
});

test('live claim-check CLI exits 0 for free path', () => {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'tools', 'agent-control-plane.js');
  const free = path.join('tools', `free-probe-${Date.now()}.js`);
  const r = spawnSync(process.execPath, [script, 'claim-check', free, '--json'], {
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.strictEqual(body.allowed, true);
});

test('verify returns report with all gates', () => {
  const report = verify();
  assert.ok(report.ok === true || report.ok === false);
  assert.ok(Array.isArray(report.gates));
  const gateNames = report.gates.map((g) => g.name);
  assert.ok(gateNames.includes('codeql-pattern-gate'));
  assert.ok(gateNames.includes('cognitive-debt-scanner'));
  assert.ok(gateNames.includes('async-questions-pending'));
  assert.ok(gateNames.includes('task-checkpoints-active'));
  assert.ok(gateNames.includes('budget-guard'));

  // Blocking gates must have a 'passed' boolean
  const blocking = report.gates.filter((g) => g.blocking);
  for (const g of blocking) {
    assert.strictEqual(typeof g.passed, 'boolean');
  }

  // codeql gate must pass (our pre-flight check)
  const codeql = report.gates.find((g) => g.name === 'codeql-pattern-gate');
  assert.ok(codeql.passed, 'codeql-pattern-gate should pass');
  assert.strictEqual(codeql.findingCount, 0);
});

test('verify blocking gates determine overall ok', () => {
  const report = verify();
  const blocking = report.gates.filter((g) => g.blocking);
  const allBlockingPass = blocking.every((g) => g.passed);
  assert.strictEqual(report.ok, allBlockingPass);
});

test('pulse returns structured dashboard data', () => {
  const p = pulse();
  assert.ok(p.checkedAt);
  assert.ok(Array.isArray(p.plan.activeTasks));
  assert.ok(typeof p.plan.fileLockCount === 'number');
  assert.ok(typeof p.async.pending === 'number');
  assert.ok(typeof p.async.total === 'number');
  assert.ok(typeof p.checkpoints.active === 'number');
  assert.ok(Array.isArray(p.knowledge.recent));
  assert.ok(Array.isArray(p.agents));
  assert.ok(p.continuousE2e);
  assert.ok(typeof p.continuousE2e.e2e === 'string');
  assert.ok(typeof p.continuousE2e.shipClaimOk === 'boolean');
});

test('verify CLI exits 0 when all gates pass', () => {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'tools', 'agent-control-plane.js');
  const r = spawnSync(process.execPath, [script, 'verify', '--json'], {
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.ok(body.ok);
  assert.ok(body.gates.length >= 5);
});

test('pulse CLI exits 0 and returns JSON', () => {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'tools', 'agent-control-plane.js');
  const r = spawnSync(process.execPath, [script, 'pulse', '--json'], {
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.ok(body.checkedAt);
  assert.ok(body.plan);
  assert.ok(body.async);
  assert.ok(body.checkpoints);
  assert.ok(body.knowledge);
  assert.ok(body.agents);
  assert.ok(body.continuousE2e);
});

test('verify --json output has structured gates', () => {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'tools', 'agent-control-plane.js');
  const r = spawnSync(process.execPath, [script, 'verify', '--json'], {
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0);
  const body = JSON.parse(r.stdout);
  assert.ok(body.ok !== undefined);
  assert.ok(body.checkedAt);
  // Each gate has name, blocking, passed
  for (const g of body.gates) {
    assert.ok(g.name);
    assert.strictEqual(typeof g.blocking, 'boolean');
    assert.strictEqual(typeof g.passed, 'boolean');
  }
});

test('verify handles no unanswered questions correctly', () => {
  const report = verify();
  const qGate = report.gates.find((g) => g.name === 'async-questions-pending');
  assert.ok(qGate.passed, 'should have no pending questions in clean state');
  assert.ok(qGate.count !== undefined);
});

// Keep tmp clean if we ever write
test('tmp dir available', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-'));
  fs.rmSync(dir, { recursive: true, force: true });
});

if (process.exitCode) {
  console.error('\nagent-control-plane tests FAILED');
  process.exit(1);
}
console.log('\nagent-control-plane tests OK');
