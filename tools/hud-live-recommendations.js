#!/usr/bin/env node
'use strict';

/**
 * Live done/open state for the Mac Health disk recommendations.
 * The menu-bar card used to keep two fixed sentences ("sweep waste", "remove
 * CleanMyMac 5 (454 MB)") after that work was already finished. This module
 * reads the same places Clean AI Waste and Uninstall Apps act on, and returns
 * a checked sentence when nothing is left.
 *
 * Measurement stays shallow: top-level idle folders, not a full disk walk.
 * A folder modified in the last 24 hours counts as a live session, matching
 * tools/mac-yolo-disk-guard.js, and is not reported as waste.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const IDLE_MS = 24 * 60 * 60 * 1000;
const NOISE_BYTES = 1024 * 1024;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBytes(n) {
  const v = Math.max(0, num(n));
  const gib = 1024 * 1024 * 1024;
  const mib = 1024 * 1024;
  if (v >= gib) {
    const text = (v / gib).toFixed(2);
    return `${text.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} GB`;
  }
  if (v >= mib) {
    const mb = v / mib;
    const text = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(/\.0$/, '');
    return `${text} MB`;
  }
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${Math.round(v)} B`;
}

function duBytes(target, timeoutMs) {
  if (!target || !fs.existsSync(target)) return { bytes: 0, known: true };
  const r = spawnSync('du', ['-sk', target], { encoding: 'utf8', timeout: timeoutMs });
  if (r.status === 0 && r.stdout) {
    const kb = parseInt(String(r.stdout).trim().split(/\s+/)[0], 10);
    if (Number.isFinite(kb)) return { bytes: kb * 1024, known: true };
  }
  return { bytes: 0, known: false };
}

function listNames(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return null;
  }
}

/**
 * Stale Claude scratch under base/claude-<digits>, plus the two temp caches
 * Clean AI Waste deletes. Live sessions (mtime within idleMs) are skipped.
 */
function measureStaleTemp(base, now, idleMs) {
  const root = base || '/private/tmp';
  const clock = now || Date.now();
  const idle = idleMs || IDLE_MS;
  const staleTops = [];
  let known = true;
  const names = listNames(root);
  if (names === null) {
    if (!fs.existsSync(root)) return { paths: [], known: true };
    return { paths: [], known: false };
  }
  for (const name of names) {
    if (!/^claude-\d+$/.test(name)) continue;
    const children = listNames(path.join(root, name));
    if (children === null) {
      known = false;
      continue;
    }
    for (const child of children) {
      if (child === 'bundled-skills') continue;
      const entry = path.join(root, name, child);
      let st;
      try {
        st = fs.statSync(entry);
      } catch {
        continue;
      }
      if (clock - st.mtimeMs >= idle) staleTops.push(entry);
    }
  }
  return { paths: staleTops, known };
}

function leftoverScanDirs(home) {
  const base = home || HOME;
  return [
    '/Applications',
    path.join(base, 'Library/Application Support'),
    path.join(base, 'Library/Caches'),
    path.join(base, 'Library/Preferences'),
    path.join(base, 'Library/LaunchAgents'),
    path.join(base, 'Library/Logs'),
  ];
}

function measureNamedLeftovers(regex, home, extraAbs, scanRoots) {
  const dirs = scanRoots || leftoverScanDirs(home);
  const found = [];
  for (const dir of dirs) {
    const names = listNames(dir);
    if (!names) continue;
    for (const name of names) {
      if (name.startsWith('com.apple.')) continue;
      if (regex.test(name)) found.push(path.join(dir, name));
    }
  }
  for (const extra of extraAbs || []) {
    if (extra && fs.existsSync(extra) && !found.includes(extra)) found.push(extra);
  }
  return found;
}

function sumPaths(paths, perTimeoutMs) {
  const list = paths || [];
  if (!list.length) return { bytes: 0, known: true, pathCount: 0 };
  if (list.length > 8) return { bytes: 0, known: false, pathCount: list.length };
  const r = spawnSync('du', ['-sk', ...list], { encoding: 'utf8', timeout: perTimeoutMs });
  if (r.status !== 0 || !r.stdout) return { bytes: 0, known: false, pathCount: list.length };
  let bytes = 0;
  let lines = 0;
  for (const line of String(r.stdout).trim().split('\n')) {
    if (!line) continue;
    const kb = parseInt(line.trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(kb)) return { bytes: 0, known: false, pathCount: list.length };
    bytes += kb * 1024;
    lines += 1;
  }
  if (lines !== list.length) return { bytes, known: false, pathCount: list.length };
  return { bytes, known: true, pathCount: list.length };
}

function countPrunableWorktrees(porcelain) {
  return String(porcelain || '')
    .split('\n')
    .filter((line) => line.startsWith('prunable ')).length;
}

