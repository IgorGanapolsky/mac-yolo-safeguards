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
