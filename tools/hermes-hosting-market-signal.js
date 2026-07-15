#!/usr/bin/env node
'use strict';

/**
 * hermes-hosting-market-signal.js — High-ROI capture of agent-market signals.
 *
 * Presets:
 *   hermes-hosted   — MyClaw-style always-on Hermes hosting
 *   enterprise-sdlc — IBM Bob-style multi-agent full-lifecycle platforms
 *   openclaw-local  — OpenClaw + Ollama always-on messaging agents (local/cloud)
 *
 * Produces: private board + JSONL, Stripe-verified CTA drafts, optional pipeline seed.
 * Never invents cleared revenue. Never commits buyer PII to git.
 *
 * Usage:
 *   node tools/hermes-hosting-market-signal.js --preset hermes-hosted --apply-pipeline --json
 *   node tools/hermes-hosting-market-signal.js --preset enterprise-sdlc --source URL --apply-pipeline --json
 *   node tools/hermes-hosting-market-signal.js --preset openclaw-local --demo --json
 *   node tools/hermes-hosting-market-signal.js --demo --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function resolveRevenueDir() {
  if (process.env.REVENUE_DIR) return path.resolve(process.env.REVENUE_DIR);
  const candidates = [
    path.join(REPO, 'business_os', 'revenue'),
    path.resolve(REPO, '..', '..', 'business_os', 'revenue'),
    path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards/business_os/revenue'),
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
  return candidates[0];
}

const REVENUE_DIR = resolveRevenueDir();

const PRESETS = {
  'hermes-hosted': {
    id: 'myclaw-hermes-2026-07-13',
    source: 'https://x.com/hasantoxr/status/2076695733575766377',
    author: '@hasantoxr',
    summary:
      'MyClaw promotes hosted agents that finish jobs in channels; Hermes live; free trial promo; Claude Code/Codex next.',
    icp: 'teams running Hermes or always-on agents on real work / client delivery',
    gap: 'hosting ≠ OS/loop enforcement (token burn, sim runaway, no hard stop)',
    offer: 'Agent Reliability Diagnostic ($499)',
    gross_potential_usd: '499',
    prospectPrefix: 'hermes-hosting',
    nextAction: 'send_hosted_hermes_cta',
    positioningDoc: 'docs/HERMES-HOSTED-RELIABILITY.md',
    xHook:
      'Hosted Hermes finishing jobs in channels is the right shift.\n\nStill true: always-on ≠ hard stop. Runaway tool loops, sim freezes, token burn without outcome — that is an enforcement layer, not more hosting.\n\nWe open-source the Mac freeze guard (mac-yolo-safeguards) and sell scoped diagnostics for teams putting Hermes on real work.',
    emailHook: [
      'Saw the wave of "Hermes always online / finishes the job in your channels" (e.g. hosted agent platforms). That is real demand.',
      '',
      'Gap we keep hitting: hosting keeps the agent up; it does not stop unfinished-and-still-running failures (token loops, Mac load spikes, silent wrong tool chains).',
    ].join('\n'),
    emailSubject: 'Hosted Hermes / always-on agents — reliability diagnostic',
  },
  'enterprise-sdlc': {
    id: 'ibm-bob-infoworld-2026-07-09',
    source:
      'https://www.infoworld.com/article/4195291/ibm-bob-expands-beyond-code-generation-to-orchestrate-the-entire-sdlc.html',
    author: 'InfoWorld / IBM Bob',
    summary:
      'IBM Bob multi-agent full-SDLC orchestration, parallel tools, subagents, Bobalytics cost/governance; enterprise line: safe, repeatable, economic delivery — not fastest model.',
    icp: 'teams adopting multi-agent SDLC platforms (enterprise or agency packaging similar workflows)',
    gap: 'orchestration + analytics ≠ local loop/OS enforcement when agents thrash machines or burn tokens without finish',
    offer: 'Partner Pilot ($3,000)',
    gross_potential_usd: '3000',
    prospectPrefix: 'enterprise-sdlc',
    nextAction: 'send_enterprise_sdlc_cta',
    positioningDoc: 'docs/ENTERPRISE-AGENT-SDLC-RELIABILITY.md',
    xHook:
      'Enterprise conversation moved: not "which model is fastest" — "deliver software safely, repeatedly, economically across the lifecycle" (IBM Bob / multi-agent SDLC).\n\nStill true on real fleets: multi-agent + parallel tools expand the unfinished-and-still-running failure class. Cost dashboards help; hard stops and proof on the Mac/agent loop still matter.\n\nOSS freeze guard + paid reliability diagnostics for teams that already pay for agent failures.',
    emailHook: [
      'Enterprise agent platforms (e.g. IBM Bob-class multi-agent SDLC orchestration, parallel tools, cost analytics) are selling safe, repeatable, economic delivery — not just faster codegen.',
      '',
      'Gap we keep hitting on non-mainframe fleets: orchestration coordinates work; it does not replace OS-level and loop-level enforcement when agents burn tokens, thrash a Mac, or fail silently mid-workflow.',
    ].join('\n'),
    emailSubject: 'Multi-agent SDLC platforms — reliability diagnostic / Partner Pilot',
  },
  'openclaw-local': {
    id: 'openclaw-ollama-kdnuggets-2026-07-09',
    source: 'https://www.kdnuggets.com/running-openclaw-with-ollama',
    author: 'KDnuggets / OpenClaw + Ollama',
    summary:
      'OpenClaw (ex-Clawdbot) + Ollama: one-command always-on personal agent on Telegram/WhatsApp/Slack; Gateway daemon; local or Ollama cloud models; ≥64k context; Docker headless path.',
    icp:
      'solo devs and small teams who just launched a local messaging agent (OpenClaw/Ollama or peer) and now hit runaway tools, dual-bot conflicts, or unsupervised shell on a Mac',
    gap:
      'always-on messaging + local models ≠ approve-before-execute, zero-spend command gates, or OS freeze enforcement; dual Telegram gateways collide with Hermes',
    offer: 'Agent Reliability Diagnostic ($499)',
    gross_potential_usd: '499',
    prospectPrefix: 'openclaw-local',
    nextAction: 'send_openclaw_local_cta',
    positioningDoc: 'docs/OPENCLAW-VS-HERMES.md',
    xHook:
      'OpenClaw + Ollama closing the "terminal AI walked away" gap is real demand — always-on Telegram agents with local models.\n\nStill true: messaging Gateway ≠ hard stop. Dual bots fight over Telegram updates; unsupervised tool exec burns tokens and can rm your tree; cloud model paths reintroduce spend.\n\nWe open-source Mac freeze guards + Hermes zero-spend, and sell scoped diagnostics. Phone approve/deny is Hermes Mobile — not another chat daemon.',
    emailHook: [
      'Saw the OpenClaw + Ollama wave (one-command personal agent on Telegram/WhatsApp, local or cloud models). That is real demand for always-on channel agents.',
      '',
      'Gap we keep hitting: a messaging Gateway keeps the agent reachable; it does not replace approve-before-execute, fail-closed spend gates, or OS-level freeze/runaway enforcement — and co-running a second Gateway on the same Telegram bot is a reliability failure.',
    ].join('\n'),
    emailSubject: 'OpenClaw / local messaging agents — reliability diagnostic',
  },
};

const DEFAULT_SIGNAL = PRESETS['hermes-hosted'];

function parseArgs(argv) {
  const args = {
    source: null,
    preset: 'hermes-hosted',
    applyPipeline: false,
    json: false,
    demo: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source') args.source = argv[++i];
    else if (a === '--preset') args.preset = argv[++i];
    else if (a === '--apply-pipeline') args.applyPipeline = true;
    else if (a === '--json') args.json = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.preset && !PRESETS[args.preset]) {
    throw new Error(`Unknown preset: ${args.preset} (use: ${Object.keys(PRESETS).join(', ')})`);
  }
  return args;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function latestFile(dir, prefix, suffix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(dir, files[0].f) : null;
}

function parseTsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return { headers: [], rows: [] };
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const rows = lines.filter(Boolean).map((line) => {
    const vals = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] != null ? vals[i] : '';
    });
    return row;
  });
  return { headers, rows, path: filePath };
}

function httpStatus(url, timeoutMs) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      resolve({ url, status: 0 });
      return;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs || 12000 }, (res) => {
      const status = res.statusCode || 0;
      res.resume();
      resolve({ url, status });
    });
    req.on('error', () => resolve({ url, status: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0 });
    });
  });
}

async function loadStripeLinks() {
  const mapPath =
    latestFile(REVENUE_DIR, 'stripe-offer-map-', '.tsv') ||
    path.join(REVENUE_DIR, 'stripe-offer-map-2026-07-07.tsv');
  const out = { mapPath: fs.existsSync(mapPath) ? mapPath : null, links: {} };
  if (!out.mapPath) return out;
  const { rows } = parseTsv(mapPath);
  for (const row of rows) {
    const url = row.payment_link_url;
    // eslint-disable-next-line no-await-in-loop
    const st = await httpStatus(url, 12000);
    out.links[row.offer] = {
      url,
      http: st.status,
      ok: st.status >= 200 && st.status < 400,
      amount: row.stripe_amount_usd,
    };
  }
  return out;
}

function preferredCta(signal, stripe) {
  const preferPilot = /partner pilot/i.test(signal.offer || '');
  const diag = stripe.links['Agent Reliability Diagnostic'];
  const pilot = stripe.links['Partner Pilot'];
  const hard = stripe.links['AI Agent Hardening Sprint'];
  if (preferPilot && pilot && pilot.ok) {
    return `Partner Pilot ($3,000) when ready: ${pilot.url}`;
  }
  if (diag && diag.ok) return `Diagnostic ($499) when ready: ${diag.url}`;
  if (hard && hard.ok) return `Hardening Sprint ($1,500) when ready: ${hard.url}`;
  if (pilot && pilot.ok) return `Partner Pilot when ready: ${pilot.url}`;
  return 'Reply and we will scope — no broken pay link.';
}

function buildOutboundDraft(signal, stripe) {
  const linkLine = preferredCta(signal, stripe);
  const xHook =
    signal.xHook ||
    'Agent platforms keep expanding what agents can coordinate.\n\nStill true: orchestration ≠ hard stop when loops do not finish.';
  const emailHook =
    signal.emailHook ||
    'Enterprise and hosted agent platforms are scaling multi-agent work. Gap: enforcement when loops thrash machines or burn tokens.';

  const xReply = [
    xHook,
    '',
    linkLine,
    'Public intake: https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml',
  ].join('\n');

  const emailBody = [
    `Subject: ${signal.emailSubject || 'Agent reliability diagnostic'}`,
    '',
    'Hi —',
    '',
    emailHook,
    '',
    'We ship the OSS Mac safeguards kit and paid diagnostics / Partner Pilot for one repeated failure pattern.',
    '',
    linkLine,
    '',
    'If not relevant, reply "not now".',
    '',
    '— Igor',
    'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
  ].join('\n');

  return { xReply, emailBody, cta: linkLine };
}

function writeBoard(signal, stripe, drafts, checkedAt) {
  ensureDir(REVENUE_DIR);
  const day = today();
  const boardPath = path.join(REVENUE_DIR, `agent-market-signal-${day}.md`);
  const lines = [
    `# Agent market signal — ${day}`,
    '',
    `Generated: ${checkedAt}`,
    '',
    '## Signal',
    '',
    `- **id:** ${signal.id}`,
    `- **preset:** ${signal.preset || ''}`,
    `- **source:** ${signal.source}`,
    `- **author:** ${signal.author || ''}`,
    `- **summary:** ${signal.summary}`,
    `- **ICP:** ${signal.icp}`,
    `- **gap:** ${signal.gap}`,
    '',
    '## Stripe health (for CTA)',
    '',
  ];
  for (const [offer, meta] of Object.entries(stripe.links || {})) {
    lines.push(`- ${offer}: HTTP ${meta.http} ok=${meta.ok} ${meta.url}`);
  }
  lines.push('', '## Outbound draft (X / reply)', '', '```', drafts.xReply, '```', '');
  lines.push('## Email draft', '', '```', drafts.emailBody, '```', '');
  lines.push(
    '',
    '## Positioning',
    '',
    `See ${signal.positioningDoc || 'docs/HERMES-HOSTED-RELIABILITY.md'}`,
    '',
  );
  fs.writeFileSync(boardPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return boardPath;
}

function appendReceipt(payload) {
  ensureDir(REVENUE_DIR);
  const p = path.join(REVENUE_DIR, 'hermes-hosting-signal-receipts.jsonl');
  fs.appendFileSync(p, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* ignore */
  }
  return p;
}

