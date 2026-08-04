#!/usr/bin/env node
'use strict';

/**
 * Graph-engineering pipeline: control-plane route auth audit
 *
 * Topology (hello-world graph for Igor stack):
 *
 *   Planner → Worker fan-out (≤N routes) → Verifier fan-out (independent)
 *          → Synthesizer → HumanGate (exit code)
 *
 * Edges are typed data contracts (JSON), not chat history.
 * Writers never grade their own work: Verifier re-reads the file.
 *
 * Usage:
 *   node tools/graph-eng-route-auth-audit.js [--max=20] [--root=apps/hermes-control-plane/app/api]
 *   node tools/graph-eng-route-auth-audit.js --json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── graph contracts ─────────────────────────────────────────────────────────

/**
 * @typedef {{ path: string, rel: string }} RouteTarget
 * @typedef {{
 *   route: string,
 *   methods: string[],
 *   authSignals: string[],
 *   risk: 'low'|'medium'|'high',
 *   notes: string[],
 *   workerHash: string,
 * }} WorkerFinding
 * @typedef {{
 *   route: string,
 *   accepted: boolean,
 *   reason: string,
 *   verifierHash: string,
 *   evidence: string[],
 * }} VerifierVerdict
 */

// Paths relative to repo root (apps/hermes-control-plane/...)
const PUBLIC_ALLOWLIST = new Set([
  'apps/hermes-control-plane/app/api/health/route.ts',
  'apps/hermes-control-plane/app/api/auth/login/route.ts',
  'apps/hermes-control-plane/app/api/auth/callback/route.ts',
  'apps/hermes-control-plane/app/api/auth/logout/route.ts',
  'apps/hermes-control-plane/app/api/analytics/event/route.ts',
  'apps/hermes-control-plane/app/api/billing/webhook/route.ts',
  'apps/hermes-control-plane/app/api/continuity/status/route.ts',
  'apps/hermes-control-plane/app/api/billing/plan/route.ts',
]);

const AUTH_SIGNAL_PATTERNS = [
  { id: 'session', re: /\b(getSession|requireSession|session\.|withSession)\b/ },
  { id: 'bearer', re: /authorization.*Bearer|Bearer\s+|headers\.get\(["']authorization/i },
  { id: 'device', re: /\b(requireDevice|device-auth|deviceAuth)\b/ },
  { id: 'runner_token', re: /RUNNER_|DEVICE_TOKEN|device.?token|assertRunner|assertDevice/i },
  { id: 'admin', re: /requireAdmin|adminSession|currentAdminSession|admin-auth|ADMIN_/ },
  { id: 'webhook_sig', re: /stripe.*signature|constructEvent|webhook.*secret|svix/i },
  { id: 'pairing', re: /pairing|device_code|user_code/i },
  { id: 'workos', re: /WORKOS_|createSignedAuthState|verifySignedAuthState/ },
];

// ── nodes ───────────────────────────────────────────────────────────────────

function nodePlanner(rootDir, maxFiles) {
  const absRoot = path.resolve(REPO_ROOT, rootDir);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`Planner: root not found: ${rootDir}`);
  }
  /** @type {RouteTarget[]} */
  const targets = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === 'route.ts') {
        const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
        targets.push({ path: full, rel });
      }
    }
  }
  walk(absRoot);
  targets.sort((a, b) => a.rel.localeCompare(b.rel));
  const selected = targets.slice(0, maxFiles);
  return {
    node: 'planner',
    root: rootDir,
    totalFound: targets.length,
    selected: selected.map((t) => t.rel),
    targets: selected,
    dropped: Math.max(0, targets.length - selected.length),
  };
}

function detectMethods(source) {
  const methods = [];
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    if (new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(source)
      || new RegExp(`export\\s+function\\s+${m}\\b`).test(source)
      || new RegExp(`export\\s+const\\s+${m}\\b`).test(source)) {
      methods.push(m);
    }
  }
  return methods;
}

function detectAuthSignals(source) {
  const hits = [];
  for (const p of AUTH_SIGNAL_PATTERNS) {
    if (p.re.test(source)) hits.push(p.id);
  }
  return hits;
}

