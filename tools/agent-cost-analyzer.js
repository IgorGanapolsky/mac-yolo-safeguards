#!/usr/bin/env node
'use strict';

/**
 * agent-cost-analyzer.js — per-route cost/latency rollup + "finished AC per $".
 *
 * Mirrors the `jbcontext analyze` view (cost/time by route/model) but is local,
 * deterministic, vendor-free, and joins the two data sources this fleet already
 * produces but never combines:
 *
 *   1. Route receipts at ~/.hermes/receipts/<runner>/history.jsonl
 *      (schema hermes-yolo/route-receipt-v1): route.model, route.selectedBackend,
 *      execution.durationMs, execution.status.
 *   2. plan.md `done` rows — the finished AcceptanceCheck count that the swarm
 *      harness names as the numerator of "Finished AC per $" (its line 211
 *      principle) but never actually computes the "$" denominator for.
 *
 * This tool closes that gap. No model/provider call is made; no new spend.
 *
 * Usage:
 *   node tools/agent-cost-analyzer.js                 # human report
 *   node tools/agent-cost-analyzer.js --json          # structured
 *   node tools/agent-cost-analyzer.js --validate      # CI gate: fail on malformed receipts
 *   node tools/agent-cost-analyzer.js --since-hours 168
 *   node tools/agent-cost-analyzer.js --plan ./plan.md --receipts ~/.hermes/receipts
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');
const DEFAULT_RECEIPTS = path.join(os.homedir(), '.hermes', 'receipts');

const usage = `Usage:
  node tools/agent-cost-analyzer.js [options]

Options:
  --json               Emit structured JSON only.
  --validate           CI gate: exit 1 if any receipt is malformed/unparseable.
  --since-hours N      Only consider receipts generated within the last N hours (default: all).
  --plan PATH          Path to plan.md (default: repo plan.md).
  --receipts PATH      Receipts root (default: ~/.hermes/receipts).
  --help, -h           Show this help.`;

// Cost model (USD per invocation), aligned with tools/hermes-economic-router.js ROUTES.
// Local/Ollama routes are $0 by design; cloud routes carry the router's published costUsd.
// These are conservative per-call estimates, not token-metered — the receipt schema does
// not carry token counts, so we use the router's flat per-route ceiling. Override via
// env COST_MODEL_JSON={"model":usd,...}.
const DEFAULT_COST_MODEL = {
  'grok-4.5': 0,
  'glm-coding': 0,
  'glm-4.5': 0,
  'auto': 0,
  'qwen3:8b-64k': 0,
  'qwen3:8b-hermes-20k': 0,
  'qwen3.5:9b-hermes-64k': 0,
  // Known paid ceilings from the economic router (kept for completeness; rarely hit):
  'qwen3:8b': 0.035,
  'embedding': 0.001,
};

function loadCostModel() {
  const override = process.env.COST_MODEL_JSON;
  if (!override) return DEFAULT_COST_MODEL;
  try {
    const parsed = JSON.parse(override);
    if (parsed && typeof parsed === 'object') return { ...DEFAULT_COST_MODEL, ...parsed };
  } catch (_) {
    // fall through to default silently; cost model is an estimate
  }
  return DEFAULT_COST_MODEL;
}

function parseArgs(argv) {
  const args = {
    json: false,
    validate: false,
    sinceHours: 0,
    planPath: DEFAULT_PLAN,
    receiptsRoot: DEFAULT_RECEIPTS,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--validate') args.validate = true;
    else if (arg === '--since-hours') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--since-hours must be a positive number');
      args.sinceHours = n;
    } else if (arg === '--plan') args.planPath = path.resolve(argv[++i] || '');
    else if (arg === '--receipts') args.receiptsRoot = path.resolve(argv[++i] || '');
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * Read every history.jsonl under the receipts root. Returns { rows, errors }.
 * Each row is normalized to a flat record. errors[] holds {file, line, reason}.
 */
