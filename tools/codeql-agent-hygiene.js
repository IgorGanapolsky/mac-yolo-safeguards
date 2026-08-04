#!/usr/bin/env node
'use strict';

/**
 * codeql-agent-hygiene.js — AI orchestration entry for Code scanning debt.
 *
 * Why: 2026-08 Security tab piled 20–33 open Highs because agents fixed
 * symptoms in PRs that never merged, claimed "clean", and re-introduced the
 * same pattern classes. This tool is the single agent-facing control plane.
 *
 * Modes:
 *   node tools/codeql-agent-hygiene.js                  # human brief
 *   node tools/codeql-agent-hygiene.js --json
 *   node tools/codeql-agent-hygiene.js --session-start  # for agent-session-start
 *   node tools/codeql-agent-hygiene.js --pre-ship       # fail if pattern gate dirty
 *   node tools/codeql-agent-hygiene.js --claim "security clean"
 *   node tools/codeql-agent-hygiene.js --strict         # hard-fail budget
 *
 * Exit: 0 ok · 1 hygiene fail · 2 usage
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PATTERN_GATE = path.join(REPO, 'tools/codeql-pattern-gate.js');
const ALERT_SYNC = path.join(REPO, 'tools/codeql-alert-sync.js');
const PLAYBOOK = 'docs/CODEQL-SECURITY-BURN-DOWN.md';
const BASELINE_PATH = path.join(REPO, '.codeql-alert-baseline.json');

const SECURITY_CLAIM =
  /\b(security\s+clean|0\s+open\s+alerts?|code\s*scanning\s+clean|no\s+codeql|codeql\s+clean|security\s+tab\s+clean|all\s+alerts?\s+(fixed|closed|gone))\b/i;

function parseArgs(argv) {
  const out = {
    json: false,
    sessionStart: false,
    preShip: false,
    claim: '',
    strict: false,
    help: false,
    skipNetwork: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--session-start') out.sessionStart = true;
    else if (a === '--pre-ship') out.preShip = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--skip-network') out.skipNetwork = true;
    else if (a === '--claim') out.claim = String(argv[++i] || '');
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function runNode(script, args, timeoutMs = 120_000) {
  if (!fs.existsSync(script)) {
    return { status: 127, stdout: '', stderr: `missing ${path.relative(REPO, script)}` };
  }
  return spawnSync(process.execPath, [script, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function runPatternGate(mode) {
  const args = mode === 'diff' ? ['--diff', 'origin/main', '--json'] : ['--json'];
  const r = runNode(PATTERN_GATE, args, 180_000);
  let report = null;
  try {
    report = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    report = { ok: false, parseError: true, raw: (r.stdout || '').slice(0, 200) };
  }
  return {
    available: fs.existsSync(PATTERN_GATE),
    status: r.status,
    ok: r.status === 0 && report && report.ok !== false && !(report.findingCount > 0),
    report,
    stderr: (r.stderr || '').slice(0, 400),
  };
}

function runAlertSync(strict) {
  if (!fs.existsSync(ALERT_SYNC)) {
    return { available: false, ok: true, skipped: true, reason: 'alert-sync-missing' };
  }
  const env = { ...process.env };
  if (strict) env.CODEQL_GATE_STRICT = '1';
  const r = spawnSync(
    process.execPath,
    [ALERT_SYNC, '--gate', '--max-high', '0', '--max-open', '15', '--json'],
    {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env,
    },
  );
  let body = null;
  try {
    body = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    body = { ok: false, error: 'parse', raw: (r.stdout || r.stderr || '').slice(0, 300) };
  }
  return {
    available: true,
    status: r.status,
    ok: body.ok !== false && (typeof body.open !== 'number' || (body.highish || 0) === 0 || body.open <= 15),
    body,
    soft: r.status !== 0 && !strict,
  };
}

function listOpenAlertsBrief() {
  const r = spawnSync(
    'gh',
    [
      'api',
      'repos/IgorGanapolsky/mac-yolo-safeguards/code-scanning/alerts',
      '--paginate',
      '--jq',
      '[.[] | select(.state=="open") | {n:.number, rule:.rule.id, path:.most_recent_instance.location.path, sev:.rule.security_severity_level}]',
    ],
    { cwd: REPO, encoding: 'utf8', timeout: 45_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || 'gh failed').slice(0, 300), open: null, alerts: [] };
  }
  try {
    const alerts = JSON.parse((r.stdout || '[]').trim() || '[]');
    const highish = alerts.filter((a) => ['high', 'critical', 'error'].includes(String(a.sev || '').toLowerCase()));
    return { ok: true, open: alerts.length, highish: highish.length, alerts: alerts.slice(0, 25) };
  } catch (e) {
    return { ok: false, error: e.message, open: null, alerts: [] };
  }
}

function helpersPresent() {
  const need = [
    'tools/lib/asc-jwt-es256.js',
    'tools/lib/safe-url-host.js',
    'tools/lib/safe-html-strip.js',
    'tools/lib/safe-exec.js',
    'tools/codeql-pattern-gate.js',
  ];
  const missing = need.filter((p) => !fs.existsSync(path.join(REPO, p)));
  return { ok: missing.length === 0, missing };
}

function evaluateClaim(claim, snapshot) {
  if (!claim || !SECURITY_CLAIM.test(claim)) {
    return { applies: false, allow: true, reasons: [] };
  }
  const reasons = [];
  if (snapshot.alerts && snapshot.alerts.skipped) {
    reasons.push(
      'Cannot allow security-clean claim without live GitHub code-scanning API (network skipped or gh unavailable).',
    );
  } else if (snapshot.alerts && !snapshot.alerts.ok) {
    reasons.push(`Cannot verify open alerts: ${snapshot.alerts.error || 'API error'}`);
  } else if (snapshot.alerts && snapshot.alerts.ok && snapshot.alerts.open > 0) {
    reasons.push(
      `Claim implies security clean but GitHub has ${snapshot.alerts.open} open code-scanning alert(s) (highish=${snapshot.alerts.highish}). UI is branch:main only — unmerged PRs do not clear it.`,
    );
  }
  if (snapshot.pattern && !snapshot.pattern.ok) {
    reasons.push(
      `Offline pattern gate dirty (findings=${snapshot.pattern.report?.findingCount ?? '?'}). Fix banned patterns before claiming clean.`,
    );
  }
  if (snapshot.helpers && !snapshot.helpers.ok) {
    reasons.push(`Missing CodeQL helpers: ${snapshot.helpers.missing.join(', ')} — burn-down not on this checkout.`);
  }
  return { applies: true, allow: reasons.length === 0, reasons };
}

function buildSnapshot(args) {
  const helpers = helpersPresent();
  const pattern = helpers.ok
    ? runPatternGate(args.preShip ? 'diff' : 'full')
    : { available: false, ok: false, report: null, status: 127 };
  let alerts = { ok: true, skipped: true, open: null, highish: null, alerts: [] };
  if (!args.skipNetwork) {
    alerts = listOpenAlertsBrief();
  }
  const baseline = fs.existsSync(BASELINE_PATH)
    ? (() => {
        try {
          return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
        } catch {
          return null;
        }
      })()
    : null;

  const snapshot = {
    ok: true,
    ts: new Date().toISOString(),
    playbook: PLAYBOOK,
    helpers,
    pattern: {
      available: pattern.available,
      ok: pattern.ok,
      findingCount: pattern.report?.findingCount ?? null,
      status: pattern.status,
    },
    alerts,
    baseline,
    rules: [
      'Never claim Security tab clean without live gh API open count on main',
      'Unmerged PR fixes do NOT clear branch:main alerts',
      'Use tools/lib/{asc-jwt-es256,safe-url-host,safe-html-strip,safe-exec}.js',
      'Run: node tools/codeql-pattern-gate.js before commit',
      'Run: node tools/codeql-agent-hygiene.js --pre-ship before security ship claims',
      'Dismiss only true FPs via: node tools/codeql-alert-sync.js --dismiss-fps',
    ],
  };

  if (args.claim) {
    snapshot.claim = evaluateClaim(args.claim, snapshot);
    if (snapshot.claim.applies && !snapshot.claim.allow) snapshot.ok = false;
  }

  if (args.preShip) {
    if (!pattern.ok) snapshot.ok = false;
    if (args.strict && alerts.ok && (alerts.highish > 0 || alerts.open > 15)) snapshot.ok = false;
  }

  if (!helpers.ok && args.preShip) snapshot.ok = false;
  if (pattern.available && !pattern.ok) snapshot.ok = false;

  return snapshot;
}

function formatHuman(snapshot, mode) {
  const lines = [];
  const title =
    mode === 'session'
      ? '=== Code scanning hygiene (agent orchestration) ==='
      : '=== codeql-agent-hygiene ===';
  lines.push(title);
  if (!snapshot.helpers.ok) {
    lines.push(`WARN helpers missing: ${snapshot.helpers.missing.join(', ')}`);
    lines.push('  → land/fix CodeQL burn-down PR before claiming security work done');
  } else {
    lines.push(
      `pattern_gate=${snapshot.pattern.ok ? 'PASS' : 'FAIL'} findings=${snapshot.pattern.findingCount ?? '?'}`,
    );
  }
  if (snapshot.alerts.skipped) {
    lines.push('alerts=skipped (--skip-network)');
  } else if (!snapshot.alerts.ok) {
    lines.push(`alerts=API_ERROR ${snapshot.alerts.error || ''}`);
  } else {
    lines.push(
      `open_on_main=${snapshot.alerts.open} highish=${snapshot.alerts.highish} (Security UI is branch:main only)`,
    );
    if (snapshot.alerts.open > 0) {
      for (const a of (snapshot.alerts.alerts || []).slice(0, 8)) {
        lines.push(`  #${a.n} ${a.rule} ${a.path}`);
      }
      if (snapshot.alerts.open > 8) lines.push(`  … +${snapshot.alerts.open - 8} more`);
    }
  }
  if (snapshot.claim && snapshot.claim.applies) {
    lines.push(snapshot.claim.allow ? 'claim=ALLOW' : 'claim=BLOCK');
    for (const r of snapshot.claim.reasons || []) lines.push(`  - ${r}`);
  }
  lines.push(`playbook: ${snapshot.playbook}`);
  lines.push(
    snapshot.ok
      ? 'hygiene=OK'
      : 'hygiene=FAIL — do not claim security clean; fix patterns / merge burn-down / wait for CodeQL rescan on main',
  );
  return lines.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`codeql-agent-hygiene — AI orchestration for Code scanning debt

Usage:
  node tools/codeql-agent-hygiene.js
  node tools/codeql-agent-hygiene.js --json
  node tools/codeql-agent-hygiene.js --session-start
  node tools/codeql-agent-hygiene.js --pre-ship [--strict]
  node tools/codeql-agent-hygiene.js --claim "security clean" [--strict]
  node tools/codeql-agent-hygiene.js --skip-network   # offline pattern gate only
`);
    process.exit(0);
  }

  const snapshot = buildSnapshot(args);

  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    process.stdout.write(formatHuman(snapshot, args.sessionStart ? 'session' : 'default'));
  }

  process.exit(snapshot.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  buildSnapshot,
  evaluateClaim,
  SECURITY_CLAIM,
  parseArgs,
};