function applyPipelineSeed(signal) {
  const pipelinePath =
    latestFile(REVENUE_DIR, 'pipeline-status-', '.tsv') ||
    path.join(REVENUE_DIR, 'pipeline-status-2026-07-07.tsv');
  if (!fs.existsSync(pipelinePath)) {
    return { ok: false, reason: 'no_pipeline' };
  }
  // Stable id from source URL so re-runs are idempotent
  const slug = String(signal.id || 'signal')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 40);
  const prefix = signal.prospectPrefix || 'agent-signal';
  const prospect = `${prefix}-${slug}`.slice(0, 48);
  const { headers, rows } = parseTsv(pipelinePath);
  const existing = rows.find((r) => r.prospect_label === prospect);
  if (existing) {
    // Correct free_repo mis-seeds from early voice-front-door attempts
    const needsFix =
      /free_repo|Free repo/i.test(existing.route || '') ||
      existing.gross_potential_usd === '0' ||
      existing.gross_potential_usd === '';
    if (!needsFix) {
      return { ok: true, method: 'already_present', prospect, pipelinePath };
    }
  }
  if (!existing) {
    const row = {
      prospect_label: prospect,
      stage: 'ready',
      route: signal.offer || 'Agent Reliability Diagnostic ($499)',
      gross_potential_usd: signal.gross_potential_usd || '499',
      last_touch: today(),
      next_action: signal.nextAction || 'send_market_signal_cta',
      notes: `market-signal ${signal.source} | ${signal.gap || ''}`.slice(0, 350),
    };
    const line = headers.map((h) => (row[h] != null ? String(row[h]) : '')).join('\t');
    const text = fs.readFileSync(pipelinePath, 'utf8');
    fs.writeFileSync(
      pipelinePath,
      text.endsWith('\n') ? `${text}${line}\n` : `${text}\n${line}\n`,
      { mode: 0o600 },
    );
  }
  const upd = path.join(REPO, 'tools/pipeline-update.js');
  if (fs.existsSync(upd)) {
    const r = spawnSync(
      process.execPath,
      [
        upd,
        '--pipeline',
        pipelinePath,
        '--prospect',
        prospect,
        '--stage',
        'ready',
        '--date',
        today(),
        '--next-action',
        signal.nextAction || 'send_market_signal_cta',
        '--note',
        `market-signal ${signal.source} | offer=${signal.offer || 'diagnostic'} gap=${(signal.gap || '').slice(0, 120)}`,
      ],
      { encoding: 'utf8', timeout: 15000, cwd: REPO },
    );
    // pipeline-update may not change route/gross; rewrite those fields if still wrong
    const after = parseTsv(pipelinePath);
    const idx = after.rows.findIndex((r) => r.prospect_label === prospect);
    if (idx >= 0) {
      after.rows[idx].route = signal.offer || 'Agent Reliability Diagnostic ($499)';
      after.rows[idx].gross_potential_usd = signal.gross_potential_usd || '499';
      after.rows[idx].stage = 'ready';
      after.rows[idx].next_action = signal.nextAction || 'send_market_signal_cta';
      const body = [
        after.headers.join('\t'),
        ...after.rows.map((r) => after.headers.map((h) => r[h] != null ? r[h] : '').join('\t')),
        '',
      ].join('\n');
      fs.writeFileSync(pipelinePath, body, { mode: 0o600 });
    }
    return {
      ok: r.status === 0 || idx >= 0,
      method: existing ? 'fixed_existing' : 'tsv_append_pipeline_update',
      prospect,
      pipelinePath,
      exit: r.status,
    };
  }
  return { ok: true, method: 'tsv_append', prospect, pipelinePath };
}