function measurePrunableWorktrees(repo) {
  if (!repo) return { count: 0, known: false };
  const r = spawnSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
    timeout: 2000,
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return { count: 0, known: false };
  return { count: countPrunableWorktrees(r.stdout), known: true };
}

function buildDiskRecommendations(snapshot) {
  const s = snapshot || {};
  const claude = num(s.staleClaudeBytes);
  const swift = num(s.swiftCacheBytes);
  const nodeCache = num(s.nodeCacheBytes);
  const sim = num(s.simCacheBytes);
  const worktrees = Math.max(0, Math.floor(num(s.orphanedWorktrees)));
  const staleCount = Math.max(0, Math.floor(num(s.stalePathCount)));
  const wasteKnown = s.wasteSizeKnown !== false;
  const wasteBytes = claude + swift + nodeCache + sim;
  const wasteMeaningful = wasteBytes >= NOISE_BYTES || worktrees > 0;
  const wasteDone = wasteKnown && !wasteMeaningful;

  const parts = [];
  if (claude >= NOISE_BYTES) parts.push(`${formatBytes(claude)} in idle /private/tmp/claude-*`);
  if (swift >= NOISE_BYTES) parts.push(`${formatBytes(swift)} Swift temp cache`);
  if (nodeCache >= NOISE_BYTES) parts.push(`${formatBytes(nodeCache)} Node temp cache`);
  if (sim >= NOISE_BYTES) parts.push(`${formatBytes(sim)} simulator cache`);
  if (worktrees > 0) {
    parts.push(worktrees === 1 ? '1 orphaned worktree' : `${worktrees} orphaned worktrees`);
  }
  if (!parts.length && wasteBytes >= NOISE_BYTES) {
    parts.push(`${formatBytes(wasteBytes)} of stale temp files`);
  }

  let wasteText;
  let wasteShort;
  if (!wasteKnown) {
    if (staleCount > 0 || worktrees > 0) {
      const bits = [];
      if (staleCount > 0) bits.push(staleCount === 1 ? '1 stale temp folder' : `${staleCount} stale temp folders`);
      if (worktrees > 0) bits.push(worktrees === 1 ? '1 orphaned worktree' : `${worktrees} orphaned worktrees`);
      wasteText = `Sweep ${bits.join(' and ')}. Clean AI Waste removes the stale temp files. The exact size is still being measured.`;
      wasteShort = staleCount > 0
        ? `${staleCount} stale ${staleCount === 1 ? 'folder' : 'folders'}`
        : (worktrees === 1 ? '1 orphaned worktree' : `${worktrees} orphaned worktrees`);
    } else {
      wasteText = 'AI waste is still being measured. This line checks off when the stale temp files are actually gone.';
      wasteShort = 'Measuring';
    }
  } else if (wasteDone) {
    wasteText = 'AI waste is already clear. Nothing stale is left in /private/tmp/claude-*, Swift or Node temp caches, simulator caches, or orphaned worktrees.';
    wasteShort = 'Clear';
  } else if (wasteBytes < NOISE_BYTES && worktrees > 0) {
    wasteText = `Remove ${parts.join(', ')}. Clean AI Waste does not delete live worktrees, only ones git already calls prunable.`;
    wasteShort = worktrees === 1 ? '1 orphaned worktree' : `${worktrees} orphaned worktrees`;
  } else {
    wasteText = `Sweep ${parts.join(', ')}. Clean AI Waste removes the stale temp files.`;
    wasteShort = worktrees > 0
      ? `${formatBytes(wasteBytes)} + ${worktrees} worktrees still sweepable`
      : `${formatBytes(wasteBytes)} still sweepable`;
  }

  const cmm = s.cleanMyMac || {};
  const cmmCount = Math.max(0, Math.floor(num(cmm.pathCount)));
  const cmmBytes = num(cmm.bytes);
  const cmmKnown = cmm.sizeKnown !== false;
  const cmmDone = cmmCount === 0;
  let cmmText;
  let cmmShort;
  if (cmmDone) {
    cmmText = 'CleanMyMac 5 is already gone. No app and no leftover LaunchAgents or support folders.';
    cmmShort = 'Already gone';
  } else if (!cmmKnown) {
    cmmText = `CleanMyMac 5 is still on this Mac (${cmmCount} ${cmmCount === 1 ? 'path' : 'paths'}). Uninstall Apps removes the app and those leftovers.`;
    cmmShort = `${cmmCount} paths still installed`;
  } else {
    cmmText = `CleanMyMac 5 is still on this Mac (${formatBytes(cmmBytes)} across ${cmmCount} ${cmmCount === 1 ? 'path' : 'paths'}). Uninstall Apps removes the app and those leftovers.`;
    cmmShort = `${formatBytes(cmmBytes)} still installed`;
  }

  const paper = s.paper || {};
  const paperCount = Math.max(0, Math.floor(num(paper.pathCount)));
  const paperBytes = num(paper.bytes);
  const paperKnown = paper.sizeKnown !== false;
  const paperDone = paperCount === 0;
  let paperText;
  let paperShort;
  if (paperDone) {
    paperText = 'Paper is already gone. No app and no cache cassettes left.';
    paperShort = 'Already gone';
  } else if (!paperKnown) {
    paperText = `Paper is still on this Mac (${paperCount} ${paperCount === 1 ? 'path' : 'paths'}).`;
    paperShort = `${paperCount} paths still installed`;
  } else {
    paperText = `Paper is still on this Mac (${formatBytes(paperBytes)}).`;
    paperShort = `${formatBytes(paperBytes)} still installed`;
  }

  return {
    ok: true,
    waste: { done: wasteDone, text: wasteText, short: wasteShort, bytes: wasteBytes, sizeKnown: wasteKnown },
    cleanMyMac: {
      done: cmmDone,
      text: cmmText,
      short: cmmShort,
      bytes: cmmBytes,
      pathCount: cmmCount,
      sizeKnown: cmmKnown,
      primaryPath: typeof cmm.primaryPath === 'string' ? cmm.primaryPath : '',
    },
    paper: {
      done: paperDone,
      text: paperText,
      short: paperShort,
      bytes: paperBytes,
      pathCount: paperCount,
      sizeKnown: paperKnown,
    },
  };
}