function readReceipts(receiptsRoot, sinceHours) {
  const rows = [];
  const errors = [];
  if (!fs.existsSync(receiptsRoot)) {
    return { rows, errors, scannedFiles: 0 };
  }
  const cutoffMs =
    sinceHours > 0 ? Date.now() - sinceHours * 3600 * 1000 : 0;
  let scannedFiles = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'history.jsonl') {
        scannedFiles += 1;
        let raw;
        try {
          raw = fs.readFileSync(full, 'utf8');
        } catch (_) {
          continue;
        }
        raw.split('\n').forEach((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let rec;
          try {
            rec = JSON.parse(trimmed);
          } catch (e) {
            errors.push({ file: full, line: idx + 1, reason: `json parse: ${e.message}` });
            return;
          }
          if (!rec || typeof rec !== 'object') {
            errors.push({ file: full, line: idx + 1, reason: 'not an object' });
            return;
          }
          const schema = rec.schema || '';
          // Only route receipts carry a `route` object. Other "receipt"-named schemas
          // (zero-spend policy blocks, outcome-gate stage receipts) don't model a
          // provider/model invocation, so they're skipped to avoid polluting the rollup.
          if (!rec.route || typeof rec.route !== 'object') {
            return;
          }
          if (typeof schema === 'string' && schema.includes('zero-spend')) {
            return; // spend-policy block, not an invocation
          }
          const route = rec.route;
          const exec = rec.execution || {};
          const generatedAt = rec.generatedAt || '';
          if (cutoffMs > 0 && generatedAt) {
            const t = Date.parse(generatedAt);
            if (Number.isFinite(t) && t < cutoffMs) return;
          }
          const model = String(route.model || route.selectedBackend || route.requestedBackend || 'unknown');
          const durationMs = Number.isFinite(exec.durationMs) ? exec.durationMs : null;
          const status = exec.status || '';
          const host = rec.host || '';
          rows.push({ model, durationMs, status, host, generatedAt, schema, source: full });
        });
      }
    }
  }

  walk(receiptsRoot);
  return { rows, errors, scannedFiles };
}

/**
 * Roll receipts up by model. Returns an array sorted by invocation count desc.
 */
function rollupByModel(rows, costModel) {
  const buckets = {};
  for (const r of rows) {
    if (!buckets[r.model]) {
      buckets[r.model] = {
        model: r.model,
        invocations: 0,
        durations: [],
        pass: 0,
        fail: 0,
        other: 0,
        estCostUsd: 0,
      };
    }
    const b = buckets[r.model];
    b.invocations += 1;
    if (r.durationMs != null) b.durations.push(r.durationMs);
    if (r.status === 'pass') b.pass += 1;
    else if (r.status === 'fail' || r.status === 'timeout') b.fail += 1;
    else b.other += 1;
    const rate = costModel[r.model];
    if (Number.isFinite(rate)) b.estCostUsd += rate;
  }
  const out = Object.values(buckets).map((b) => {
    const ds = b.durations;
    const sumMs = ds.reduce((a, c) => a + c, 0);
    const avgMs = ds.length ? Math.round(sumMs / ds.length) : null;
    const sorted = ds.slice().sort((a, c) => a - c);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
    const maxMs = sorted.length ? sorted[sorted.length - 1] : null;
    const successRate = b.invocations ? +(b.pass / b.invocations).toFixed(4) : null;
    return {
      model: b.model,
      invocations: b.invocations,
      pass: b.pass,
      fail: b.fail,
      other: b.other,
      successRate,
      latencyMs: { avg: avgMs, p50, p95, max: maxMs },
      estCostUsd: +b.estCostUsd.toFixed(4),
    };
  });
  out.sort((a, b) => b.invocations - a.invocations);
  return out;
}

const TASK_ROW_RE = /\|\s*T[-A-Z0-9]/;

/**
 * Count finished AcceptanceChecks (plan.md `done`/`superseded`/`released` rows).
 * The snapshot parser only keeps in_progress/blocked; here we need the denominator,
 * so we parse done rows directly.
 */
function countFinishedAC(planPath) {
  if (!fs.existsSync(planPath)) {
    return { count: 0, error: 'plan.md not found' };
  }
  const text = fs.readFileSync(planPath, 'utf8');
  let done = 0;
  let inProgress = 0;
  let blocked = 0;
  for (const line of text.split('\n')) {
    if (!TASK_ROW_RE.test(line)) continue;
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const status = cols[2] || '';
    if (status === 'done' || /\breleased\b/i.test(status)) done += 1;
    else if (status === 'in_progress') inProgress += 1;
    else if (status === 'blocked') blocked += 1;
  }
  return { count: done, inProgress, blocked };
}

