#!/usr/bin/env node
'use strict';

/**
 * git-at-scale-engine.js
 *
 * Client-side steal from Cursor's "Git at any scale" / Continuity post (2026):
 * packfile proliferation hurts lookups; agents spawn many throwaway worktrees;
 * Git clients need a consistent tip view for CI.
 *
 * NOT a rebuild of Cursor Origin / WAL hosting. We stay on GitHub.
 *
 * 1) Maintenance: commit-graph + multi-pack-index (+ optional geometric repack)
 * 2) Safe cattle worktrees under an agent base (clean porcelain only)
 * 3) Tip consistency check vs origin (linearizable read view)
 * 4) Scorecard for pack/worktree health
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DEFAULT_AGENT_WORKTREE_BASE = path.join(os.tmpdir(), 'agent-git-worktrees');
const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'production', 'gh-pages']);

function runGit(args, cwd = process.cwd(), opts = {}) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: opts.timeoutMs || 0,
  });
  return {
    status: res.status === null ? 1 : res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    signal: res.signal || null,
  };
}

function getRepoRoot(cwd = process.cwd()) {
  const res = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (res.status !== 0 || !res.stdout) {
    throw new Error(`Not a git repository: ${cwd}`);
  }
  return res.stdout;
}

function parseCountObjects(repoRoot) {
  const res = runGit(['count-objects', '-v'], repoRoot);
  const out = {};
  if (res.status !== 0) return out;
  for (const line of res.stdout.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    const num = Number(raw);
    out[key] = Number.isFinite(num) && String(num) === raw ? num : raw;
  }
  return out;
}

function hasCommitGraph(repoRoot) {
  const gitDir = runGit(['rev-parse', '--git-dir'], repoRoot).stdout;
  if (!gitDir) return false;
  const abs = path.isAbsolute(gitDir) ? gitDir : path.join(repoRoot, gitDir);
  return (
    fs.existsSync(path.join(abs, 'objects', 'info', 'commit-graph')) ||
    fs.existsSync(path.join(abs, 'objects', 'info', 'commit-graphs'))
  );
}

function hasMultiPackIndex(repoRoot) {
  const gitDir = runGit(['rev-parse', '--git-dir'], repoRoot).stdout;
  if (!gitDir) return false;
  const abs = path.isAbsolute(gitDir) ? gitDir : path.join(repoRoot, gitDir);
  return (
    fs.existsSync(path.join(abs, 'objects', 'pack', 'multi-pack-index')) ||
    fs.existsSync(path.join(abs, 'objects', 'info', 'multi-pack-index'))
  );
}

/**
 * Maintenance: cheap indexes first; geometric repack optional (CPU-heavy).
 */
function runMaintenance(repoRoot = getRepoRoot(), options = {}) {
  const results = {
    commitGraphUpdated: false,
    multiPackIndexUpdated: false,
    geometricRepackDone: false,
    maintenanceAuto: false,
    errors: [],
  };

  const auto = runGit(['maintenance', 'run', '--auto'], repoRoot);
  results.maintenanceAuto = auto.status === 0;
  if (auto.status !== 0 && auto.stderr) results.errors.push(`maintenance: ${auto.stderr}`);

  const graph = runGit(
    ['commit-graph', 'write', '--reachable', '--changed-paths'],
    repoRoot,
  );
  results.commitGraphUpdated = graph.status === 0;
  if (graph.status !== 0 && graph.stderr) results.errors.push(`commit-graph: ${graph.stderr}`);

  // Prefer write --bitmap when available; fall back to plain write.
  let midx = runGit(['multi-pack-index', 'write', '--bitmap'], repoRoot);
  if (midx.status !== 0) {
    midx = runGit(['multi-pack-index', 'write'], repoRoot);
  }
  results.multiPackIndexUpdated = midx.status === 0;
  if (midx.status !== 0 && midx.stderr) results.errors.push(`multi-pack-index: ${midx.stderr}`);

  if (options.geometric) {
    const repack = runGit(['repack', '-d', '-l', '--geometric=2'], repoRoot, {
      timeoutMs: options.timeoutMs || 600000,
    });
    results.geometricRepackDone = repack.status === 0;
    if (repack.status !== 0) {
      results.errors.push(`geometric repack: ${repack.stderr || repack.signal || 'failed'}`);
    } else {
      // Rebuild midx after pack layout changes.
      const midx2 = runGit(['multi-pack-index', 'write'], repoRoot);
      if (midx2.status !== 0 && midx2.stderr) {
        results.errors.push(`multi-pack-index(after-repack): ${midx2.stderr}`);
      }
    }
  }

  return results;
}

