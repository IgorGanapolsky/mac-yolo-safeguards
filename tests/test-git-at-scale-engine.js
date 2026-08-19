'use strict';

/**
 * Tests for Cursor Continuity client-side steal: git-at-scale-engine.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  runGit,
  getRepoRoot,
  runMaintenance,
  spawnWorktree,
  pruneWorktrees,
  checkTipConsistency,
  getScaleScorecard,
  hasMultiPackIndex,
  hasCommitGraph,
} = require('../tools/git-at-scale-engine');

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-at-scale-'));
  const r = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  r(['init', '-b', 'main']);
  r(['config', 'user.email', 'test@example.com']);
  r(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'one\n');
  r(['add', 'README.md']);
  r(['commit', '-m', 'init']);
  // second commit + pack pressure via loose objects is enough for maintenance
  fs.writeFileSync(path.join(dir, 'README.md'), 'two\n');
  r(['add', 'README.md']);
  r(['commit', '-m', 'two']);
  return dir;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

console.log('Testing git-at-scale-engine...');

// --- scorecard on real fixture ---
{
  const repo = mkTmpRepo();
  try {
    const card = getScaleScorecard(repo);
    assert.strictEqual(
      fs.realpathSync(card.repoRoot),
      fs.realpathSync(getRepoRoot(repo)),
    );
    assert.ok(typeof card.looseObjects === 'number');
    assert.ok(typeof card.packfiles === 'number');
    assert.ok(typeof card.packedObjects === 'number');
    assert.ok(Array.isArray(card.unhealthyReasons));
    assert.ok(card.activeWorktrees >= 1);
  } finally {
    rmrf(repo);
  }
}

// --- maintenance writes commit-graph + midx ---
{
  const repo = mkTmpRepo();
  try {
    // create an extra pack so midx is meaningful
    runGit(['repack', '-d'], repo);
    const beforeMidx = hasMultiPackIndex(repo);
    const maint = runMaintenance(repo, { geometric: false });
    assert.strictEqual(maint.commitGraphUpdated, true, 'commit-graph should update');
    assert.strictEqual(maint.multiPackIndexUpdated, true, 'midx should write');
    assert.strictEqual(hasCommitGraph(repo), true);
    assert.strictEqual(hasMultiPackIndex(repo), true);
    assert.ok(beforeMidx === false || hasMultiPackIndex(repo) === true);
    const card = getScaleScorecard(repo);
    assert.strictEqual(card.commitGraph, true);
    assert.strictEqual(card.multiPackIndex, true);
  } finally {
    rmrf(repo);
  }
}

// --- spawn + safe prune (only agent base, clean) ---
{
  const repo = mkTmpRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wt-base-'));
  try {
    const spawned = spawnWorktree('agent/ephemeral-feature', {
      repoRoot: repo,
      worktreeBase: base,
    });
    assert.strictEqual(spawned.success, true, spawned.error || 'spawn ok');
    assert.ok(fs.existsSync(spawned.path));

    // Outside-base worktree must NOT be pruned — create sibling outside base
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-wt-'));
    const outsideWt = path.join(outside, 'keep-me');
    const addOut = runGit(['worktree', 'add', '-b', 'agent/keep-outside', outsideWt, 'HEAD'], repo);
    assert.strictEqual(addOut.status, 0, addOut.stderr);

    const dry = pruneWorktrees({
      repoRoot: repo,
      worktreeBase: base,
      dryRun: true,
    });
    assert.ok(dry.prunedCount >= 1, 'dry-run should see agent-base wt');
    assert.ok(
      dry.skipped.some((s) => s.reason === 'outside-agent-base'),
      'outside base skipped',
    );

    const real = pruneWorktrees({ repoRoot: repo, worktreeBase: base });
    assert.ok(real.prunedCount >= 1);
    assert.ok(!fs.existsSync(spawned.path), 'agent-base worktree removed');
    assert.ok(fs.existsSync(outsideWt), 'outside worktree retained');

    // cleanup outside
    runGit(['worktree', 'remove', '--force', outsideWt], repo);
    rmrf(outside);
  } finally {
    rmrf(repo);
    rmrf(base);
  }
}

// --- dirty worktree is not pruned ---
{
  const repo = mkTmpRepo();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wt-dirty-'));
  try {
    const spawned = spawnWorktree('agent/dirty-lane', {
      repoRoot: repo,
      worktreeBase: base,
    });
    assert.strictEqual(spawned.success, true);
    fs.writeFileSync(path.join(spawned.path, 'dirt.txt'), 'nope');
    const res = pruneWorktrees({ repoRoot: repo, worktreeBase: base });
    assert.strictEqual(res.prunedCount, 0);
    assert.ok(res.skipped.some((s) => s.reason === 'dirty'));
    assert.ok(fs.existsSync(spawned.path));
  } finally {
    // force remove for cleanup
    const wts = runGit(['worktree', 'list', '--porcelain'], repo).stdout;
    for (const block of wts.split('\n\n')) {
      const m = block.match(/^worktree (.+)$/m);
      if (m && m[1] !== repo) runGit(['worktree', 'remove', '--force', m[1]], repo);
    }
    rmrf(repo);
    rmrf(base);
  }
}

// --- tip consistency on local-only repo (no origin) ---
{
  const repo = mkTmpRepo();
  try {
    const tip = checkTipConsistency({
      repoRoot: repo,
      branch: 'main',
      fetch: false,
    });
    assert.strictEqual(tip.branch, 'main');
    assert.ok(tip.localTip);
    // no origin/main → not consistent
    assert.strictEqual(tip.consistent, false);
    assert.strictEqual(tip.remoteTip, null);
  } finally {
    rmrf(repo);
  }
}

// --- tip consistency when origin matches ---
{
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'git-at-scale-bare-'));
  const bareRepo = path.join(bare, 'remote.git');
  const clone = path.join(bare, 'clone');
  try {
    spawnSync('git', ['init', '--bare', '-b', 'main', bareRepo], { encoding: 'utf8' });
    spawnSync('git', ['clone', bareRepo, clone], { encoding: 'utf8' });
    spawnSync('git', ['config', 'user.email', 't@e.com'], { cwd: clone, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.name', 'T'], { cwd: clone, encoding: 'utf8' });
    fs.writeFileSync(path.join(clone, 'f.txt'), 'x\n');
    spawnSync('git', ['add', 'f.txt'], { cwd: clone, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'c1'], { cwd: clone, encoding: 'utf8' });
    spawnSync('git', ['push', '-u', 'origin', 'main'], { cwd: clone, encoding: 'utf8' });

    const tip = checkTipConsistency({
      repoRoot: clone,
      branch: 'main',
      fetch: true,
    });
    assert.strictEqual(tip.consistent, true, JSON.stringify(tip));
    assert.strictEqual(tip.localTip, tip.remoteTip);
  } finally {
    rmrf(bare);
  }
}

console.log('✅ All test-git-at-scale-engine tests PASSED');