function sampleDiskRecommendations(options = {}) {
  const now = options.now || Date.now();
  const idleMs = options.idleMs || IDLE_MS;
  const tmpBase = options.tmpBase || '/private/tmp';
  const home = options.home || HOME;
  const repo = options.repo || path.join(HOME, 'workspace/mac-yolo-safeguards');
  const simCache = options.simCache || path.join(home, 'Library/Developer/CoreSimulator/Caches');

  const stale = options.stalePaths
    ? { paths: options.stalePaths, known: options.staleKnown !== false }
    : measureStaleTemp(tmpBase, now, idleMs);
  const staleSize = sumPaths(stale.paths, 800);
  const swiftSize = options.swiftCacheBytes != null
    ? { bytes: num(options.swiftCacheBytes), known: true }
    : duBytes(path.join(tmpBase, 'swift-module-cache'), 800);
  const nodeSize = options.nodeCacheBytes != null
    ? { bytes: num(options.nodeCacheBytes), known: true }
    : duBytes(path.join(tmpBase, 'node-compile-cache'), 800);
  const simSize = options.simCacheBytes != null
    ? { bytes: num(options.simCacheBytes), known: true }
    : duBytes(simCache, 800);
  const worktrees = options.worktreePorcelain != null
    ? { count: countPrunableWorktrees(options.worktreePorcelain), known: true }
    : (options.orphanedWorktrees != null
      ? { count: num(options.orphanedWorktrees), known: options.worktreesKnown !== false }
      : measurePrunableWorktrees(repo));

  const cmmPaths = options.cleanMyMacPaths
    || measureNamedLeftovers(/cleanmymac/i, home, options.cleanMyMacExtra || []);
  const cmmSize = options.cleanMyMac
    ? options.cleanMyMac
    : sumPaths(cmmPaths, 800);
  const paperPaths = options.paperPaths
    || measureNamedLeftovers(/^Paper\.app$|^com\.papercompute/i, home, options.paperExtra || []);
  const paperSize = options.paper
    ? options.paper
    : sumPaths(paperPaths, 800);

  const wasteSizeKnown = stale.known && staleSize.known && swiftSize.known && nodeSize.known && simSize.known && worktrees.known;
  const built = buildDiskRecommendations({
    staleClaudeBytes: staleSize.bytes,
    swiftCacheBytes: swiftSize.bytes,
    nodeCacheBytes: nodeSize.bytes,
    simCacheBytes: simSize.bytes,
    orphanedWorktrees: worktrees.count,
    stalePathCount: stale.paths.length,
    wasteSizeKnown,
    cleanMyMac: {
      pathCount: cmmSize.pathCount != null ? cmmSize.pathCount : cmmPaths.length,
      bytes: cmmSize.bytes,
      sizeKnown: cmmSize.known !== false && cmmSize.sizeKnown !== false,
      primaryPath: (cmmPaths && cmmPaths[0]) || cmmSize.primaryPath || '',
    },
    paper: {
      pathCount: paperSize.pathCount != null ? paperSize.pathCount : paperPaths.length,
      bytes: paperSize.bytes,
      sizeKnown: paperSize.known !== false && paperSize.sizeKnown !== false,
    },
  });
  built.sampledAt = new Date(now).toISOString();
  return built;
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(sampleDiskRecommendations())}\n`);
}

module.exports = {
  IDLE_MS,
  NOISE_BYTES,
  formatBytes,
  measureStaleTemp,
  measureNamedLeftovers,
  countPrunableWorktrees,
  buildDiskRecommendations,
  sampleDiskRecommendations,
};
