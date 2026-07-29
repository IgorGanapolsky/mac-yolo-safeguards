#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createCheckpoint,
  loadCheckpoint,
  summarizeCheckpoints,
  validateCheckpoint,
  verifyCheckpoint,
} = require('../tools/hermes-harness-checkpoint');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  assert.strictEqual(result.status, 0, result.stderr);
  return (result.stdout || '').trim();
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-checkpoint-repo-'));
  run('git', ['init', '-q'], repo);
  run('git', ['config', 'user.email', 'checkpoint@example.invalid'], repo);
  run('git', ['config', 'user.name', 'Checkpoint Test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  fs.mkdirSync(path.join(repo, 'artifacts', 'hermes-loop-state'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'artifacts', 'hermes-loop-state', 'latest.json'),
    '{"schema":"hermes-loop-state/v1","ready":true}\n',
  );
  fs.mkdirSync(path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json'),
    '{"e2e":"pass","unit":"pass"}\n',
  );
  run('git', ['add', '.'], repo);
  run('git', ['commit', '-qm', 'fixture'], repo);
  return repo;
}

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

test('create writes an immutable mode-0600 checkpoint with no prompt or diff content', () => {
  const repo = makeRepo();
  const outDir = path.join(repo, '.checkpoint-receipts');
  const result = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-CHECKPOINT',
    now: '2026-07-29T20:10:00.000Z',
  });
  const saved = loadCheckpoint(result.artifacts.checkpointPath);
  assert.strictEqual(saved.lineage.rootId, saved.id);
  assert.strictEqual(saved.lineage.parentId, null);
  assert.strictEqual(saved.lineage.generation, 0);
  assert.strictEqual(validateCheckpoint(saved).ok, true);
  assert.strictEqual(fs.statSync(result.artifacts.checkpointPath).mode & 0o777, 0o600);
  const serialized = JSON.stringify(saved);
  assert(!serialized.includes('# fixture'));
  assert(!serialized.includes('README.md'));
  assert(!serialized.includes('prompt'));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('fork preserves root lineage and increments generation without copying source', () => {
  const repo = makeRepo();
  const outDir = path.join(repo, '.checkpoint-receipts');
  const root = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-ROOT',
    now: '2026-07-29T20:11:00.000Z',
  });
  const fork = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-FORK',
    parentPath: root.artifacts.checkpointPath,
    now: '2026-07-29T20:12:00.000Z',
  });
  assert.strictEqual(fork.checkpoint.lineage.rootId, root.checkpoint.id);
  assert.strictEqual(fork.checkpoint.lineage.parentId, root.checkpoint.id);
  assert.strictEqual(fork.checkpoint.lineage.generation, 1);
  assert.strictEqual(fork.checkpoint.policy.sourceTreeCopy, false);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('verify is green before drift and red after proof mutation', () => {
  const repo = makeRepo();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-checkpoint-receipts-'));
  const created = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-VERIFY',
    now: '2026-07-29T20:13:00.000Z',
  });
  assert.strictEqual(verifyCheckpoint({
    checkpointPath: created.artifacts.checkpointPath,
    repo,
  }).ok, true);
  fs.writeFileSync(
    path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json'),
    '{"e2e":"fail","unit":"pass"}\n',
  );
  const drifted = verifyCheckpoint({
    checkpointPath: created.artifacts.checkpointPath,
    repo,
  });
  assert.strictEqual(drifted.ok, false);
  assert(drifted.drift.includes('repo.dirty'));
  assert(drifted.drift.includes('artifacts.mobileProof'));
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('tampering is detected before resume state is trusted', () => {
  const repo = makeRepo();
  const outDir = path.join(repo, '.checkpoint-receipts');
  const created = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-TAMPER',
    now: '2026-07-29T20:14:00.000Z',
  });
  const tampered = loadCheckpoint(created.artifacts.checkpointPath);
  tampered.snapshot.repo.head = '0'.repeat(40);
  fs.writeFileSync(created.artifacts.checkpointPath, `${JSON.stringify(tampered, null, 2)}\n`);
  const verification = verifyCheckpoint({
    checkpointPath: created.artifacts.checkpointPath,
    repo,
  });
  assert.strictEqual(verification.ok, false);
  assert.strictEqual(verification.integrity.ok, false);
  assert.deepStrictEqual(verification.drift, ['integrity']);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('summary reports fork depth and P50/P95/P99 state-operation latency', () => {
  const repo = makeRepo();
  const outDir = path.join(repo, '.checkpoint-receipts');
  const root = createCheckpoint({
    repo,
    outDir,
    taskId: 'T-SUMMARY-ROOT',
    now: '2026-07-29T20:15:00.000Z',
  });
  createCheckpoint({
    repo,
    outDir,
    taskId: 'T-SUMMARY-FORK',
    parentPath: root.artifacts.checkpointPath,
    now: '2026-07-29T20:16:00.000Z',
  });
  const summary = summarizeCheckpoints(outDir);
  assert.strictEqual(summary.count, 2);
  assert.strictEqual(summary.valid, 2);
  assert.strictEqual(summary.invalid, 0);
  assert.strictEqual(summary.maxGeneration, 1);
  assert(Number.isFinite(summary.createDurationMs.p50));
  assert(Number.isFinite(summary.createDurationMs.p95));
  assert(Number.isFinite(summary.createDurationMs.p99));
  fs.writeFileSync(path.join(outDir, 'cp_corrupt.json'), '{not-json');
  const corrupted = summarizeCheckpoints(outDir);
  assert.strictEqual(corrupted.count, 3);
  assert.strictEqual(corrupted.valid, 2);
  assert.strictEqual(corrupted.invalid, 1);
  fs.rmSync(repo, { recursive: true, force: true });
});
