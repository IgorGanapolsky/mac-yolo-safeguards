'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');
const coordctl = require('../tools/coordctl');

const CLI = path.resolve(__dirname, '../tools/coordctl.js');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordctl-test-'));
  const repo = path.join(root, 'repo');
  const linked = path.join(root, 'linked');
  fs.mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'coordctl@example.invalid']);
  git(repo, ['config', 'user.name', 'Coordctl Test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'fixture\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'fixture']);
  git(repo, ['worktree', 'add', '-b', 'agent/linked', linked]);
  return { root, repo, linked, stateRoot: path.join(root, 'state') };
}

function run(cwd, args, stateRoot) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--state-root', stateRoot], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: result.stdout ? JSON.parse(result.stdout) : null };
}

function runAsync(cwd, args, stateRoot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args, '--state-root', stateRoot], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stderr, json: stdout ? JSON.parse(stdout) : null }));
  });
}

test('normalizes paths and rejects overlap including repository-root files', () => {
  assert.equal(coordctl.normalizeRepoPath('./tools/../tools/coordctl.js'), 'tools/coordctl.js');
  assert.equal(coordctl.pathsOverlap('tools', 'tools/coordctl.js'), true);
  assert.equal(coordctl.pathsOverlap('plan.md', 'plan.md'), true);
  assert.equal(coordctl.pathsOverlap('plan.md', 'docs/plan.md'), false);
  assert.throws(() => coordctl.normalizeRepoPath('../outside'));
  assert.throws(() => coordctl.normalizeRepoPath('/tmp/outside'));
});

