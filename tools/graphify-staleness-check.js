#!/usr/bin/env node
'use strict';

/**
 * graphify-staleness-check.js — Validate the published Graphify snapshot.
 *
 * A recent mtime is not freshness. Health is bound to the exact origin/main
 * SHA, the Graphify package/skill version pair, graph structure, and a
 * successful query canary captured in the same atomically published file.
 *
 * Usage:
 *   node tools/graphify-staleness-check.js [--json] [--strict]
 *   node tools/graphify-staleness-check.js --update
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  detectVersionCompatibility,
  inspectPublishedGraph,
} = require('./graphify-snapshot');

const REPO = path.resolve(__dirname, '..');
const GRAPH_JSON = path.join(REPO, 'graphify-out', 'graph.json');
const GRAPHIFY_BIN = path.join(REPO, '.graphify-venv', 'bin', 'graphify');
const SNAPSHOT_TOOL = path.join(REPO, 'tools', 'graphify-snapshot.js');
const STALE_COMMIT_THRESHOLD = 0;
const STALE_HOURS_THRESHOLD = 48;

function gitOriginMainState(repo = REPO, options = {}) {
  const runner = options.runner || spawnSync;
  const runGit = (args) => runner('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    timeout: options.timeoutMs || 15000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (options.fetch !== false) {
    const fetch = runGit(['fetch', '--quiet', 'origin', 'main']);
    if (fetch.status !== 0) {
      return {
        sha: '',
        attemptedFetch: true,
        fetched: false,
        error: String(fetch.stderr || fetch.stdout || 'git fetch failed').trim().slice(0, 500),
      };
    }
  }
  const result = runGit(['rev-parse', 'origin/main']);
  const sha = result.status === 0 && /^[a-f0-9]{40}$/i.test(String(result.stdout || '').trim())
    ? result.stdout.trim()
    : '';
  return {
    sha,
    attemptedFetch: options.fetch !== false,
    fetched: options.fetch !== false,
    error: sha ? null : String(result.stderr || result.stdout || 'origin/main unavailable').trim().slice(0, 500),
  };
}

function gitOriginMainSha(repo = REPO, options = {}) {
  return gitOriginMainState(repo, options).sha;
}

function checkGraphStaleness(options = {}) {
  const repo = path.resolve(options.repo || REPO);
  const graphPath = path.resolve(options.graphPath || path.join(repo, 'graphify-out', 'graph.json'));
  const graphifyBin = path.resolve(options.graphifyBin || path.join(repo, '.graphify-venv', 'bin', 'graphify'));
  const originState = options.originMainSha
    ? { sha: options.originMainSha, attemptedFetch: false, fetched: false, provided: true, error: null }
    : gitOriginMainState(repo, options);
  const originMainSha = originState.sha;
  const versionInfo = options.currentVersionInfo
    || detectVersionCompatibility(graphifyBin, { runner: options.runner });
  const health = inspectPublishedGraph({
    graphPath,
    originMainSha: originMainSha || undefined,
    currentVersionInfo: versionInfo,
    maxAgeHours: options.maxAgeHours ?? STALE_HOURS_THRESHOLD,
    now: options.now,
  });
  const failures = [...health.failures];
  if (!originMainSha) failures.push(originState.attemptedFetch ? 'origin_main_fetch_failed' : 'origin_main_sha_unavailable');
  const uniqueFailures = [...new Set(failures)];
  const stale = uniqueFailures.length > 0;
  return {
    ...health,
    ok: !stale,
    stale,
    failures: uniqueFailures,
    reason: uniqueFailures.join(', ') || 'validated snapshot matches fetched origin/main',
    graphifyAvailable: fs.existsSync(graphifyBin),
    graphifyVersion: versionInfo,
    originFetch: originState,
    commitsSince: health.sourceLag,
    ageDisplay: health.ageHours === null ? 'unknown' : formatAge(health.ageHours),
    threshold: { hours: options.maxAgeHours ?? STALE_HOURS_THRESHOLD, commits: STALE_COMMIT_THRESHOLD },
  };
}

function formatAge(hours) {
  if (!Number.isFinite(hours)) return 'unknown';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
}

function maybeQueueBackgroundUpdate(report, options = {}) {
  if (!report.stale) return { triggered: false, reason: 'graph is fresh' };
  if (!report.graphifyAvailable) return { triggered: false, reason: 'graphify binary missing' };

  const repo = path.resolve(options.repo || REPO);
  const snapshotTool = path.resolve(options.snapshotTool || path.join(repo, 'tools', 'graphify-snapshot.js'));
  if (!fs.existsSync(snapshotTool)) return { triggered: false, reason: 'snapshot refresh tool missing' };
  const logPath = options.logPath || path.join(os.homedir(), '.cache', 'graphify-snapshot-refresh.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, 'a');
  const spawnChild = options.spawn || spawn;
  let child;
  try {
    child = spawnChild(process.execPath, [
      snapshotTool,
      '--source-repo',
      repo,
      '--target-graph',
      options.graphPath || path.join(repo, 'graphify-out', 'graph.json'),
      '--graphify-bin',
      options.graphifyBin || path.join(repo, '.graphify-venv', 'bin', 'graphify'),
      '--json',
    ], {
      cwd: repo,
      detached: true,
      stdio: ['ignore', log, log],
    });
    child.unref();
  } catch (error) {
    fs.closeSync(log);
    return { triggered: false, reason: `failed to start refresh: ${error.message}`, logPath };
  }
  fs.closeSync(log);
  return {
    triggered: true,
    pid: child.pid,
    logPath,
    reason: 'refresh process started; publication success is not yet established',
  };
}

function format(report) {
  if (!report.exists) {
    return `=== Code graph (Graphify) ===
Status: MISSING/UNHEALTHY — ${report.reason}`;
  }
  const status = report.ok
    ? `validated (${report.ageDisplay}, source ${String(report.sourceSha || '').slice(0, 12)})`
    : `UNHEALTHY (${report.reason})`;
  return `=== Code graph (Graphify) ===
Nodes: ${report.nodeCount.toLocaleString()} | Links: ${report.linkCount.toLocaleString()} | Status: ${status}
Query: .graphify-venv/bin/graphify query "<question>" --graph graphify-out/graph.json`;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  const shouldUpdate = argv.includes('--update');
  const unknown = argv.filter((arg) => !['--json', '--strict', '--update'].includes(arg));
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);

  const report = checkGraphStaleness();
  if (shouldUpdate) report.update = maybeQueueBackgroundUpdate(report);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(format(report));
    if (report.update?.triggered) {
      console.log(`  → ${report.update.reason} (pid ${report.update.pid}, log: ${report.update.logPath})`);
    }
  }
  if (strict && !report.ok) process.exitCode = 1;
}

module.exports = {
  checkGraphStaleness,
  formatAge,
  format,
  gitOriginMainState,
  gitOriginMainSha,
  maybeQueueBackgroundUpdate,
};
module.exports.STALE_COMMIT_THRESHOLD = STALE_COMMIT_THRESHOLD;
module.exports.STALE_HOURS_THRESHOLD = STALE_HOURS_THRESHOLD;

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Graphify health check failed: ${error.message}`);
    process.exitCode = 2;
  }
}
