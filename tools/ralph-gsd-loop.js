#!/usr/bin/env node
'use strict';

/**
 * ralph-gsd-loop.js — 24/7 Ralph Loop + GSD (Get Shit Done) orchestrator.
 *
 * One cycle does concrete work, not theater:
 *  1) GSD scan — open PRs, pipeline stages, stellar ledger checkboxes
 *  2) Ralph — update-branch + auto-merge babysit (never force DIRTY)
 *  3) Revenue — autonomous cash path (Stripe verify + due follow-ups + optional send)
 *  4) Receipt — private JSONL under business_os/revenue + optional ntfy
 *
 * Usage:
 *   node tools/ralph-gsd-loop.js [--once] [--json] [--no-revenue] [--no-ralph] [--no-ntfy] [--force-revenue]
 *   RALPH_GSD_INTERVAL_SEC=1800 node tools/ralph-gsd-loop.js   # multi-cycle (LaunchAgent uses --once)
 *
 * LaunchAgent: com.igor.ralph-gsd-loop (every 30m)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOME = os.homedir();
const MAIN_REVENUE = path.join(
  HOME,
  'workspace/git/igor/mac-yolo-safeguards/business_os/revenue',
);

function resolveRevenueDir() {
  if (process.env.REVENUE_DIR) return path.resolve(process.env.REVENUE_DIR);
  const candidates = [
    path.join(REPO, 'business_os', 'revenue'),
    MAIN_REVENUE,
    path.resolve(REPO, '..', '..', 'business_os', 'revenue'),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      if (fs.readdirSync(c).some((f) => f.startsWith('pipeline-status-') && f.endsWith('.tsv'))) {
        return c;
      }
    } catch {
      /* ignore */
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return MAIN_REVENUE;
}

const REVENUE_DIR = resolveRevenueDir();
const NTFY =
  process.env.HERMES_NTFY_URL ||
  process.env.NTFY_URL ||
  'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const LOG_DIR = process.env.RALPH_GSD_LOG_DIR || path.join(HOME, 'Library/Logs/mac-yolo');
const REPO_GH = process.env.GITHUB_REPOSITORY || 'IgorGanapolsky/mac-yolo-safeguards';
const STELLAR_LEDGER = path.join(
  REPO,
  'hermes-mobile/docs/RALPH-GSD-STELLAR-JULY-2026.md',
);

function parseArgs(argv) {
  const a = {
    once: true,
    json: false,
    revenue: true,
    ralph: true,
    ntfy: true,
    forceRevenue: false,
    help: false,
    maxCycles: 1,
    intervalSec: Number(process.env.RALPH_GSD_INTERVAL_SEC || 1800),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') a.once = true;
    else if (arg === '--loop') {
      a.once = false;
      a.maxCycles = Number(process.env.RALPH_GSD_MAX_CYCLES || 999999);
    } else if (arg === '--json') a.json = true;
    else if (arg === '--no-revenue') a.revenue = false;
    else if (arg === '--no-ralph') a.ralph = false;
    else if (arg === '--no-ntfy') a.ntfy = false;
    else if (arg === '--force-revenue') a.forceRevenue = true;
    else if (arg === '--max-cycles') {
      a.once = false;
      a.maxCycles = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') a.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (a.once) a.maxCycles = 1;
  return a;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd || REPO,
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    env: {
      ...process.env,
      PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
      REVENUE_DIR,
      REVENUE_AUTO_SEND: process.env.REVENUE_AUTO_SEND || '1',
      REVENUE_AUTO_GH: process.env.REVENUE_AUTO_GH || '1',
      REVENUE_NTFY_QUIET_NOOP: process.env.REVENUE_NTFY_QUIET_NOOP || '1',
      HOME,
    },
    maxBuffer: 6 * 1024 * 1024,
  });
}

function parseTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function latestPipelinePath() {
  if (!fs.existsSync(REVENUE_DIR)) return null;
  const files = fs
    .readdirSync(REVENUE_DIR)
    .filter((f) => f.startsWith('pipeline-status-') && f.endsWith('.tsv'))
    .sort();
  if (!files.length) return null;
  return path.join(REVENUE_DIR, files[files.length - 1]);
}

