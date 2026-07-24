#!/usr/bin/env node
'use strict';

/**
 * graphify-staleness-check.js — Detect when the code knowledge graph is stale.
 *
 * Inspired by JetBrains Context's core value: an agent with a fresh semantic
 * index spends fewer tokens exploring. A stale graph is worse than no graph
 * (agents trust outdated architecture). This module surfaces graph age +
 * commits-since-build so session-start can warn early.
 *
 * Usage:
 *   node tools/graphify-staleness-check.js [--json]
 *   node tools/graphify-staleness-check.js --update   # queue background rebuild if stale
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const GRAPH_JSON = path.join(REPO, 'graphify-out/graph.json');
const GRAPHIFY_BIN = path.join(REPO, '.graphify-venv/bin/graphify');
const STALE_COMMIT_THRESHOLD = 50;
const STALE_HOURS_THRESHOLD = 48;

function checkGraphStaleness() {
  if (!fs.existsSync(GRAPH_JSON)) {
    return {
      exists: false,
      stale: true,
      reason: 'graph.json missing — run: .graphify-venv/bin/graphify extract . --no-cluster',
      graphifyAvailable: fs.existsSync(GRAPHIFY_BIN),
    };
  }

  const stat = fs.statSync(GRAPH_JSON);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);

  const isoTime = stat.mtime.toISOString().replace(/\.\d+Z$/, 'Z');
  const revList = spawnSync(
    'git',
    ['-C', REPO, 'rev-list', '--count', `--since=${isoTime}`, 'HEAD'],
    { encoding: 'utf8', timeout: 5000 },
  );
  const commitsSince = revList.status === 0
    ? parseInt(revList.stdout.trim(), 10) || 0
    : -1;

  let nodeCount = 0;
  let linkCount = 0;
  try {
    const raw = fs.readFileSync(GRAPH_JSON, 'utf8');
    const parsed = JSON.parse(raw);
    nodeCount = (parsed.nodes || []).length;
    linkCount = (parsed.links || parsed.edges || []).length;
  } catch {
    /* graph may be mid-write */
  }

  const stale = ageHours > STALE_HOURS_THRESHOLD || commitsSince > STALE_COMMIT_THRESHOLD;

  return {
    exists: true,
    mtime: stat.mtime.toISOString(),
    ageHours: Math.round(ageHours * 10) / 10,
    ageDisplay: formatAge(ageHours),
    commitsSince,
    nodeCount,
    linkCount,
    stale,
    graphifyAvailable: fs.existsSync(GRAPHIFY_BIN),
    threshold: { hours: STALE_HOURS_THRESHOLD, commits: STALE_COMMIT_THRESHOLD },
  };
}

function formatAge(hours) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

function maybeQueueBackgroundUpdate(report) {
  if (!report.stale) return { triggered: false, reason: 'graph is fresh' };
  if (!report.graphifyAvailable) return { triggered: false, reason: 'graphify binary missing' };

  const logPath = path.join(os.homedir(), '.cache', 'graphify-rebuild.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const child = spawnSync(
    process.execPath,
    ['-e', `
      const { spawn } = require('child_process');
      const fs = require('fs');
      const log = fs.openSync('${logPath}', 'a');
      const p = spawn('${GRAPHIFY_BIN}', ['update', '.', '--no-cluster'], {
        stdio: ['ignore', log, log],
        detached: true,
        cwd: '${REPO}',
      });
      p.unref();
    `],
    { encoding: 'utf8', timeout: 5000 },
  );

  return { triggered: true, logPath };
}

const os = require('os');

function format(report) {
  if (!report.exists) {
    return `=== Code graph (Graphify) ===
Status: MISSING — ${report.reason}`;
  }
  const status = report.stale ? `STALE (${report.ageDisplay}, ${report.commitsSince} commits behind)` : `fresh (${report.ageDisplay})`;
  return `=== Code graph (Graphify) ===
Nodes: ${report.nodeCount.toLocaleString()} | Links: ${report.linkCount.toLocaleString()} | Age: ${status}
Query: .graphify-venv/bin/graphify query "<question>"${report.stale ? '\n  → Run: .graphify-venv/bin/graphify update . --no-cluster' : ''}`;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const shouldUpdate = argv.includes('--update');

  const report = checkGraphStaleness();

  if (shouldUpdate) {
    report.update = maybeQueueBackgroundUpdate(report);
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(format(report));
    if (report.update?.triggered) {
      console.log(`  → Background rebuild queued (log: ${report.update.logPath})`);
    }
  }
  process.exit(0);
}

module.exports = { checkGraphStaleness, formatAge, format, maybeQueueBackgroundUpdate };
module.exports.STALE_COMMIT_THRESHOLD = STALE_COMMIT_THRESHOLD;
module.exports.STALE_HOURS_THRESHOLD = STALE_HOURS_THRESHOLD;

if (require.main === module) {
  main();
}