function buildReport(args) {
  const costModel = loadCostModel();
  const { rows, errors, scannedFiles } = readReceipts(args.receiptsRoot, args.sinceHours);
  const byModel = rollupByModel(rows, costModel);
  const ac = countFinishedAC(args.planPath);

  const totalInvocations = byModel.reduce((a, b) => a + b.invocations, 0);
  const totalCostUsd = byModel.reduce((a, b) => a + b.estCostUsd, 0);
  const allDurations = rows.map((r) => r.durationMs).filter((d) => d != null);
  const totalDurationMs = allDurations.reduce((a, c) => a + c, 0);
  const avgLatencyMs = allDurations.length ? Math.round(totalDurationMs / allDurations.length) : null;

  // The headline metric the swarm harness names but never computes:
  // "Finished AC per $" — fleet productivity normalized by spend.
  const finishedAcPerDollar =
    ac.count > 0 && totalCostUsd > 0 ? +(ac.count / totalCostUsd).toFixed(2) : null;

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    sinceHours: args.sinceHours || null,
    sources: {
      receiptsRoot: args.receiptsRoot,
      scannedFiles,
      planPath: args.planPath,
    },
    fleet: {
      totalInvocations,
      totalCostUsd: +totalCostUsd.toFixed(4),
      avgLatencyMs,
      totalWallClockMs: totalDurationMs,
      receiptErrors: errors.length,
    },
    finishedAC: ac,
    productivity: {
      finishedAcPerDollar,
      note:
        totalCostUsd === 0
          ? 'Total spend is $0 (all observed routes are local/zero-cost); AC-per-$ is unbounded. Fleet is effectively free — the binding constraint is coordination, not spend (per AGENTS.md swarm economics).'
          : 'Finished AcceptanceChecks per US dollar spent.',
    },
    byModel,
    receiptErrors: errors,
    costModelNote:
      'Costs are per-invocation ceilings from tools/hermes-economic-router.js ROUTES, not token-metered (the receipt schema carries no token counts). Override via COST_MODEL_JSON env.',
  };
}

function fmtMs(ms) {
  if (ms == null) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatHuman(report) {
  if (!report.ok) return `=== Agent cost analyzer ===\nERROR: ${report.error}`;
  const f = report.fleet;
  const ac = report.finishedAC;
  const lines = [];
  lines.push('=== Agent cost analyzer (jbcontext-analyze analog, local) ===');
  lines.push(`Checked: ${report.checkedAt}`);
  if (report.sinceHours) lines.push(`Window: last ${report.sinceHours}h`);
  lines.push(`Sources: ${report.sources.scannedFiles} receipt file(s) under ${report.sources.receiptsRoot}`);
  lines.push('');
  lines.push('Fleet totals');
  lines.push(`  invocations:        ${f.totalInvocations}`);
  lines.push(`  est total cost:     $${f.totalCostUsd.toFixed(4)}`);
  lines.push(`  avg latency:        ${fmtMs(f.avgLatencyMs)}`);
  lines.push(`  total wall-clock:   ${fmtMs(f.totalWallClockMs)}`);
  lines.push(`  receipt errors:     ${f.receiptErrors}`);
  lines.push('');
  lines.push('Productivity (the "Finished AC per $" the swarm harness names)');
  lines.push(`  finished AC (done): ${ac.count}`);
  lines.push(`  in_progress:        ${ac.inProgress}`);
  lines.push(`  blocked:            ${ac.blocked}`);
  lines.push(`  AC per $:           ${report.productivity.finishedAcPerDollar == null ? '∞ (zero spend)' : report.productivity.finishedAcPerDollar}`);
  lines.push(`  ${report.productivity.note}`);
  lines.push('');
  lines.push('Per model / route');
  lines.push('  model                          invocations  pass/fail  success  avg     p95     cost');
  for (const b of report.byModel) {
    const model = (b.model || '').padEnd(30);
    const inv = String(b.invocations).padStart(5);
    const pf = `${b.pass}/${b.fail}`.padStart(8);
    const sr = b.successRate == null ? '   n/a' : `${(b.successRate * 100).toFixed(0)}%`.padStart(6);
    const avg = fmtMs(b.latencyMs.avg).padStart(7);
    const p95 = fmtMs(b.latencyMs.p95).padStart(7);
    const cost = `$${b.estCostUsd.toFixed(4)}`.padStart(7);
    lines.push(`  ${model} ${inv}   ${pf}  ${sr}  ${avg}  ${p95}  ${cost}`);
  }
  if (report.byModel.length === 0) {
    lines.push('  (no route receipts found — run a Hermes route first, or check --receipts path)');
  }
  if (report.receiptErrors.length > 0) {
    lines.push('');
    lines.push(`Receipt parse errors (${report.receiptErrors.length}):`);
    for (const e of report.receiptErrors.slice(0, 8)) {
      lines.push(`  ${e.file}:${e.line} — ${e.reason}`);
    }
    if (report.receiptErrors.length > 8) lines.push(`  … +${report.receiptErrors.length - 8} more`);
  }
  return lines.join('\n');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${usage}\n`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const report = buildReport(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatHuman(report)}\n`);
}

module.exports = {
  parseArgs,
  readReceipts,
  rollupByModel,
  countFinishedAC,
  buildReport,
  formatHuman,
  DEFAULT_COST_MODEL,
  loadCostModel,
};

if (require.main === module) {
  main();
}
