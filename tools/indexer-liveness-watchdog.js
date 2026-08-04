#!/usr/bin/env node
'use strict';

/**
 * indexer-liveness-watchdog.js — detect an indexer that is ALIVE but not
 * PROGRESSING, and make the recovery routine.
 *
 * WHY THIS EXISTS
 *   The InfoQ July 2026 architects' newsletter case study "From Batch to
 *   Micro-Batch Streaming: Lessons Learned the Hard Way in a Delta Index
 *   Pipeline" reports two findings that this repo has independently reproduced:
 *
 *     1. "An early attempt to reuse success-file and completion-marker logic
 *        from the batch system proved unreliable under continuous evaluation,
 *        because object storage listings and markers became visible at
 *        inconsistent times. Replacing this earlier attempt with deterministic,
 *        time-driven watermark comparisons solved the problem."
 *
 *     2. "The team scheduled restarts every twenty-four hours and added a
 *        watchdog to monitor liveness and enforce restarts, turning failures
 *        into routine, recoverable events."
 *
 *   We had exactly failure (1). `grepai status` reports "Watcher: running",
 *   which is a completion marker — it says a process exists, not that work is
 *   getting done. The index sat frozen for days behind a healthy-looking
 *   watcher, and agents got confident answers from a stale snapshot. We had no
 *   part (2) at all.
 *
 *   Reproduced live while writing this, 2026-07-31:
 *
 *       watcher PID 35281   ALIVE
 *       corpus HEAD         9d692dd8, 1 commit behind origin/main
 *       last_index_time     14.9 hours ago
 *
 *   Alive, with pending work, not progressing.
 *
 * THE DISCRIMINATION THAT MATTERS
 *   A stale watermark is NOT by itself a fault. If nothing changed, there is
 *   nothing to index and an old watermark is correct. Alerting on age alone
 *   would fire every quiet night, and an alarm that cries wolf gets muted —
 *   which is how the original outage stayed invisible.
 *
 *   So a STALL requires BOTH:
 *     - pending work  (corpus behind origin, or corpus newer than the index)
 *     - no progress   (watermark older than the work that is waiting)
 *
 *   Nothing pending + old watermark = IDLE, which is healthy.
 *
 * Usage:
 *   node tools/indexer-liveness-watchdog.js              # report only
 *   node tools/indexer-liveness-watchdog.js --enforce    # restart on STALLED
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

// How far the watermark may lag the newest pending work before we call it a
// stall. The watcher debounces at 500ms and reindexes in seconds, so 30 minutes
// is far beyond any legitimate processing window while staying clear of noise.
const STALL_GRACE_MINUTES = 30;

const DEFAULT_CORPUS = path.join(os.homedir(), '.hermes', 'semantic-index', 'mac-yolo-safeguards');

function readWatermark(configPath) {
  // Read the timestamp as TEXT. Never parse-and-rewrite this file: a YAML
  // round-trip re-serialises the timestamp into a form grepai's Go parser
  // rejects and takes the whole index down.
  if (!fs.existsSync(configPath)) return null;
  const m = fs.readFileSync(configPath, 'utf8').match(/^\s*last_index_time:\s*(.+?)\s*$/m);
  if (!m) return null;
  const d = new Date(m[1].replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function git(dir, args) {
  return String(execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'],
  })).trim();
}

function watcherAlive(pgrepPattern = 'grepai watch') {
  try {
    const out = String(execFileSync('pgrep', ['-f', pgrepPattern], { encoding: 'utf8', timeout: 10000 }));
    const pids = out.split('\n').map((s) => s.trim()).filter(Boolean);
    return pids.length ? pids : null;
  } catch {
    return null; // pgrep exits 1 when nothing matches
  }
}

/**
 * Returns one of:
 *   HEALTHY  — progressing, or nothing to do and the process is up
 *   IDLE     — watermark old, but no pending work. Correct, not a fault.
 *   STALLED  — pending work AND the watermark has not advanced. The real fault.
 *   DEAD     — no watcher process at all
 *   UNKNOWN  — cannot determine, which is treated as a failure, never a pass
 */
