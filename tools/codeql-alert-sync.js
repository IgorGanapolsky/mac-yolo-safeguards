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
    writeBaseline: false,
    checkIncrease: false,
    dismissFps: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--gate') out.gate = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--max-high') out.maxHigh = argv[++i];
    else if (a === '--max-open') out.maxOpen = argv[++i];
    else if (a === '--write-baseline') out.writeBaseline = true;
    else if (a === '--check-increase') out.checkIncrease = true;
    else if (a === '--dismiss-fps') out.dismissFps = true;
    else if (a === '--dry-run') out.dryRun = true;
  }
  // Coerce thresholds: reject NaN so typos cannot soft-pass the gate.
  for (const key of ['maxHigh', 'maxOpen']) {
    if (out[key] === undefined || out[key] === null || out[key] === '') continue;
    const n = Number(out[key]);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Invalid --${key === 'maxHigh' ? 'max-high' : 'max-open'}: ${out[key]} (need non-negative number)`);
    }
    out[key] = n;
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


function isTestPath(pathStr) {
  const p = String(pathStr || '');
  return (
    p.startsWith('tests/') ||
    p.includes('/__tests__/') ||
    /\.test\.(js|ts|tsx|mjs)$/.test(p) ||
    /\.spec\.(js|ts)$/.test(p)
  );
}

/** Known false-positive classes for this monorepo (JWT ≠ password hash; test hosts). */
function classifyFp(alert) {
  const rule = alert.rule?.id || '';
  const pathStr = alert.most_recent_instance?.location?.path || '';
  const classes = alert.most_recent_instance?.classifications || [];
  if (classes.includes('test') || isTestPath(pathStr)) {
    return { reason: 'used in tests', comment: `Test-only path ${pathStr} — not production attack surface.` };
  }
  if (rule === 'js/insufficient-password-hash') {
    if (
      pathStr.includes('asc-') ||
      pathStr.includes('attach-and-submit-asc') ||
      pathStr.includes('submit-asc') ||
      pathStr.includes('dedupe-asc') ||
      pathStr.includes('hermes-zcode-harness')
    ) {
      return {
        reason: 'false positive',
        comment:
          'Not password storage: App Store Connect ES256 JWT signing or content fingerprint HMAC. See tools/lib/asc-jwt-es256.js.',
      };
    }
  }
  if (rule === 'js/incomplete-url-substring-sanitization' && isTestPath(pathStr)) {
    return { reason: 'used in tests', comment: 'URL host string in unit assertion only.' };
  }
  return null;
}

function dismissAlert(slug, number, reason, comment, dryRun) {
  if (dryRun) {
    return { number, dryRun: true, reason, comment };
  }
  const r = spawnSync(
    'gh',
    [
      'api',
      '-X',
      'PATCH',
      `repos/${slug}/code-scanning/alerts/${number}`,
      '-f',
      `state=dismissed`,
      '-f',
      `dismissed_reason=${reason}`,
      '-f',
      `dismissed_comment=${comment}`,
    ],
    { encoding: 'utf8', cwd: REPO },
  );
  return {
    number,
    ok: r.status === 0,
    status: r.status,
    err: (r.stderr || '').slice(0, 200),
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error('codeql-alert-sync:', e.message || e);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(`codeql-alert-sync

Usage:
  node tools/codeql-alert-sync.js --json
  node tools/codeql-alert-sync.js --gate [--max-high 0] [--max-open 5]
  node tools/codeql-alert-sync.js --write-baseline
  node tools/codeql-alert-sync.js --check-increase
  node tools/codeql-alert-sync.js --dismiss-fps [--dry-run]
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
    // --gate must not silent-pass when alert retrieval fails (auth/rate/network).
    // Soft only when explicitly not gating, or GATE_SOFT=1 for optional CI probes.
    if (args.gate && process.env.CODEQL_GATE_SOFT !== '1') process.exitCode = 1;
    if (args.json) console.log(JSON.stringify({ ok: false, error: alerts.message }));
    return;
  }
  if (args.dismissFps) {
    const results = [];
    for (const a of alerts) {
      const fp = classifyFp(a);
      if (!fp) continue;
      results.push(dismissAlert(slug, a.number, fp.reason, fp.comment, args.dryRun));
    }
    const out = { ok: true, dismissed: results.length, results };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`codeql-alert-sync dismiss-fps: ${results.length} alerts`);
      for (const r of results) console.log(JSON.stringify(r));
    }
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


  const baselinePath = path.join(REPO, 'coordination', 'codeql-baseline.json');
  if (args.writeBaseline && !alerts.error) {
    const baseline = {
      writtenAt: new Date().toISOString(),
      open: summary.open,
      highish: summary.highish,
      byRule: summary.byRule,
    };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    report.baselineWritten = baselinePath;
  }
  if (args.checkIncrease && !alerts.error && fs.existsSync(baselinePath)) {
    try {
      const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const openUp = summary.open > (base.open ?? 0);
      const highUp = summary.highish > (base.highish ?? 0);
      report.baseline = base;
      report.increase = { openUp, highUp };
      if (openUp || highUp) {
        report.ok = false;
        process.exitCode = 1;
      }
    } catch (e) {
      report.baselineError = e.message;
    }
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