/** Worker: one route → finding (writer). */
function nodeWorker(target) {
  const source = fs.readFileSync(target.path, 'utf8');
  const methods = detectMethods(source);
  const authSignals = detectAuthSignals(source);
  const isPublic = PUBLIC_ALLOWLIST.has(target.rel)
    || /\/health\/|\/auth\/login|\/auth\/callback|webhook/i.test(target.rel);
  const notes = [];
  let risk = 'low';

  if (!isPublic && authSignals.length === 0) {
    risk = 'high';
    notes.push('No auth signal patterns detected on a non-allowlisted route');
  } else if (!isPublic && authSignals.length === 1 && authSignals[0] === 'workos' && !authSignals.includes('session')) {
    risk = 'medium';
    notes.push('WorkOS config present but no session gate pattern detected');
  } else if (isPublic) {
    notes.push('Allowlisted public/auth surface');
  }

  if (methods.length === 0) {
    notes.push('No exported HTTP method handlers detected (may use alternate export style)');
    if (risk === 'low') risk = 'medium';
  }

  const workerHash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  /** @type {WorkerFinding} */
  const finding = {
    route: target.rel,
    methods,
    authSignals,
    risk,
    notes,
    workerHash,
  };
  return finding;
}

/**
 * Verifier: independent re-read; must not trust worker notes blindly.
 * Accepts high only if re-scan also finds zero auth signals and not allowlisted.
 */
function nodeVerifier(finding) {
  const abs = path.join(REPO_ROOT, finding.route);
  /** @type {VerifierVerdict} */
  const base = {
    route: finding.route,
    accepted: false,
    reason: '',
    verifierHash: '',
    evidence: [],
  };
  if (!fs.existsSync(abs)) {
    base.reason = 'file_missing';
    return base;
  }
  const source = fs.readFileSync(abs, 'utf8');
  base.verifierHash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);

  // Dual-witness: hashes must match what worker claimed to have read
  if (finding.workerHash && finding.workerHash !== base.verifierHash) {
    base.reason = 'hash_mismatch_worker_stale';
    base.evidence.push(`worker=${finding.workerHash} verifier=${base.verifierHash}`);
    return base;
  }

  const signals = detectAuthSignals(source);
  const isPublic = PUBLIC_ALLOWLIST.has(finding.route)
    || /\/health\/|\/auth\/login|\/auth\/callback|webhook/i.test(finding.route);

  if (finding.risk === 'high') {
    if (isPublic) {
      base.reason = 'rejected_public_allowlist';
      base.evidence.push('route is public/auth allowlisted');
      return base;
    }
    if (signals.length > 0) {
      base.reason = 'rejected_auth_signals_present';
      base.evidence.push(`signals=${signals.join(',')}`);
      return base;
    }
    base.accepted = true;
    base.reason = 'confirmed_no_auth_signals';
    base.evidence.push('independent re-scan found zero auth patterns');
    return base;
  }

  if (finding.risk === 'medium') {
    // Medium needs confirmation of missing session despite other signals
    if (!signals.includes('session') && !signals.includes('bearer') && !signals.includes('runner_token') && !signals.includes('admin') && !signals.includes('webhook_sig')) {
      base.accepted = true;
      base.reason = 'confirmed_weak_auth_surface';
      base.evidence.push(`signals=${signals.join(',') || 'none'}`);
      return base;
    }
    base.reason = 'rejected_adequate_signals';
    base.evidence.push(`signals=${signals.join(',')}`);
    return base;
  }

  base.reason = 'low_risk_no_confirm_needed';
  base.accepted = false; // low-risk findings are not "confirmed issues"
  return base;
}

function nodeSynthesizer(plan, findings, verdicts) {
  const confirmed = [];
  const rejected = [];
  const byRoute = new Map(verdicts.map((v) => [v.route, v]));
  for (const f of findings) {
    const v = byRoute.get(f.route);
    if (v && v.accepted) confirmed.push({ finding: f, verdict: v });
    else if (f.risk !== 'low') rejected.push({ finding: f, verdict: v || null });
  }
  confirmed.sort((a, b) => a.finding.route.localeCompare(b.finding.route));

  const receipt = {
    schema: 'graph-eng/route-auth-audit-v1',
    graph: {
      nodes: ['planner', 'worker', 'verifier', 'synthesizer', 'human_gate'],
      edges: [
        { from: 'planner', to: 'worker', contract: 'RouteTarget[]' },
        { from: 'worker', to: 'verifier', contract: 'WorkerFinding' },
        { from: 'verifier', to: 'synthesizer', contract: 'VerifierVerdict' },
        { from: 'synthesizer', to: 'human_gate', contract: 'AuditReport' },
      ],
    },
    generatedAt: new Date().toISOString(),
    plan: {
      root: plan.root,
      totalFound: plan.totalFound,
      selectedCount: plan.selected.length,
      dropped: plan.dropped,
    },
    metrics: {
      workers: findings.length,
      verifiers: verdicts.length,
      confirmedHighOrMedium: confirmed.length,
      rejectedByVerifier: rejected.length,
    },
    confirmed: confirmed.map((c) => ({
      route: c.finding.route,
      risk: c.finding.risk,
      methods: c.finding.methods,
      authSignals: c.finding.authSignals,
      notes: c.finding.notes,
      verifierReason: c.verdict.reason,
      evidence: c.verdict.evidence,
    })),
    rejected: rejected.map((r) => ({
      route: r.finding.route,
      risk: r.finding.risk,
      reason: r.verdict?.reason || 'no_verdict',
    })),
  };
  return receipt;
}