function stageCounts(rows) {
  const counts = {};
  for (const r of rows) {
    const s = (r.stage || 'unknown').toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

function scanStellarLedger() {
  const result = {
    path: STELLAR_LEDGER,
    exists: fs.existsSync(STELLAR_LEDGER),
    open: 0,
    done: 0,
    openItems: [],
  };
  if (!result.exists) return result;
  const text = fs.readFileSync(STELLAR_LEDGER, 'utf8');
  const openRe = /^- \[ \] (.+)$/gm;
  const doneRe = /^- \[x\] (.+)$/gim;
  let m;
  while ((m = openRe.exec(text))) {
    result.open += 1;
    if (result.openItems.length < 8) result.openItems.push(m[1].trim());
  }
  while ((m = doneRe.exec(text))) {
    result.done += 1;
  }
  result.complete = result.open === 0 && result.done > 0;
  return result;
}

function scanOpenPrs() {
  const r = sh(
    'gh',
    [
      'pr',
      'list',
      '-R',
      REPO_GH,
      '--state',
      'open',
      '--limit',
      '40',
      '--json',
      'number,mergeable,mergeStateStatus,isDraft,autoMergeRequest,title',
    ],
    { timeout: 45000 },
  );
  if (r.status !== 0) {
    return {
      ok: false,
      error: (r.stderr || r.stdout || 'gh pr list failed').slice(0, 200),
      open: 0,
      mergeable: 0,
      behind: 0,
      dirty: 0,
      auto: 0,
    };
  }
  let list = [];
  try {
    list = JSON.parse(r.stdout || '[]');
  } catch {
    return { ok: false, error: 'json_parse', open: 0 };
  }
  const nonDraft = list.filter((p) => !p.isDraft);
  return {
    ok: true,
    open: nonDraft.length,
    mergeable: nonDraft.filter((p) => p.mergeable === 'MERGEABLE').length,
    behind: nonDraft.filter((p) => p.mergeStateStatus === 'BEHIND').length,
    dirty: nonDraft.filter(
      (p) => p.mergeStateStatus === 'DIRTY' || p.mergeable === 'CONFLICTING',
    ).length,
    auto: nonDraft.filter((p) => p.autoMergeRequest).length,
  };
}

function lastRevenueAgeMin() {
  const p = path.join(REVENUE_DIR, 'autonomous-loop-receipts.jsonl');
  if (!fs.existsSync(p)) return Infinity;
  try {
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return Infinity;
    const last = JSON.parse(lines[lines.length - 1]);
    const age = (Date.now() - Date.parse(last.ts || 0)) / 60000;
    return Number.isFinite(age) ? age : Infinity;
  } catch {
    return Infinity;
  }
}

function runRalphOnce() {
  const script = path.join(REPO, 'tools/ralph-pr-loop.sh');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'missing_ralph_pr_loop' };
  }
  const r = sh('bash', [script, '--once'], { timeout: 180000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const autoEnabled = (out.match(/auto-merge enabled/g) || []).length;
  const updated = (out.match(/update-branch ok/g) || []).length;
  const conflicts = (out.match(/skip conflict/g) || []).length;
  const fails = (out.match(/FAIL:/g) || []).length;
  // ralph-pr-loop may exit non-zero on pipe/gh flakes while still doing useful work
  return {
    ok: r.status === 0 || autoEnabled > 0 || updated > 0,
    exit: r.status,
    autoEnabled,
    updated,
    conflicts,
    fails,
    tail: out.split('\n').filter(Boolean).slice(-12).join('\n'),
  };
}

function runRevenue(force) {
  const freshMin = Number(process.env.RALPH_GSD_REVENUE_FRESH_MIN || 20);
  const age = lastRevenueAgeMin();
  if (!force && age < freshMin) {
    return { skipped: true, ageMin: Number(age.toFixed(1)), reason: 'fresh' };
  }
  const script = path.join(REPO, 'tools/revenue-autonomous-loop.js');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'missing_revenue_loop' };
  }
  const args = ['--json', '--auto-send', '--fast'];
  if (process.env.RALPH_GSD_REVENUE_FULL === '1') {
    // drop --fast for chrome/apollo path when explicitly requested
    args.length = 0;
    args.push('--json', '--auto-send');
  }
  const r = sh(process.execPath, [script, ...args], { timeout: 150000 });
  try {
    const parsed = JSON.parse(r.stdout || '{}');
    parsed.exit = r.status;
    return parsed;
  } catch {
    return {
      ok: false,
      exit: r.status,
      raw: `${r.stdout || ''}${r.stderr || ''}`.slice(0, 400),
    };
  }
}