function buildSignal(args) {
  const base = { ...(PRESETS[args.preset] || DEFAULT_SIGNAL), preset: args.preset || 'hermes-hosted' };
  if (args.demo && !args.source) {
    return base;
  }
  if (!args.source) {
    return base;
  }
  // Stable id from status id or article slug when present
  const m = String(args.source).match(/status\/(\d+)/);
  const art = String(args.source).match(/article\/(\d+)/);
  const id = m
    ? `x-${m[1]}`
    : art
      ? `article-${art[1]}`
      : `src-${String(args.source).slice(-24).replace(/\W+/g, '')}`;
  return {
    ...base,
    id,
    source: args.source,
  };
}

async function run(args) {
  const checkedAt = new Date().toISOString();
  const signal = buildSignal(args);
  if (args.source) signal.source = args.source;
  const stripe = await loadStripeLinks();
  const drafts = buildOutboundDraft(signal, stripe);
  const boardPath = writeBoard(signal, stripe, drafts, checkedAt);
  let pipeline = { ok: false, skipped: true };
  if (args.applyPipeline) {
    pipeline = applyPipelineSeed(signal);
  }
  const receipt = {
    ts: checkedAt,
    signal_id: signal.id,
    source: signal.source,
    stripe_ok: Object.values(stripe.links || {}).filter((l) => l.ok).length,
    pipeline,
    boardPath,
  };
  const receiptPath = appendReceipt(receipt);
  return {
    ok: true,
    checkedAt,
    signal,
    stripe,
    drafts,
    boardPath,
    receiptPath,
    pipeline,
    positioningDoc: signal.positioningDoc || 'docs/HERMES-HOSTED-RELIABILITY.md',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/hermes-hosting-market-signal.js [--preset hermes-hosted|enterprise-sdlc] [--source URL] [--apply-pipeline] [--demo] [--json]\n',
    );
    process.exit(0);
  }
  try {
    const summary = await run(args);
    if (args.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    else {
      process.stdout.write(
        [
          `ok=${summary.ok}`,
          `source=${summary.signal.source}`,
          `board=${summary.boardPath}`,
          `pipeline=${JSON.stringify(summary.pipeline)}`,
          `stripe_ok=${Object.values(summary.stripe.links || {}).filter((l) => l.ok).length}`,
          '',
        ].join('\n'),
      );
    }
    process.exit(summary.ok ? 0 : 2);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  buildOutboundDraft,
  buildSignal,
  applyPipelineSeed,
  run,
  DEFAULT_SIGNAL,
  PRESETS,
  preferredCta,
};

if (require.main === module) {
  main();
}