/** Human gate: expensive mistakes — exit non-zero when confirmed issues exist. */
function nodeHumanGate(report) {
  const needsHuman = report.confirmed.length > 0;
  return {
    node: 'human_gate',
    needsHuman,
    action: needsHuman
      ? 'REVIEW_REQUIRED: confirmed auth-surface findings before deploy'
      : 'PASS: no confirmed auth gaps in selected routes',
    exitCode: needsHuman ? 2 : 0,
  };
}

// ── orchestration ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  let max = 20;
  let root = 'apps/hermes-control-plane/app/api';
  let json = false;
  let out = null;
  for (const a of argv) {
    if (a.startsWith('--max=')) max = Math.max(1, parseInt(a.slice(6), 10) || 20);
    else if (a.startsWith('--root=')) root = a.slice(7);
    else if (a === '--json') json = true;
    else if (a.startsWith('--out=')) out = a.slice(6);
  }
  return { max, root, json, out };
}

function runPipeline(options = {}) {
  const t0 = performance.now();
  const max = options.max ?? 20;
  const root = options.root ?? 'apps/hermes-control-plane/app/api';

  // Phase 1 — Planner (sequential)
  const plan = nodePlanner(root, max);

  // Phase 2 — Worker fan-out (parallel-capable; deterministic map)
  const findings = plan.targets.map((t) => nodeWorker(t));

  // Phase 3 — Verifier fan-out (independent; only non-low risk need adversarial check,
  // but we still run verifiers on all high/medium)
  const toVerify = findings.filter((f) => f.risk !== 'low');
  const verdicts = toVerify.map((f) => nodeVerifier(f));

  // Phase 4 — Synthesizer
  const report = nodeSynthesizer(plan, findings, verdicts);
  report.metrics.durationMs = Math.round(performance.now() - t0);

  // Phase 5 — Human gate
  const gate = nodeHumanGate(report);
  report.humanGate = gate;

  return report;
}

function formatHuman(report) {
  const lines = [];
  lines.push('# Route auth audit graph');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Root: ${report.plan.root} (${report.plan.selectedCount}/${report.plan.totalFound} routes, dropped ${report.plan.dropped})`);
  lines.push(`Duration: ${report.metrics.durationMs}ms`);
  lines.push('');
  lines.push('## Graph');
  lines.push('```');
  lines.push('Planner → Worker×N → Verifier×M → Synthesizer → HumanGate');
  lines.push('```');
  lines.push('');
  lines.push(`## Human gate: ${report.humanGate.action}`);
  lines.push('');
  if (report.confirmed.length === 0) {
    lines.push('No confirmed high/medium auth gaps (after independent verification).');
  } else {
    lines.push(`### Confirmed (${report.confirmed.length})`);
    for (const c of report.confirmed) {
      lines.push(`- **${c.route}** risk=${c.risk} methods=[${c.methods.join(',')}] signals=[${c.authSignals.join(',') || 'none'}]`);
      lines.push(`  - verifier: ${c.verifierReason}`);
      for (const n of c.notes) lines.push(`  - note: ${n}`);
    }
  }
  if (report.rejected.length) {
    lines.push('');
    lines.push(`### Rejected by verifier (${report.rejected.length})`);
    for (const r of report.rejected) {
      lines.push(`- ${r.route} (${r.risk}): ${r.reason}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = runPipeline(opts);
  const text = formatHuman(report);
  if (opts.out) {
    const abs = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, opts.json ? JSON.stringify(report, null, 2) : text);
  }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(text);
  }
  process.exit(report.humanGate.exitCode);
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    runPipeline,
    nodePlanner,
    nodeWorker,
    nodeVerifier,
    nodeSynthesizer,
    nodeHumanGate,
    fingerprintCommand: null,
    PUBLIC_ALLOWLIST,
    AUTH_SIGNAL_PATTERNS,
  };
}