function assess(opts = {}) {
  const corpus = opts.corpus || DEFAULT_CORPUS;
  const configPath = opts.configPath || path.join(corpus, '.grepai', 'config.yaml');
  const now = opts.now ? new Date(opts.now) : new Date();
  const graceMs = (opts.graceMinutes ?? STALL_GRACE_MINUTES) * 60000;

  if (!fs.existsSync(corpus)) {
    return { state: 'UNKNOWN', reason: `no indexed corpus at ${corpus}` };
  }
  const watermark = opts.watermark !== undefined ? (opts.watermark && new Date(opts.watermark)) : readWatermark(configPath);
  if (!watermark) {
    return { state: 'UNKNOWN', reason: `cannot read last_index_time from ${configPath}` };
  }

  let behind;
  let headTime;
  if (opts.behind !== undefined && opts.headTime !== undefined) {
    behind = opts.behind;
    headTime = new Date(opts.headTime);
  } else {
    try {
      try { git(corpus, ['fetch', 'origin', 'main', '--quiet']); } catch { /* offline is not fatal */ }
      behind = Number(git(corpus, ['rev-list', '--count', 'HEAD..origin/main']));
      headTime = new Date(git(corpus, ['log', '-1', '--format=%cI', 'HEAD']));
    } catch (e) {
      return { state: 'UNKNOWN', reason: `cannot compare corpus against origin: ${e.message}` };
    }
  }
  if (!Number.isFinite(behind) || Number.isNaN(headTime.getTime())) {
    return { state: 'UNKNOWN', reason: 'corpus position is unreadable' };
  }

  const pids = opts.pids !== undefined ? opts.pids : watcherAlive(opts.pgrepPattern);
  const watermarkAgeMin = Math.round((now - watermark) / 60000);

  // Pending work has two independent sources: commits not yet pulled, and
  // pulled content the index has not caught up to.
  const indexBehindContent = headTime.getTime() - watermark.getTime() > graceMs;
  const pending = behind > 0 || indexBehindContent;

  if (!pids) {
    return {
      state: 'DEAD', pids: null, behind, watermarkAgeMin, pending,
      reason: `no indexer process matched — the index cannot advance at all`,
    };
  }
  if (!pending) {
    return {
      state: 'IDLE', pids, behind, watermarkAgeMin, pending,
      reason: `watermark is ${watermarkAgeMin}m old but nothing is pending — correct, not a fault`,
    };
  }
  if (watermarkAgeMin * 60000 > graceMs) {
    return {
      state: 'STALLED', pids, behind, watermarkAgeMin, pending,
      reason: `process alive (pid ${pids.join(',')}) but the watermark has not advanced in `
        + `${watermarkAgeMin}m while work is pending (${behind} commit(s) behind`
        + `${indexBehindContent ? ', index older than corpus content' : ''}) — liveness is not progress`,
    };
  }
  return {
    state: 'HEALTHY', pids, behind, watermarkAgeMin, pending,
    reason: `work pending and the watermark advanced ${watermarkAgeMin}m ago, inside the ${opts.graceMinutes ?? STALL_GRACE_MINUTES}m grace`,
  };
}

/**
 * Restart the indexer. Deliberately a plain kill + relaunch: the case study's
 * point is that a scheduled, boring restart turns a rare mysterious failure
 * into a routine recoverable event.
 */
function enforce(assessment, opts = {}) {
  if (assessment.state !== 'STALLED' && assessment.state !== 'DEAD') {
    return { restarted: false, reason: `state ${assessment.state} does not warrant a restart` };
  }
  const corpus = opts.corpus || DEFAULT_CORPUS;
  if (opts.dryRun) return { restarted: false, dryRun: true, wouldRestart: true };
  for (const pid of assessment.pids || []) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch { /* already gone */ }
  }
  // Pull first: a restart that re-indexes the same stale checkout fixes nothing.
  try { execFileSync('git', ['-C', corpus, 'pull', '--ff-only', '--quiet'], { timeout: 120000, stdio: 'ignore' }); } catch { /* non-fatal */ }
  const child = spawn('grepai', ['watch'], { cwd: corpus, detached: true, stdio: 'ignore' });
  child.unref();
  return { restarted: true, pid: child.pid };
}

module.exports = { assess, enforce, readWatermark, STALL_GRACE_MINUTES };

if (require.main === module) {
  const a = assess({});
  const bad = a.state === 'STALLED' || a.state === 'DEAD' || a.state === 'UNKNOWN';
  console.log(`\n=== INDEXER LIVENESS ===\n  [${a.state}] ${a.reason}\n`);
  if (process.argv.includes('--enforce') && bad) {
    const r = enforce(a, { dryRun: process.argv.includes('--dry-run') });
    console.log(`  enforce: ${JSON.stringify(r)}\n`);
  }
  process.exit(bad ? 1 : 0);
}