function nextGsdAction(gsd) {
  if (gsd.pipeline && (gsd.pipeline.counts.ready || 0) > 0) {
    return `send_ready_${gsd.pipeline.counts.ready}`;
  }
  if (gsd.pipeline && (gsd.pipeline.counts.sent || 0) > 0 && !(gsd.pipeline.counts.replied > 0)) {
    return 'followups_sent_zero_replies';
  }
  if (gsd.prs && gsd.prs.behind > 0) return `ralph_update_${gsd.prs.behind}_behind`;
  if (gsd.prs && gsd.prs.mergeable > gsd.prs.auto) return 'enable_auto_merge';
  if (gsd.stellar && gsd.stellar.openItems[0]) {
    return `stellar_${gsd.stellar.openItems[0].slice(0, 48)}`;
  }
  return 'monitor_inbox_and_stripe';
}

function ntfyPost(title, body, priority = 'default') {
  return new Promise((resolve) => {
    try {
      const url = new URL(NTFY);
      const lib = url.protocol === 'https:' ? https : http;
      const data = body;
      const req = lib.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            Title: title,
            Priority: priority,
            'Content-Type': 'text/plain',
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: 8000,
        },
        (res) => {
          res.resume();
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
        },
      );
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
      req.write(data);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function appendReceipt(summary) {
  ensureDir(REVENUE_DIR);
  ensureDir(LOG_DIR);
  const receiptPath = path.join(REVENUE_DIR, 'ralph-gsd-cycles.jsonl');
  const line = {
    ts: summary.checkedAt,
    cycle: summary.cycle,
    durationMs: summary.durationMs,
    next: summary.nextAction,
    prs: summary.gsd.prs,
    pipeline: summary.gsd.pipeline && summary.gsd.pipeline.counts,
    stellarOpen: summary.gsd.stellar && summary.gsd.stellar.open,
    ralph: summary.ralph && {
      ok: summary.ralph.ok,
      autoEnabled: summary.ralph.autoEnabled,
      updated: summary.ralph.updated,
      conflicts: summary.ralph.conflicts,
    },
    revenue: summary.revenue && {
      skipped: summary.revenue.skipped,
      ok: summary.revenue.ok,
      sentCount: summary.revenue.sentCount,
      due: summary.revenue.due && summary.revenue.due.length,
      noop: summary.revenue.noop,
    },
  };
  fs.appendFileSync(receiptPath, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(receiptPath, 0o600);
  } catch {
    /* ignore */
  }

  const day = summary.checkedAt.slice(0, 10);
  const mdPath = path.join(REVENUE_DIR, `ralph-gsd-board-${day}.md`);
  const md = [
    `# Ralph + GSD board — ${day}`,
    '',
    `- last_cycle: ${summary.checkedAt}`,
    `- next: **${summary.nextAction}**`,
    `- open_prs: ${summary.gsd.prs.open} (mergeable=${summary.gsd.prs.mergeable} behind=${summary.gsd.prs.behind} dirty=${summary.gsd.prs.dirty} auto=${summary.gsd.prs.auto})`,
    `- pipeline: ${JSON.stringify(summary.gsd.pipeline && summary.gsd.pipeline.counts)}`,
    `- stellar open checkboxes: ${summary.gsd.stellar.open} / done ${summary.gsd.stellar.done}`,
    `- ralph: auto=${summary.ralph && summary.ralph.autoEnabled} update=${summary.ralph && summary.ralph.updated} conflicts=${summary.ralph && summary.ralph.conflicts}`,
    `- revenue: ${summary.revenue && summary.revenue.skipped ? `skipped_fresh_${summary.revenue.ageMin}m` : `sent=${summary.revenue && summary.revenue.sentCount} due=${summary.revenue && summary.revenue.due && summary.revenue.due.length}`}`,
    '',
  ].join('\n');
  fs.writeFileSync(mdPath, md, { mode: 0o600 });

  const logPath = path.join(LOG_DIR, `ralph-gsd-${day.replace(/-/g, '')}.log`);
  fs.appendFileSync(
    logPath,
    `[${summary.checkedAt}] cycle=${summary.cycle} next=${summary.nextAction} prs=${summary.gsd.prs.open} duration_ms=${summary.durationMs}\n`,
  );

  return { receiptPath, mdPath, logPath };
}

async function runCycle(args, cycle) {
  const started = Date.now();
  const actions = [];

  const pipelinePath = latestPipelinePath();
  const rows = pipelinePath ? parseTsv(pipelinePath) : [];
  const counts = stageCounts(rows);
  const stellar = scanStellarLedger();
  const prs = scanOpenPrs();
  actions.push(`gsd_scan prs=${prs.open} stellar_open=${stellar.open} pipeline_rows=${rows.length}`);

  let ralph = { skipped: true };
  if (args.ralph) {
    ralph = runRalphOnce();
    actions.push(
      `ralph ok=${ralph.ok} auto=${ralph.autoEnabled || 0} update=${ralph.updated || 0} conflict=${ralph.conflicts || 0}`,
    );
    // re-scan PR counts after ralph
    Object.assign(prs, scanOpenPrs());
  } else {
    actions.push('ralph=skipped');
  }

  let revenue = { skipped: true, reason: 'disabled' };
  if (args.revenue) {
    revenue = runRevenue(args.forceRevenue);
    if (revenue.skipped) {
      actions.push(`revenue=skipped_fresh_${revenue.ageMin}m`);
    } else {
      actions.push(
        `revenue ok=${revenue.ok} sent=${revenue.sentCount || 0} due=${(revenue.due || []).length} noop=${revenue.noop}`,
      );
    }
  } else {
    actions.push('revenue=skipped');
  }

  const gsd = {
    pipeline: {
      path: pipelinePath,
      rows: rows.length,
      counts,
    },
    stellar,
    prs,
  };
  const nextAction = nextGsdAction(gsd);

  const summary = {
    ok: true,
    mode: 'ralph+gsd',
    cycle,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    repo: REPO,
    revenueDir: REVENUE_DIR,
    gsd,
    ralph,
    revenue,
    nextAction,
    actions,
  };

  const paths = appendReceipt(summary);
  summary.receiptPath = paths.receiptPath;
  summary.boardPath = paths.mdPath;
  summary.logPath = paths.logPath;

  const noop =
    (revenue.skipped || revenue.noop) &&
    !(ralph.autoEnabled > 0 || ralph.updated > 0) &&
    !(revenue.sentCount > 0);

  if (args.ntfy && !(process.env.RALPH_GSD_NTFY_QUIET_NOOP === '1' && noop)) {
    const body = [
      `next=${nextAction}`,
      `prs open=${prs.open} mergeable=${prs.mergeable} behind=${prs.behind} dirty=${prs.dirty}`,
      `pipeline ${JSON.stringify(counts)}`,
      `ralph auto=${ralph.autoEnabled || 0} update=${ralph.updated || 0}`,
      `revenue sent=${revenue.sentCount || 0} due=${(revenue.due || []).length}`,
      `stellar open=${stellar.open}`,
      `ms=${summary.durationMs}`,
    ].join('\n');
    summary.ntfy = await ntfyPost('Ralph+GSD cycle', body, revenue.sentCount > 0 ? 'high' : 'default');
  }

  return summary;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/ralph-gsd-loop.js [--once] [--loop] [--json] [--no-revenue] [--no-ralph] [--no-ntfy] [--force-revenue]\n',
    );
    process.exit(0);
  }

  ensureDir(LOG_DIR);
  ensureDir(REVENUE_DIR);

  let cycle = 0;
  let last = null;
  while (cycle < args.maxCycles) {
    cycle += 1;
    last = await runCycle(args, cycle);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(last, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          `ralph-gsd cycle=${cycle} duration_ms=${last.durationMs}`,
          `next=${last.nextAction}`,
          ...last.actions,
          last.receiptPath ? `receipt=${last.receiptPath}` : '',
          '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    if (args.once || cycle >= args.maxCycles) break;
    await new Promise((r) => setTimeout(r, Math.max(30, args.intervalSec) * 1000));
  }
  process.exit(last && last.ok === false ? 2 : 0);
}

module.exports = {
  parseArgs,
  nextGsdAction,
  stageCounts,
  scanStellarLedger,
  resolveRevenueDir,
  runCycle,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