function listWorktrees(repoRoot = getRepoRoot()) {
  const res = runGit(['worktree', 'list', '--porcelain'], repoRoot);
  if (res.status !== 0) return [];
  const worktrees = [];
  let current = {};
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) {
      if (current.worktree) worktrees.push(current);
      current = {};
      continue;
    }
    if (line.startsWith('worktree ')) current.worktree = line.slice(9);
    else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') current.bare = true;
    else if (line === 'detached') current.detached = true;
    else if (line === 'locked' || line.startsWith('locked ')) current.locked = true;
  }
  if (current.worktree) worktrees.push(current);
  return worktrees;
}

function spawnWorktree(branchName, options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot();
  const worktreeBase = options.worktreeBase || DEFAULT_AGENT_WORKTREE_BASE;
  fs.mkdirSync(worktreeBase, { recursive: true });

  const safeBranch = String(branchName).replace(/[^a-zA-Z0-9._/-]/g, '_');
  const dirName = safeBranch.replace(/\//g, '__');
  const targetDir = path.join(worktreeBase, dirName);

  if (fs.existsSync(targetDir)) {
    return { success: true, path: targetDir, branch: branchName, reused: true };
  }

  let add = runGit(['worktree', 'add', '-b', branchName, targetDir, 'HEAD'], repoRoot);
  if (add.status !== 0) {
    add = runGit(['worktree', 'add', targetDir, branchName], repoRoot);
    if (add.status !== 0) {
      return {
        success: false,
        error: add.stderr || 'worktree add failed',
        path: targetDir,
        branch: branchName,
      };
    }
  }
  return { success: true, path: targetDir, branch: branchName, reused: false };
}

function pathIsUnder(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * Containment: lexical under-base check first (no symlink follow), then
 * realpath must still stay under the resolved base (reject escapes).
 * Handles macOS /var ↔ /private/var aliasing on the base path.
 * Fixes Copilot "realpath before validate" note on #1844.
 */
function isUnderBase(wtPath, basePath) {
  const absBase = path.resolve(basePath);
  let realBase = absBase;
  try {
    if (fs.existsSync(absBase)) realBase = fs.realpathSync(absBase);
  } catch {
    realBase = absBase;
  }

  const absWt = path.resolve(wtPath);
  const lexicalOk = pathIsUnder(absWt, absBase) || pathIsUnder(absWt, realBase);
  if (!lexicalOk) return false;

  // Nothing on disk yet → no symlink to follow; lexical under-base is enough.
  if (!fs.existsSync(absWt)) return true;

  try {
    const realWt = fs.realpathSync(absWt);
    return pathIsUnder(realWt, realBase);
  } catch {
    return false;
  }
}

function isPorcelainClean(wtPath) {
  const st = runGit(['status', '--porcelain'], wtPath);
  return st.status === 0 && st.stdout === '';
}

/**
 * Safe prune: ONLY worktrees under agent base, unlocked, clean porcelain.
 * Never removes primary checkout or protected branch checkouts outside the base.
 */
function pruneWorktrees(options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot();
  const worktreeBase = options.worktreeBase || DEFAULT_AGENT_WORKTREE_BASE;
  const maxAgeHours = options.maxAgeHours != null ? Number(options.maxAgeHours) : null;
  const dryRun = Boolean(options.dryRun);
  const pruned = [];
  const skipped = [];

  if (!fs.existsSync(worktreeBase)) {
    return { prunedCount: 0, prunedPaths: [], skipped, dryRun, worktreeBase };
  }

  const primary = fs.realpathSync(repoRoot);
  const now = Date.now();

  for (const wt of listWorktrees(repoRoot)) {
    if (!wt.worktree) continue;
    let realWt;
    try {
      realWt = fs.existsSync(wt.worktree) ? fs.realpathSync(wt.worktree) : path.resolve(wt.worktree);
    } catch {
      skipped.push({ path: wt.worktree, reason: 'unreadable' });
      continue;
    }
    if (realWt === primary) {
      skipped.push({ path: wt.worktree, reason: 'primary' });
      continue;
    }
    if (wt.locked) {
      skipped.push({ path: wt.worktree, reason: 'locked' });
      continue;
    }
    if (!isUnderBase(wt.worktree, worktreeBase)) {
      skipped.push({ path: wt.worktree, reason: 'outside-agent-base' });
      continue;
    }
    if (wt.branch && PROTECTED_BRANCHES.has(wt.branch)) {
      skipped.push({ path: wt.worktree, reason: 'protected-branch' });
      continue;
    }
    if (!isPorcelainClean(wt.worktree)) {
      skipped.push({ path: wt.worktree, reason: 'dirty' });
      continue;
    }
    if (maxAgeHours != null && Number.isFinite(maxAgeHours)) {
      try {
        const mtime = fs.statSync(wt.worktree).mtimeMs;
        const ageH = (now - mtime) / 3600000;
        if (ageH < maxAgeHours) {
          skipped.push({ path: wt.worktree, reason: `younger-than-${maxAgeHours}h` });
          continue;
        }
      } catch {
        skipped.push({ path: wt.worktree, reason: 'mtime-unavailable' });
        continue;
      }
    }

    if (dryRun) {
      pruned.push(wt.worktree);
      continue;
    }
    const rm = runGit(['worktree', 'remove', '--force', wt.worktree], repoRoot);
    if (rm.status === 0) pruned.push(wt.worktree);
    else skipped.push({ path: wt.worktree, reason: rm.stderr || 'remove-failed' });
  }

  if (!dryRun) runGit(['worktree', 'prune'], repoRoot);

  return {
    prunedCount: pruned.length,
    prunedPaths: pruned,
    skipped,
    dryRun,
    worktreeBase,
  };
}

/**
 * Tip consistency: local tip must match origin/<branch> after an optional fetch.
 * Encodes "Git clients hate eventual consistency" without rebuilding hosting.
 */
function checkTipConsistency(options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot();
  const branch =
    options.branch ||
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot).stdout ||
    'main';
  const remote = options.remote || 'origin';
  const doFetch = options.fetch !== false;

  const before = runGit(['rev-parse', 'HEAD'], repoRoot).stdout;
  let fetch = { status: 0, stderr: '' };
  if (doFetch) {
    fetch = runGit(['fetch', remote, branch, '--quiet'], repoRoot, {
      timeoutMs: options.timeoutMs || 120000,
    });
  }
  const remoteTip = runGit(['rev-parse', `${remote}/${branch}`], repoRoot);
  const after = runGit(['rev-parse', 'HEAD'], repoRoot).stdout;
  const consistent =
    remoteTip.status === 0 && after && remoteTip.stdout && after === remoteTip.stdout;

  return {
    branch,
    remote,
    localTip: after || before,
    remoteTip: remoteTip.status === 0 ? remoteTip.stdout : null,
    fetched: doFetch && fetch.status === 0,
    fetchError: fetch.status === 0 ? null : fetch.stderr || 'fetch failed',
    consistent: Boolean(consistent),
    behind: remoteTip.status === 0 && after && remoteTip.stdout && after !== remoteTip.stdout,
  };
}

function getScaleScorecard(repoRoot = getRepoRoot()) {
  const objects = parseCountObjects(repoRoot);
  const worktrees = listWorktrees(repoRoot);
  const branchRes = runGit(['branch', '--list'], repoRoot);
  const localBranchCount =
    branchRes.status === 0 ? branchRes.stdout.split('\n').filter(Boolean).length : 0;

  const packs = Number(objects.packs) || 0;
  const loose = Number(objects.count) || 0;
  const commitGraph = hasCommitGraph(repoRoot);
  const midx = hasMultiPackIndex(repoRoot);

  const unhealthyReasons = [];
  if (loose >= 500) unhealthyReasons.push('loose-objects>=500');
  if (packs >= 40) unhealthyReasons.push('packs>=40');
  if (!commitGraph) unhealthyReasons.push('missing-commit-graph');
  if (packs >= 2 && !midx) unhealthyReasons.push('missing-multi-pack-index');
  if (worktrees.length >= 25) unhealthyReasons.push('worktrees>=25');

  return {
    timestamp: new Date().toISOString(),
    repoRoot,
    looseObjects: loose,
    looseSizeKb: Number(objects.size) || 0,
    packfiles: packs,
    packedObjects: Number(objects['in-pack']) || 0,
    packedSizeKb: Number(objects['size-pack']) || 0,
    garbageFiles: Number(objects.garbage) || 0,
    garbageSizeKb: Number(objects['size-garbage']) || 0,
    commitGraph,
    multiPackIndex: midx,
    activeWorktrees: worktrees.length,
    localBranches: localBranchCount,
    healthy: unhealthyReasons.length === 0,
    unhealthyReasons,
  };
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--scorecard';
  const jsonFlag = args.includes('--json');

  const emit = (obj) => {
    console.log(JSON.stringify(obj, null, jsonFlag || true ? 2 : 0));
  };

  try {
    const repoRoot = args.includes('--cwd')
      ? getRepoRoot(args[args.indexOf('--cwd') + 1])
      : getRepoRoot();

    if (command === '--maintenance' || command === '-m') {
      const geometric = args.includes('--geometric');
      emit({
        status: 'ok',
        maintenance: runMaintenance(repoRoot, { geometric }),
        scorecard: getScaleScorecard(repoRoot),
      });
    } else if (command === '--scorecard' || command === '-s') {
      emit(getScaleScorecard(repoRoot));
    } else if (command === '--spawn-worktree') {
      const branch = args[1];
      if (!branch || branch.startsWith('-')) {
        console.error('Error: branch name required for --spawn-worktree');
        process.exit(1);
      }
      const baseIdx = args.indexOf('--base');
      const worktreeBase =
        baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_AGENT_WORKTREE_BASE;
      emit(spawnWorktree(branch, { repoRoot, worktreeBase }));
    } else if (command === '--prune-worktrees') {
      const baseIdx = args.indexOf('--base');
      const ageIdx = args.indexOf('--max-age-hours');
      emit(
        pruneWorktrees({
          repoRoot,
          worktreeBase: baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_AGENT_WORKTREE_BASE,
          maxAgeHours: ageIdx >= 0 ? Number(args[ageIdx + 1]) : null,
          dryRun: args.includes('--dry-run'),
        }),
      );
    } else if (command === '--tip-consistency') {
      const branchIdx = args.indexOf('--branch');
      emit(
        checkTipConsistency({
          repoRoot,
          branch: branchIdx >= 0 ? args[branchIdx + 1] : undefined,
          fetch: !args.includes('--no-fetch'),
        }),
      );
    } else {
      console.log(`Git At Scale Engine (Cursor Continuity client steal)
Usage:
  node tools/git-at-scale-engine.js --scorecard
  node tools/git-at-scale-engine.js --maintenance [--geometric]
  node tools/git-at-scale-engine.js --spawn-worktree <branch> [--base DIR]
  node tools/git-at-scale-engine.js --prune-worktrees [--base DIR] [--max-age-hours N] [--dry-run]
  node tools/git-at-scale-engine.js --tip-consistency [--branch main] [--no-fetch]
`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  runGit,
  getRepoRoot,
  parseCountObjects,
  hasCommitGraph,
  hasMultiPackIndex,
  isUnderBase,
  runMaintenance,
  listWorktrees,
  spawnWorktree,
  pruneWorktrees,
  checkTipConsistency,
  getScaleScorecard,
  DEFAULT_AGENT_WORKTREE_BASE,
};

if (require.main === module) {
  main();
}
