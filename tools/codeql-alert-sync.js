#!/usr/bin/env node
'use strict';

/**
 * codeql-alert-sync.js — Automate Code scanning health for this repo.
 *
 *   node tools/codeql-alert-sync.js --json
 *   node tools/codeql-alert-sync.js --gate --max-high 0 --max-open 5
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    json: false,
    gate: false,
    maxHigh: 0,
    maxOpen: 5,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--gate') out.gate = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--max-high') out.maxHigh = Number(argv[++i]);
    else if (a === '--max-open') out.maxOpen = Number(argv[++i]);
  }
  return out;
}

function ghApi(urlPath) {
  const r = spawnSync('gh', ['api', urlPath, '--paginate'], {
    encoding: 'utf8',
    cwd: REPO,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { error: true, message: (r.stderr || r.stdout || 'gh api failed').slice(0, 500) };
  }
  try {
    const text = (r.stdout || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      const parts = text.split(/\n(?=\[)/);
      const all = [];
      for (const part of parts) {
        const chunk = JSON.parse(part);
        if (Array.isArray(chunk)) all.push(...chunk);
      }
      return all;
    }
    return JSON.parse(text);
  } catch (e) {
    return { error: true, message: e.message };
  }
}

function summarize(alerts) {
  const byRule = {};
  const bySev = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    error: 0,
    note: 0,
    other: 0,
  };
  for (const a of alerts) {
    const rid = a.rule?.id || 'unknown';
    byRule[rid] = (byRule[rid] || 0) + 1;
    const sev = (a.rule?.security_severity_level || a.rule?.severity || 'other').toLowerCase();
    if (bySev[sev] === undefined) bySev.other += 1;
    else bySev[sev] += 1;
  }
  return {
    open: alerts.length,
    byRule,
    bySev,
    highish: (bySev.high || 0) + (bySev.critical || 0) + (bySev.error || 0),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`codeql-alert-sync

Usage:
  node tools/codeql-alert-sync.js --json
  node tools/codeql-alert-sync.js --gate [--max-high 0] [--max-open 5]
`);
    return;
  }

  const ownerRepo = spawnSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    { encoding: 'utf8', cwd: REPO },
  );
  const slug = (ownerRepo.stdout || 'IgorGanapolsky/mac-yolo-safeguards').trim();
  const alerts = ghApi(`repos/${slug}/code-scanning/alerts?state=open&per_page=100`);
  if (alerts.error) {
    console.error('codeql-alert-sync:', alerts.message);
    if (args.gate && process.env.CODEQL_GATE_STRICT === '1') process.exitCode = 1;
    if (args.json) console.log(JSON.stringify({ ok: false, error: alerts.message }));
    return;
  }

  const list = Array.isArray(alerts) ? alerts : [];
  const summary = summarize(list);
  const report = {
    ok: true,
    repo: slug,
    ...summary,
    maxHigh: args.maxHigh,
    maxOpen: args.maxOpen,
  };

  if (args.gate) {
    const failHigh = summary.highish > args.maxHigh;
    const failOpen = summary.open > args.maxOpen;
    report.ok = !failHigh && !failOpen;
    report.gate = { failHigh, failOpen };
    if (!report.ok) process.exitCode = 1;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Code scanning open alerts (${slug}) ===`);
    console.log(`open=${summary.open} highish=${summary.highish}`);
    for (const [k, v] of Object.entries(summary.byRule).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v}\t${k}`);
    }
    if (args.gate) {
      console.log(`gate ok=${report.ok} (maxHigh=${args.maxHigh} maxOpen=${args.maxOpen})`);
    }
  }

  try {
    const out = path.join(REPO, 'coordination', 'codeql-open-summary.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  } catch {
    /* ignore */
  }
}

if (require.main === module) main();
module.exports = { summarize };
