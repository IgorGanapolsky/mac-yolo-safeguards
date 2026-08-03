#!/usr/bin/env node
'use strict';

/**
 * megafile-risk-scan.js — Deterministic megafile / hot-file risk report.
 *
 *   node tools/megafile-risk-scan.js
 *   node tools/megafile-risk-scan.js --base origin/main --json
 *   node tools/megafile-risk-scan.js --stdin   # paths one per line
 *   node tools/megafile-risk-scan.js --require-decision  # exit 1 if megafile hit without D- or Decisions Log in --body-file
 *
 * Uses MEGAFILES from agent-swarm-harness (single source of truth).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function loadMegafiles() {
  try {
    const h = require('./agent-swarm-harness');
    if (Array.isArray(h.MEGAFILES) && h.MEGAFILES.length) return [...h.MEGAFILES];
  } catch {
    /* fall through */
  }
  return [
    'hermes-mobile/src/context/GatewayContext.tsx',
    'hermes-mobile/src/screens/ChatScreen.tsx',
    'hermes-mobile/src/services/gatewayDiscovery.ts',
    'hermes-mobile/src/services/gatewayProfiles.ts',
    'hermes-mobile/src/services/tailscaleDiscovery.ts',
    'hermes-mobile/src/utils/gatewayProfilePicker.ts',
    'hermes-mobile/src/components/ConnectMacGate.tsx',
    'tools/hermes-cloud-connector.js',
    'apps/hermes-control-plane/app/dashboard/DashboardClient.tsx',
  ];
}

function parseArgs(argv) {
  const out = {
    base: 'origin/main',
    json: false,
    stdin: false,
    requireDecision: false,
    bodyFile: null,
    paths: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--stdin') out.stdin = true;
    else if (a === '--require-decision') out.requireDecision = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--base') out.base = String(argv[++i] || 'origin/main');
    else if (a === '--body-file') out.bodyFile = argv[++i];
    else if (a === '--paths') {
      out.paths = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out;
}

function gitDiffNames(base) {
  const tries = [
    ['diff', '--name-only', `${base}...HEAD`],
    ['diff', '--name-only', `${base}..HEAD`],
    ['diff', '--name-only', 'HEAD'],
  ];
  for (const args of tries) {
    try {
      const out = execFileSync('git', args, {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      /* try next */
    }
  }
  return [];
}

function readStdinPaths() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pure: match changed paths against megafile list.
 */
function scanMegafileHits(changedPaths, megafiles = loadMegafiles()) {
  const changed = [...new Set((changedPaths || []).map((p) => String(p).replace(/^\.\//, '')))];
  const hits = [];
  for (const mega of megafiles) {
    const m = String(mega).replace(/^\.\//, '');
    if (changed.includes(m)) {
      hits.push({ megafile: m, files: [m] });
    }
  }
  return hits;
}

function hasDecisionCite(text) {
  if (!text) return false;
  return (
    /\bD-\d{4}-\d{2}-\d{2}[-a-zA-Z0-9]*\b/.test(text) ||
    /Decisions?\s+Log/i.test(text) ||
    /plan\.md/i.test(text)
  );
}

function buildReport({ base, paths, bodyText }) {
  const megafiles = loadMegafiles();
  const hits = scanMegafileHits(paths, megafiles);
  const decisionOk = hasDecisionCite(bodyText);
  const ok = hits.length === 0 || decisionOk;
  return {
    ok,
    base,
    changedCount: paths.length,
    megafileCount: megafiles.length,
    hits,
    hitCount: hits.length,
    decisionCited: decisionOk,
    protocol: [
      'Claim megafiles in plan.md §2 File Ownership Map before editing',
      'Cite D-YYYY-MM-DD-… or Decisions Log in PR body',
      'Prefer sequential merge; never multi-owner megafile thrash',
      'node tools/megafile-risk-scan.js --base origin/main --require-decision --body-file pr-body.md',
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`megafile-risk-scan — hot-file risk vs MEGAFILES

Usage:
  node tools/megafile-risk-scan.js [--base origin/main] [--json]
  node tools/megafile-risk-scan.js --paths a,b [--json]
  node tools/megafile-risk-scan.js --stdin < names.txt
  node tools/megafile-risk-scan.js --require-decision --body-file pr.md
`);
    return;
  }

  let paths = args.paths;
  if (args.stdin) paths = readStdinPaths();
  if (!paths.length) paths = gitDiffNames(args.base);

  let bodyText = '';
  if (args.bodyFile && fs.existsSync(args.bodyFile)) {
    bodyText = fs.readFileSync(args.bodyFile, 'utf8');
  }

  const report = buildReport({ base: args.base, paths, bodyText });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== megafile-risk-scan (base=${report.base}) ===`);
    console.log(`changed: ${report.changedCount} · megafile hits: ${report.hitCount}`);
    if (!report.hits.length) console.log('  (no megafile hits)');
    for (const h of report.hits) {
      console.log(`  ! ${h.megafile}`);
      for (const f of h.files) console.log(`      ${f}`);
    }
    console.log(`decision cited: ${report.decisionCited}`);
    console.log(`ok: ${report.ok}`);
  }

  if (args.requireDecision && report.hitCount > 0 && !report.decisionCited) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadMegafiles,
  scanMegafileHits,
  hasDecisionCite,
  buildReport,
};
