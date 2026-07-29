#!/usr/bin/env node
'use strict';

/**
 * weekly-kpi-decision-loop.js — KPI dashboard → decisions → tickets.
 *
 * Domo/Vibe-style weekly review: each KPI has a question, thresholds, and a
 * playbook. Red/yellow KPIs produce ≤ max_actions tickets with owner, deadline,
 * expected impact, and a command hint. Never invent cash.
 *
 * Usage:
 *   node tools/weekly-kpi-decision-loop.js [--json] [--markdown] [--offline]
 *   node tools/weekly-kpi-decision-loop.js --write   # receipts under ~/.hermes/receipts/kpi-weekly/
 *   node tools/weekly-kpi-decision-loop.js --max-actions 5
 *
 * Exit: 0 always when report builds (ops tool); 1 only on hard probe crash/misconfig.
 *
 * Primary product: ThumbGate.app Continuity (config/kpi-weekly-loop.json).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CONFIG = path.join(REPO, 'config/kpi-weekly-loop.json');
const CONTENT_LOG = path.join(REPO, 'docs/social/hermes-mobile-content-log.tsv');
const RECEIPT = path.join(os.homedir(), '.hermes/receipts/tinker-brain/revenue-receipt.json');
const OUT_DIR = path.join(os.homedir(), '.hermes/receipts/kpi-weekly');

function parseArgs(argv) {
  const args = {
    json: false,
    markdown: true,
    offline: false,
    write: false,
    maxActions: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') {
      args.json = true;
      args.markdown = false;
    } else if (a === '--markdown') args.markdown = true;
    else if (a === '--offline') args.offline = true;
    else if (a === '--write') args.write = true;
    else if (a === '--max-actions') args.maxActions = Number(argv[++i]) || 5;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'weekly-kpi-decision-loop/1 (+https://thumbgate.app)',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ ok: false, status: res.statusCode, body: null, error: 'invalid_json' });
          }
        });
      },
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

function contentLogLive14d() {
  if (!fs.existsSync(CONTENT_LOG)) {
    return { missing: true, liveCount14d: 0, rows: 0 };
  }
  const lines = fs.readFileSync(CONTENT_LOG, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { missing: false, liveCount14d: 0, rows: 0 };
  const header = lines[0].split('\t');
  const idxStatus = header.findIndex((h) => /status/i.test(h));
  const idxDate = header.findIndex((h) => /date|when|ts|published/i.test(h));
  const idxUrl = header.findIndex((h) => /url|link|permalink/i.test(h));
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  let live = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    const status = (cols[idxStatus] || '').toLowerCase();
    const url = cols[idxUrl] || '';
    const dateRaw = cols[idxDate] || '';
    const isLive =
      /live|published|posted/.test(status) ||
      (/https?:\/\//.test(url) && !/draft|partial|failed/.test(status));
    if (!isLive) continue;
    const t = Date.parse(dateRaw);
    if (!Number.isFinite(t) || t >= cutoff) live += 1;
  }
  return { missing: false, liveCount14d: live, rows: lines.length - 1 };
}

function probeRevenue() {
  const rec = loadJson(RECEIPT);
  if (!rec) {
    return {
      value: 0,
      display: '$0.00 (no receipt — fail-closed)',
      evidence: 'missing ~/.hermes/receipts/tinker-brain/revenue-receipt.json',
    };
  }
  const cents =
    rec.external_net_cents ??
    rec.external_cents ??
    rec.externalCents ??
    rec.non_owner_cents ??
    0;
  const usd = Number(cents) / 100;
  return {
    value: usd,
    display: `$${usd.toFixed(2)} (source=${rec.source || 'receipt'})`,
    evidence: `receipt reconciled_at=${rec.reconciled_at || rec.reconciledAt || 'n/a'}`,
  };
}

function probeContentLog() {
  const s = contentLogLive14d();
  return {
    value: s.liveCount14d,
    display: `${s.liveCount14d} LIVE-ish rows in 14d (log rows=${s.rows}${s.missing ? ', log missing' : ''})`,
    evidence: CONTENT_LOG,
  };
}

async function probeBilling(offline) {
  if (offline) {
    return {
      value: 0,
      display: 'skipped (offline)',
      evidence: 'TINKER/offline — re-run without --offline',
      skipped: true,
    };
  }
  const r = await httpGetJson('https://thumbgate.app/api/billing/plan');
  if (!r.ok || !r.body) {
    return {
      value: 0,
      display: `unreachable (${r.error || r.status})`,
      evidence: 'GET /api/billing/plan failed',
    };
  }
  const active =
    r.body.active === true ||
    r.body.configured === true ||
    typeof r.body.unitAmount === 'number' ||
    typeof r.body.price_cents === 'number' ||
    (r.body.plan && typeof r.body.plan.unitAmount === 'number');
  const cents =
    r.body.unitAmount ??
    r.body.price_cents ??
    r.body.priceCents ??
    (r.body.plan && r.body.plan.unitAmount);
  return {
    value: active ? 1 : 0,
    display: active
      ? `OK${cents != null ? ` · ${cents} cents` : ''}`
      : 'plan present but not active/configured',
    evidence: 'https://thumbgate.app/api/billing/plan',
  };
}

function probeFunnelCritical(offline) {
  const script = path.join(REPO, 'tools/funnel-stage-health.js');
  if (!fs.existsSync(script)) {
    // Not yet on every branch/main — skip rather than fake a critical meltdown.
    return {
      value: 0,
      display: 'skipped (funnel-stage-health.js not in this tree)',
      evidence: script,
      skipped: true,
    };
  }
  const args = [script, '--json'];
  if (offline) args.push('--offline');
  const run = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  let body = null;
  try {
    body = JSON.parse(run.stdout || 'null');
  } catch {
    return {
      value: 99,
      display: `probe parse fail exit=${run.status}`,
      evidence: (run.stderr || run.stdout || '').slice(0, 200),
    };
  }
  const fails = Array.isArray(body.criticalFails) ? body.criticalFails.length : body.criticalFails || 0;
  return {
    value: Number(fails) || 0,
    display: `${fails} critical fail(s); overall ok=${body.ok}`,
    evidence: 'node tools/funnel-stage-health.js --json',
  };
}

function probeRetrieval() {
  // Composite 0..1 from grepae canary + lessons doctor if present
  let grepaeOk = 0.5;
  let lessonsScore = 0.5;
  const canary = path.join(REPO, 'tools/grepai-index-canary.js');
  if (fs.existsSync(canary)) {
    const run = spawnSync(process.execPath, [canary, '--json'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 45_000,
    });
    try {
      const j = JSON.parse(run.stdout || '{}');
      grepaeOk = j.ok ? 1 : 0;
    } catch {
      grepaeOk = 0;
    }
  }
  const doctor = path.join(REPO, 'tools/thumbgate-lessons-doctor.js');
  if (fs.existsSync(doctor)) {
    const homeDir = path.join(os.homedir(), '.thumbgate');
    const args = [doctor, '--json'];
    if (fs.existsSync(homeDir)) args.push('--dir', homeDir);
    const run = spawnSync(process.execPath, args, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    try {
      const j = JSON.parse(run.stdout || '{}');
      if (j.ok) lessonsScore = 1;
      else if (j.storeDrift && typeof j.storeDrift.coverage === 'number') {
        lessonsScore = Math.min(1, Math.max(0, j.storeDrift.coverage));
      } else lessonsScore = 0.2;
    } catch {
      lessonsScore = 0.3;
    }
  }
  const value = Number((0.55 * grepaeOk + 0.45 * lessonsScore).toFixed(3));
  return {
    value,
    display: `grepae=${grepaeOk === 1 ? 'ok' : 'bad'} · lessons_cov≈${lessonsScore.toFixed(2)} · score=${value}`,
    evidence: 'grepai-index-canary + thumbgate-lessons-doctor',
  };
}

function colorFor(kpi, value) {
  const t = kpi.thresholds || {};
  if (kpi.unit === 'fail_count') {
    if (value <= (t.green_max ?? 0)) return 'green';
    if (value <= (t.yellow_max ?? 1)) return 'yellow';
    return 'red';
  }
  // higher-is-better
  if (value >= (t.green_min ?? 1)) return 'green';
  if (value >= (t.yellow_min ?? 0)) return 'yellow';
  return 'red';
}

function pickPlaybookAction(kpi, color, usedIds) {
  if (color === 'green') return null;
  const plays = kpi.playbook || [];
  for (const p of plays) {
    if (!usedIds.has(p.id)) {
      usedIds.add(p.id);
      return p;
    }
  }
  return plays[0] || null;
}

function deadlineIso(daysFromNow = 7) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function buildReport(args) {
  const config = loadJson(CONFIG);
  if (!config || !Array.isArray(config.kpis)) {
    throw new Error(`missing or invalid ${CONFIG}`);
  }
  const maxActions = args.maxActions || config.max_actions_per_week || 5;

  const probes = {
    revenue_receipt: () => probeRevenue(),
    content_log_live_14d: () => probeContentLog(),
    billing_plan: () => probeBilling(args.offline),
    funnel_critical_fails: () => probeFunnelCritical(args.offline),
    retrieval_stack: () => probeRetrieval(),
  };

  const kpiResults = [];
  for (const kpi of config.kpis) {
    const fn = probes[kpi.probe];
    const raw = fn ? await fn() : { value: 0, display: 'unknown probe', evidence: kpi.probe };
    const value = Number(raw.value);
    const color = raw.skipped ? 'yellow' : colorFor(kpi, value);
    kpiResults.push({
      id: kpi.id,
      name: kpi.name,
      question: kpi.question,
      unit: kpi.unit,
      value,
      display: raw.display,
      evidence: raw.evidence,
      color,
      thresholds: kpi.thresholds,
      playbook: kpi.playbook,
      skipped: Boolean(raw.skipped),
    });
  }

  // Rank red first, then yellow; one action each until max
  const ordered = [...kpiResults].sort((a, b) => {
    const rank = { red: 0, yellow: 1, green: 2 };
    return (rank[a.color] ?? 3) - (rank[b.color] ?? 3);
  });

  const usedPlayIds = new Set();
  const tickets = [];
  for (const k of ordered) {
    if (tickets.length >= maxActions) break;
    if (k.color === 'green') continue;
    const play = pickPlaybookAction(
      config.kpis.find((x) => x.id === k.id) || k,
      k.color,
      usedPlayIds,
    );
    if (!play) continue;
    tickets.push({
      id: `kpi-${k.id}-${play.id}`,
      kpi_id: k.id,
      kpi_color: k.color,
      title: play.title,
      owner: 'agent+igor',
      deadline: deadlineIso(7),
      expected_impact: play.expected_impact,
      command_hint: play.command_hint,
      decision_question: k.question,
      measured: k.display,
    });
  }

  const reds = kpiResults.filter((k) => k.color === 'red').length;
  const yellows = kpiResults.filter((k) => k.color === 'yellow').length;

  return {
    schema_version: 'kpi-weekly-decision/1',
    as_of: utcNow(),
    product: config.product,
    decision_question: config.decision_question,
    offline: args.offline,
    summary: {
      red: reds,
      yellow: yellows,
      green: kpiResults.filter((k) => k.color === 'green').length,
      tickets: tickets.length,
      max_actions: maxActions,
    },
    kpis: kpiResults.map(({ playbook, ...rest }) => rest),
    tickets,
    review_protocol: [
      '1. Scan only these KPIs (ignore vanity).',
      '2. For each red/yellow, one playbook action max.',
      '3. Execute tickets this week; re-measure next review.',
      '4. Cash counts only on non-owner Stripe (never invent).',
    ],
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Weekly KPI decision review · ${report.as_of}`);
  lines.push('');
  lines.push(`**Product:** ${report.product}`);
  lines.push(`**Decision question:** ${report.decision_question}`);
  lines.push(
    `**Scoreboard:** 🔴 ${report.summary.red} · 🟡 ${report.summary.yellow} · 🟢 ${report.summary.green} · tickets ${report.summary.tickets}/${report.summary.max_actions}`,
  );
  lines.push('');
  lines.push('| KPI | Status | Measured | Question |');
  lines.push('|-----|--------|----------|----------|');
  for (const k of report.kpis) {
    const emoji = k.color === 'red' ? '🔴' : k.color === 'yellow' ? '🟡' : '🟢';
    lines.push(
      `| ${k.name} | ${emoji} ${k.color} | ${String(k.display).replace(/\|/g, '/')} | ${k.question} |`,
    );
  }
  lines.push('');
  lines.push('## Tickets (must-do this week)');
  lines.push('');
  if (!report.tickets.length) {
    lines.push('_No red/yellow actions — maintain green; still ship the campaign beat habit._');
  } else {
    let i = 1;
    for (const t of report.tickets) {
      lines.push(`### ${i}. ${t.title}`);
      lines.push(`- **KPI:** ${t.kpi_id} (${t.kpi_color}) — ${t.measured}`);
      lines.push(`- **Owner:** ${t.owner}`);
      lines.push(`- **Deadline:** ${t.deadline}`);
      lines.push(`- **Expected impact:** ${t.expected_impact}`);
      lines.push(`- **Command hint:** \`${t.command_hint}\``);
      lines.push('');
      i += 1;
    }
  }
  lines.push('## Protocol');
  for (const p of report.review_protocol) lines.push(`- ${p}`);
  lines.push('');
  lines.push('_Generated by `node tools/weekly-kpi-decision-loop.js`. Config: `config/kpi-weekly-loop.json`._');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/weekly-kpi-decision-loop.js [--json] [--markdown] [--offline] [--write] [--max-actions N]`);
    process.exit(0);
  }
  const report = await buildReport(args);
  if (args.write) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = report.as_of.replace(/[:.]/g, '-');
    const jsonPath = path.join(OUT_DIR, `review-${stamp}.json`);
    const mdPath = path.join(OUT_DIR, `review-${stamp}.md`);
    const latestJson = path.join(OUT_DIR, 'latest.json');
    const latestMd = path.join(OUT_DIR, 'latest.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(mdPath, renderMarkdown(report) + '\n');
    fs.writeFileSync(latestJson, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(latestMd, renderMarkdown(report) + '\n');
    report.written = { jsonPath, mdPath, latestJson, latestMd };
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMarkdown(report));
    if (report.written) {
      console.log(`\n_Wrote ${report.written.latestMd}_`);
    }
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  buildReport,
  colorFor,
  contentLogLive14d,
  parseArgs,
  renderMarkdown,
};