test('default state root is shared by linked git worktrees', () => {
  const fx = fixture();
  assert.equal(coordctl.resolveStateRoot(fx.repo), coordctl.resolveStateRoot(fx.linked));
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('doctor and snapshot are read-only before initialization', () => {
  const fx = fixture();
  const missing = path.join(fx.root, 'missing-state');
  assert.deepEqual(coordctl.snapshot(missing), { initialized: false, schemaVersion: 1, revision: 0, claims: [] });
  assert.equal(coordctl.doctor(missing).initialized, false);
  assert.equal(fs.existsSync(missing), false);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('50 truly concurrent cross-process acquisitions have exactly one winner', async () => {
  const fx = fixture();
  const attempts = Array.from({ length: 50 }, (_, index) => runAsync(
    index % 2 ? fx.repo : fx.linked,
    ['claim', '--kind', 'source', '--path', 'src/shared.js', '--actor', `worker-${index}`, '--op-id', `race-${index}`, '--ttl', '30'],
    fx.stateRoot,
  ));
  const results = await Promise.all(attempts);
  const winners = results.filter((item) => item.status === 0 && item.json.accepted);
  const losers = results.filter((item) => item.status === 2 && item.json && !item.json.accepted);
  assert.equal(winners.length, 1, JSON.stringify(results));
  assert.equal(losers.length, 49, JSON.stringify(results));
  assert.equal(coordctl.snapshot(fx.stateRoot).claims.length, 1);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('duplicate operation ids are idempotent and payload reuse is rejected', () => {
  const fx = fixture();
  const args = ['claim', '--kind', 'source', '--path', 'src/idempotent.js', '--actor', 'same-agent', '--op-id', 'same-op', '--ttl', '30'];
  const first = run(fx.repo, args, fx.stateRoot);
  const second = run(fx.repo, args, fx.stateRoot);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(second.json.idempotentReplay, true);
  assert.equal(second.json.claim.claimId, first.json.claim.claimId);
  const changed = run(fx.repo, ['claim', '--kind', 'source', '--path', 'different.js', '--actor', 'same-agent', '--op-id', 'same-op', '--ttl', '30'], fx.stateRoot);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /reused with different payload/);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('stale source claims fail closed until owner release', async () => {
  const fx = fixture();
  const first = run(fx.repo, ['claim', '--kind', 'source', '--path', 'src/source.js', '--actor', 'owner', '--op-id', 'source-1', '--ttl', '0.02'], fx.stateRoot);
  assert.equal(first.status, 0);
  await new Promise((resolve) => setTimeout(resolve, 35));
  const blocked = run(fx.linked, ['claim', '--kind', 'source', '--path', 'src/source.js', '--actor', 'other', '--op-id', 'source-2', '--ttl', '30'], fx.stateRoot);
  assert.equal(blocked.status, 2);
  assert.equal(blocked.json.reason, 'source_stale_requires_release');
  const released = run(fx.repo, ['release', '--claim-id', first.json.claim.claimId, '--actor', 'owner', '--op-id', 'source-release'], fx.stateRoot);
  assert.equal(released.status, 0);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('stale singleton claims permit atomic takeover', async () => {
  const fx = fixture();
  const first = run(fx.repo, ['claim', '--kind', 'singleton', '--path', 'runtime/indexer', '--actor', 'old', '--op-id', 'singleton-1', '--ttl', '0.02'], fx.stateRoot);
  assert.equal(first.status, 0);
  await new Promise((resolve) => setTimeout(resolve, 35));
  const takeover = run(fx.linked, ['claim', '--kind', 'singleton', '--path', 'runtime/indexer', '--actor', 'new', '--op-id', 'singleton-2', '--ttl', '30'], fx.stateRoot);
  assert.equal(takeover.status, 0, takeover.stderr);
  assert.equal(takeover.json.accepted, true);
  assert.equal(takeover.json.claim.actor, 'new');
  assert.equal(coordctl.snapshot(fx.stateRoot).claims.length, 1);
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('signed receipt binds repo, branch, actor, paths and revision and covers root files', () => {
  const fx = fixture();
  const context = coordctl.repoContext(fx.repo);
  const first = run(fx.repo, ['claim', '--kind', 'source', '--path', 'plan.md', '--path', 'tools', '--actor', 'receipt-agent', '--op-id', 'receipt-op', '--ttl', '30'], fx.stateRoot);
  assert.equal(first.status, 0, first.stderr);
  const verified = coordctl.verifyReceipt(fx.stateRoot, first.json.receipt, { repoId: context.repoId, branch: 'main', actor: 'receipt-agent' });
  assert.equal(verified.ok, true);
  assert.equal(Number.isInteger(first.json.receipt.payload.revision), true);
  assert.equal(coordctl.receiptCovers(first.json.receipt, ['plan.md', 'tools/coordctl.js']).ok, true);
  assert.deepEqual(coordctl.receiptCovers(first.json.receipt, ['README.md']), { ok: false, uncovered: ['README.md'] });
  const tampered = structuredClone(first.json.receipt);
  tampered.payload.actor = 'attacker';
  assert.equal(coordctl.verifyReceipt(fx.stateRoot, tampered).ok, false);
  assert.equal(coordctl.verifyReceipt(fx.stateRoot, first.json.receipt, { branch: 'wrong' }).reason, 'branch_mismatch');
  fs.rmSync(fx.root, { recursive: true, force: true });
});

test('renew and release require the owning actor and are idempotent', () => {
  const fx = fixture();
  const first = run(fx.repo, ['claim', '--kind', 'source', '--path', 'src/lifecycle.js', '--actor', 'owner', '--op-id', 'life-claim', '--ttl', '30'], fx.stateRoot);
  const denied = run(fx.repo, ['renew', '--claim-id', first.json.claim.claimId, '--actor', 'intruder', '--op-id', 'life-bad-renew', '--ttl', '30'], fx.stateRoot);
  assert.equal(denied.status, 2);
  const renewed = run(fx.repo, ['renew', '--claim-id', first.json.claim.claimId, '--actor', 'owner', '--op-id', 'life-renew', '--ttl', '60'], fx.stateRoot);
  assert.equal(renewed.status, 0);
  const released = run(fx.repo, ['release', '--claim-id', first.json.claim.claimId, '--actor', 'owner', '--op-id', 'life-release'], fx.stateRoot);
  const replay = run(fx.repo, ['release', '--claim-id', first.json.claim.claimId, '--actor', 'owner', '--op-id', 'life-release'], fx.stateRoot);
  assert.equal(released.status, 0);
  assert.equal(replay.status, 0);
  assert.equal(replay.json.idempotentReplay, true);
  assert.equal(coordctl.snapshot(fx.stateRoot).claims.length, 0);
  fs.rmSync(fx.root, { recursive: true, force: true });
});
