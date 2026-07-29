#!/usr/bin/env node
'use strict';

/**
 * funnel-stage-health.js — ThumbGate.app GTM stage map + live health probes.
 *
 * For every stage answers:
 *   1) Why does it exist?
 *   2) What can go wrong?
 *   3) How do you measure whether it's working?
 *
 * Usage:
 *   node tools/funnel-stage-health.js [--json] [--markdown] [--offline]
 *   node tools/funnel-stage-health.js --stage product_landing
 *
 * Exit:
 *   0 = all critical stages OK or degraded-only
 *   1 = one or more critical stages FAIL
 *   2 = usage error
 *
 * Network probes never invent cash. External revenue is fail-closed $0 without
 * a non-owner Stripe receipt. Offline mode skips HTTP probes (CI-safe definitions).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_LOG = path.join(ROOT, 'docs/social/hermes-mobile-content-log.tsv');
const RECEIPT = path.join(
  process.env.HOME || '',
  '.hermes/receipts/tinker-brain/revenue-receipt.json',
);

/** @typedef {'critical'|'important'|'secondary'} Severity */
/** @typedef {'ok'|'warn'|'fail'|'skip'|'unknown'} ProbeStatus */

/**
 * Static stage definitions (always available offline).
 * Probes attach runtime evidence; definitions answer the CEO three questions.
 */
const STAGES = [
  {
    id: 'product_landing',
    name: 'Product landing (thumbgate.app)',
    severity: 'critical',
    why: 'Primary product surface. Free web control + Continuity trial must be understandable without a sales call.',
    risks: [
      'Copy lies (rescue language, hard-coded $, E2EE claims)',
      'Missing dual CTA (free-only or paid-only)',
      'Stale deploy — main has FAQ but production does not',
      'Broken auth login chain',
    ],
    measure: [
      'GET / returns 200',
      'Hero dual funnel events: sign_in_click + cloud_continuity_click',
      'FAQPage JSON-LD present (AEO)',
      'llms.txt starts with # ThumbGate for Hermes',
      'GET /api/billing/plan active (no hard-coded campaign $)',
    ],
  },
  {
    id: 'billing_rails',
    name: 'Billing rails (Stripe Continuity + offers)',
    severity: 'critical',
    why: 'Without live checkout, promo only creates curiosity — no cash path.',
    risks: [
      'Stripe price inactive or misconfigured',
      'Buy links 403/dead',
      'Owner test charges counted as revenue',
      'Missing receipt reconcile (file-missing vs Stripe-empty)',
    ],
    measure: [
      'GET /api/billing/plan → configured+active+unitAmount',
      'Diagnostic/Hardening/Pilot Pilot buy.stripe.com HTTP 200',
      'External cash only via non-owner Stripe + revenue-receipt.json',
      'python3 tools/tinker-brain/reconcile_stripe_revenue_receipt.py when STRIPE_SECRET_KEY set',
    ],
  },
  {
    id: 'aeo_discovery',
    name: 'AEO / machine-readable discovery',
    severity: 'important',
    why: 'Answer engines and agents cite structured answers; zero citations = invisible to AI search buyers.',
    risks: [
      'FAQPage missing on live deploy',
      'llms.txt brand drift (Leash-first vs ThumbGate-first)',
      'ai-catalog / sitemap / robots broken',
      'Autonomous rewrites from citation dip without canary',
    ],
    measure: [
      'Live HTML contains FAQPage + visible #faq',
      'llms.txt heading # ThumbGate for Hermes',
      'GET /.well-known/ai-catalog.json 200',
      'Weekly thumbgate-aeo-monitor.js (cap $0.10/mo)',
    ],
  },
  {
    id: 'campaign_beat',
    name: 'Campaign beat (1–2 day fan-out)',
    severity: 'critical',
    why: 'Cash bottleneck is distribution. One persona + pain + evidence + hook, fanned with UTMs and LIVE permalinks.',
    risks: [
      'Double-post same campaign',
      'Drafted log while LIVE elsewhere (matrix lag)',
      'Hashnode / Reddit burn / Zernio violations',
      'Rescue language / hard-coded price in copy',
      'Title-only Medium counted as LIVE',
    ],
    measure: [
      'content-log rows Status=Published with PostURL',
      'social-publish-gate ALLOW once before Post',
      'verify-public-post.js LIVE after Post',
      'Cadence: last LIVE beat ≤2 days old',
      'Superseded status blocks re-post of retired campaign',
    ],
  },
  {
    id: 'channel_reliability',
    name: 'Channel reliability matrix',
    severity: 'important',
    why: 'Not every channel is equal: dev.to is the durable longform rail; some composers fail often.',
    risks: [
      'Treating Threads/Medium compose fails as "posted"',
      'Show HN killed at low karma',
      'Reddit promo under burn rule',
      'Concurrent Chrome runs double CTA comments',
    ],
    measure: [
      'Per-channel LIVE/PARTIAL/BLOCKED/FROZEN matrix same day',
      'dev.to bodyChars ≥ 1500 for longform beats',
      'No Hashnode publish attempts',
      'resource-lease for shared Chrome profiles',
    ],
  },
  {
    id: 'outbound_domain',
    name: 'Outbound email (domain From)',
    severity: 'critical',
    why: 'Design partners and warm follows need deliverable mail from igor@igorganapolsky.com — not gmail.com spam pool.',
    risks: [
      'PrivateEmail 535 SMTP auth fail (API says sent, DSN bounce)',
      'Fallback blast from gmail.com damages reputation',
      'Template-identical cold batch',
      'Blind reply scan (in:inbox misses Trash)',
    ],
    measure: [
      'Gmail sendAs igor@… verificationStatus=accepted',
      'Probe delivery without DSN 535',
      'Reply scan in:anywhere, hot=0|N logged daily',
      '≤3 personalized Continuity DP asks / day when unlocked',
      'auto_send safety gate blocks spam bursts',
    ],
  },
  {
    id: 'design_partners',
    name: 'Continuity design partners (≤3)',
    severity: 'critical',
    why: 'Highest-leverage path to first non-owner Continuity payment: real operators with offline-lid pain, trial for feedback.',
    risks: [
      'Re-spamming Jul 28 six with no replies',
      '$499 cold diagnostic instead of trial ask',
      'No feedback loop after trial',
      'Counting owner Continuity as success',
    ],
    measure: [
      'Pipeline/stage: design_partner | trial | feedback | paid',
      'Hot replies in Gmail scan',
      'Non-owner Stripe Continuity subscription',
      '≤1 touch / prospect / 72h unless they replied',
    ],
  },
  {
    id: 'cold_pipeline',
    name: 'Cold diagnostic pipeline ($499 path)',
    severity: 'secondary',
    why: 'Legacy high-ticket path for agent-reliability buyers; secondary to Continuity while reply rate ≈0.',
    risks: [
      'More leads while ready=0 and reply≈0 (tool theater)',
      'Dead Stripe links in old templates',
      'Following mycelium after commercial decline',
    ],
    measure: [
      'pipeline-data-science stage counts',
      'send-next ready queue empty|N',
      'reply rate ≥1 human / 30 days or stop cold batch',
      'payment-readiness HTTP 200 on offer links',
    ],
  },
  {
    id: 'attribution',
    name: 'Attribution (UTM → funnel events)',
    severity: 'important',
    why: 'Know which campaign beat creates sign_in / Continuity clicks without capturing prompts or PII.',
    risks: [
      'Missing utm_campaign / cta_id',
      'Analytics leaking prompts/emails/IPs',
      'A/B claims without min-events',
    ],
    measure: [
      'Content log CTA URLs include utm_campaign + cta_id',
      'Funnel events aggregate content-free only',
      'social-campaign-ds.js with --min-events before winners',
    ],
  },
  {
    id: 'cash_recognition',
    name: 'Cash recognition (fail-closed)',
    severity: 'critical',
    why: 'Prevents theater. Only non-owner Stripe paid is revenue.',
    risks: [
      'Owner/test charges as ARR',
      'Missing receipt file treated as unknown not $0',
      'pipeline stage paid without Stripe',
    ],
    measure: [
      'revenue-receipt.json external_cents or fail-closed $0',
      'record-cleared-payment.js ledger rows',
      'tinker-brain cash card matches Stripe reconcile',
    ],
  },
  {
    id: 'watch_only_channels',
    name: 'Skool + Reddit (watch-only acquisition)',
    severity: 'secondary',
    why: 'Standing freezes/burn rules protect accounts; still useful as signal, not promo rails.',
    risks: [
      'Accidental auto-post (Skool freeze)',
      'Reddit promo under burn without override',
      'Treating watch-only as distribution gap to "fill"',
    ],
    measure: [
      'Content log Reddit=Skipped/Draft-only without PostURL promo',
      'No Skool publish automation while freeze active',
      'Vault / plan.md freeze docs present',
    ],
  },
];

function parseArgs(argv) {
  const args = { json: false, markdown: true, offline: false, stage: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--no-markdown') args.markdown = false;
    else if (a === '--offline') args.offline = true;
    else if (a === '--stage') args.stage = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function httpGet(url, timeoutMs = 12000, redirectsLeft = 5) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    // Prefer IPv4: this host's IPv6 path to Cloudflare often blackholes (curl -6
    // times out while curl -4 returns 200). Node defaults to happy-eyeballs that
    // still fail closed as status=0 when AAAA is preferred and dead.
    const req = lib.get(
      url,
      {
        timeout: timeoutMs,
        family: 4,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; thumbgate-funnel-stage-health/1.0)',
          Accept: 'text/html,application/json,*/*',
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if (
          redirectsLeft > 0 &&
          code >= 300 &&
          code < 400 &&
          res.headers.location
        ) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(httpGet(next, timeoutMs, redirectsLeft - 1));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: code,
            body: Buffer.concat(chunks).toString('utf8').slice(0, 500000),
          });
        });
      },
    );
    req.on('error', (err) =>
      resolve({ status: 0, body: '', error: String(err.message || err) }),
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: '', error: 'timeout' });
    });
  });
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 60000,
  });
  return {
    status: r.status,
    stdout: (r.stdout || '').slice(0, 8000),
    stderr: (r.stderr || '').slice(0, 2000),
  };
}

function parseContentLogSummary() {
  if (!fileExists(CONTENT_LOG)) {
    return { missing: true, lastLiveDate: null, liveCount14d: 0, supersededBlocks: 0 };
  }
  const lines = fs.readFileSync(CONTENT_LOG, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { missing: false, lastLiveDate: null, liveCount14d: 0, rows: 0 };
  const header = lines[0].split('\t');
  const idx = (n) => header.indexOf(n);
  const iDate = idx('Date');
  const iStatus = idx('Status');
  const iUrl = idx('PostURL');
  const cutoff = Date.now() - 14 * 864e5;
  let lastLiveDate = null;
  let liveCount14d = 0;
  let superseded = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    const status = (cols[iStatus] || '').toLowerCase();
    const date = cols[iDate] || '';
    const url = cols[iUrl] || '';
    if (status === 'superseded') superseded += 1;
    if (['published', 'posted', 'live'].includes(status) && /^https?:\/\//i.test(url)) {
      if (!lastLiveDate || date > lastLiveDate) lastLiveDate = date;
      const d = new Date(date);
      if (!Number.isNaN(d.getTime()) && d.getTime() >= cutoff) liveCount14d += 1;
    }
  }
  return {
    missing: false,
    lastLiveDate,
    liveCount14d,
    supersededBlocks: superseded,
    rows: lines.length - 1,
  };
}

/**
 * Attach probes to stages. Offline skips network.
 * @param {{ offline: boolean }} opts
 */
async function probeAll(opts) {
  /** @type {Record<string, {status: ProbeStatus, evidence: string[]}>} */
  const probes = {};
  const mark = (id, status, evidence) => {
    probes[id] = { status, evidence: evidence.filter(Boolean) };
  };

  const logSummary = parseContentLogSummary();

  // --- offline-safe local probes ---
  const gatePath = path.join(ROOT, 'tools/social-publish-gate.js');
  const hasRetiredGate =
    fileExists(gatePath) &&
    fs.readFileSync(gatePath, 'utf8').includes('RETIRED_STATUSES');
  mark(
    'campaign_beat_local',
    hasRetiredGate && !logSummary.missing ? 'ok' : 'warn',
    [
      logSummary.missing ? 'content log missing' : `content log rows=${logSummary.rows}`,
      `last LIVE date=${logSummary.lastLiveDate || 'none'}`,
      `LIVE rows last 14d=${logSummary.liveCount14d}`,
      hasRetiredGate
        ? 'publish-gate knows RETIRED_STATUSES (Superseded blocks)'
        : 'publish-gate missing RETIRED_STATUSES — double-post risk on Superseded',
    ],
  );

  if (opts.offline) {
    for (const s of STAGES) {
      if (!probes[s.id]) mark(s.id, 'skip', ['offline mode — definition only']);
    }
    // attach local campaign probe into campaign_beat
    probes.campaign_beat = probes.campaign_beat_local;
    delete probes.campaign_beat_local;
    return probes;
  }

  // --- network probes ---
  const [landing, llms, plan, catalog, robots, sitemap, health] = await Promise.all([
    httpGet('https://thumbgate.app/'),
    httpGet('https://thumbgate.app/llms.txt'),
    httpGet('https://thumbgate.app/api/billing/plan'),
    httpGet('https://thumbgate.app/.well-known/ai-catalog.json'),
    httpGet('https://thumbgate.app/robots.txt'),
    httpGet('https://thumbgate.app/sitemap.xml'),
    httpGet('https://thumbgate.app/api/health'),
  ]);

  const dualCta =
    /sign_in_click/.test(landing.body) && /cloud_continuity_click/.test(landing.body);
  const faq =
    /FAQPage/.test(landing.body) ||
    /"@type"\s*:\s*"FAQPage"/.test(landing.body) ||
    /id=["']faq["']/.test(landing.body);
  const llmsHead = (llms.body.split('\n')[0] || '').trim();
  const llmsOk = llms.status === 200 && /^#\s*ThumbGate for Hermes/.test(llmsHead);

  mark('product_landing', landing.status === 200 && dualCta ? (faq ? 'ok' : 'warn') : 'fail', [
    `GET / status=${landing.status}`,
    dualCta ? 'dual funnel events present' : 'MISSING dual CTA funnel events',
    faq ? 'FAQPage or #faq present' : 'MISSING FAQPage/#faq on live HTML',
    health.status === 200 ? 'health 200' : `health status=${health.status}`,
  ]);

  let planJson = null;
  try {
    planJson = JSON.parse(plan.body);
  } catch {
    planJson = null;
  }
  const planOk =
    plan.status === 200 &&
    planJson &&
    planJson.configured === true &&
    planJson.active === true &&
    Number(planJson.unitAmount) > 0;
  mark('billing_rails', planOk ? 'ok' : 'fail', [
    `billing/plan status=${plan.status}`,
    planJson
      ? `configured=${planJson.configured} active=${planJson.active} unitAmount=${planJson.unitAmount}`
      : 'plan JSON parse failed',
  ]);

  mark(
    'aeo_discovery',
    llmsOk && faq && catalog.status === 200 ? 'ok' : faq || llmsOk ? 'warn' : 'fail',
    [
      `llms status=${llms.status} head=${llmsHead.slice(0, 60)}`,
      llmsOk ? 'llms heading ThumbGate for Hermes' : 'llms heading NOT ThumbGate for Hermes',
      faq ? 'FAQ present on landing' : 'FAQ missing on landing',
      `ai-catalog ${catalog.status}`,
      `robots ${robots.status} sitemap ${sitemap.status}`,
    ],
  );

  // campaign cadence
  const daysSinceLive = logSummary.lastLiveDate
    ? Math.floor((Date.now() - new Date(logSummary.lastLiveDate).getTime()) / 864e5)
    : 999;
  const campaignStatus =
    logSummary.liveCount14d > 0 && daysSinceLive <= 2
      ? 'ok'
      : logSummary.liveCount14d > 0 && daysSinceLive <= 4
        ? 'warn'
        : 'fail';
  mark('campaign_beat', campaignStatus, [
    ...(probes.campaign_beat_local?.evidence || []),
    `days since last LIVE=${Number.isFinite(daysSinceLive) ? daysSinceLive : 'n/a'}`,
    daysSinceLive <= 2 ? 'cadence OK (≤2d)' : 'cadence gap (>2d since last LIVE)',
  ]);
  delete probes.campaign_beat_local;

  // channel matrix sample — recent LIVE platforms
  mark('channel_reliability', logSummary.liveCount14d >= 3 ? 'ok' : 'warn', [
    `LIVE posts last 14d=${logSummary.liveCount14d}`,
    'Expect multi-channel matrix: LinkedIn,X,Bluesky,dev.to; Reddit draft-only; Hashnode FROZEN',
  ]);

  // outbound domain — recent send logs + optional Gmail token sendAs check
  // business_os/ is gitignored — in a worktree it may be empty; also scan the
  // primary checkout path agents usually keep private revenue logs in.
  const revDirs = [
    path.join(ROOT, 'business_os/revenue'),
    path.join(process.env.HOME || '', 'workspace/git/igor/mac-yolo-safeguards/business_os/revenue'),
  ].filter((d, i, a) => fileExists(d) && a.indexOf(d) === i);
  let smtpBroken = false;
  let sendLogHit = null;
  for (const revDir of revDirs) {
    const logs = fs
      .readdirSync(revDir)
      .filter((f) => /^agent-send-log-\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 5);
    for (const f of logs) {
      const t = fs.readFileSync(path.join(revDir, f), 'utf8');
      if (/535|PrivateEmail|authentication failed|CustomFromDenied/i.test(t)) {
        smtpBroken = true;
        sendLogHit = path.join(path.basename(revDir), f);
        break;
      }
    }
    if (smtpBroken) break;
  }
  const tokenPath = path.join(process.env.HOME || '', '.hermes/google_token.json');
  let sendAs = null;
  if (fileExists(tokenPath)) {
    const py = spawnSync(
      process.env.HERMES_GOOGLE_PYTHON || 'python3',
      [
        '-c',
        `import json,urllib.parse,urllib.request,pathlib
t=json.loads(pathlib.Path.home().joinpath('.hermes/google_token.json').read_text())
d=urllib.parse.urlencode({'client_id':t['client_id'],'client_secret':t['client_secret'],'refresh_token':t['refresh_token'],'grant_type':'refresh_token'}).encode()
at=json.loads(urllib.request.urlopen(urllib.request.Request(t['token_uri'],data=d),timeout=12).read())['access_token']
req=urllib.request.Request('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',headers={'Authorization':'Bearer '+at})
data=json.loads(urllib.request.urlopen(req,timeout=12).read())
for s in data.get('sendAs',[]):
  if s.get('sendAsEmail')=='igor@igorganapolsky.com':
    print(s.get('verificationStatus') or 'unknown'); break
else:
  print('missing')
`,
      ],
      { encoding: 'utf8', timeout: 20000 },
    );
    if (py.status === 0) sendAs = (py.stdout || '').trim();
  }
  const outboundStatus = smtpBroken
    ? 'fail'
    : sendAs === 'accepted'
      ? 'warn' // accepted API ≠ delivery; still warn until DSN-free probe
      : sendAs
        ? 'fail'
        : 'unknown';
  mark('outbound_domain', outboundStatus, [
    sendAs ? `sendAs igor@igorganapolsky.com verificationStatus=${sendAs}` : 'sendAs not checked (no token or probe fail)',
    smtpBroken
      ? `SMTP 535/PrivateEmail failure noted in ${sendLogHit}`
      : 'no 535 string in last 3 send logs (does not prove healthy delivery)',
    'Measure: domain From delivery without DSN + in:anywhere reply scan',
  ]);

  mark('design_partners', smtpBroken || sendAs === 'missing' ? 'fail' : 'warn', [
    smtpBroken || sendAs === 'missing'
      ? 'Domain mail blocked/missing — cannot recruit DPs from igor@ domain'
      : 'Domain sendAs accepted but delivery still gated on PrivateEmail SMTP',
    'Confirm ≤3 DP asks and hot reply count via Gmail in:anywhere',
    'Do not re-blast silent Jul 28 six without signal',
  ]);

  // cold pipeline via send-next / optional
  const sendNext = runNode(path.join(ROOT, 'tools/send-next.js'), []);
  const caughtUp = /caught up|No prospects/i.test(sendNext.stdout + sendNext.stderr);
  mark('cold_pipeline', 'ok', [
    caughtUp
      ? 'send-next: ready queue empty (correct — do not mint batch)'
      : `send-next exit=${sendNext.status}`,
    'Cold path secondary while Continuity DP + campaign beat are levers',
  ]);

  mark('attribution', 'warn', [
    'Spot-check content-log CTAs for utm_campaign + cta_id',
    'Run: node tools/social-campaign-ds.js --json (needs attribution dump for winners)',
  ]);

  const hasReceipt = fileExists(RECEIPT);
  let externalCents = null;
  if (hasReceipt) {
    try {
      const rec = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'));
      externalCents =
        rec.external_cents ?? rec.externalCents ?? rec.non_owner_cents ?? null;
    } catch {
      externalCents = null;
    }
  }
  mark('cash_recognition', hasReceipt ? 'ok' : 'warn', [
    hasReceipt
      ? `receipt present external_cents=${externalCents}`
      : 'NO revenue-receipt.json → fail-closed external $0.00 (not unknown)',
    'Never count owner Stripe as revenue',
  ]);

  // watch-only
  let redditPromoLive = false;
  if (!logSummary.missing) {
    const raw = fs.readFileSync(CONTENT_LOG, 'utf8');
    redditPromoLive = /Reddit\t[^\n]*\tPublished\thttps?:\/\//i.test(raw);
  }
  mark('watch_only_channels', redditPromoLive ? 'fail' : 'ok', [
    redditPromoLive
      ? 'Reddit row marked Published with URL — burn rule risk'
      : 'No Reddit Published promo URL in content log',
    'Skool freeze: watch vault Agent-State for SKOOL_DUPLICATE_POST_FREEZE',
  ]);

  return probes;
}

function severityRank(s) {
  return { critical: 0, important: 1, secondary: 2 }[s] ?? 9;
}

function renderMarkdown(stages, probes, asOf) {
  const lines = [];
  lines.push('# ThumbGate funnel stage health');
  lines.push('');
  lines.push(`AS_OF=${asOf}`);
  lines.push('');
  lines.push(
    'For every stage: **why it exists**, **what can go wrong**, **how we measure**. Probes attach live evidence.',
  );
  lines.push('');
  lines.push('| Stage | Severity | Probe |');
  lines.push('|-------|----------|-------|');
  for (const s of stages) {
    const p = probes[s.id] || { status: 'unknown', evidence: [] };
    lines.push(`| ${s.name} (\`${s.id}\`) | ${s.severity} | **${p.status.toUpperCase()}** |`);
  }
  lines.push('');
  for (const s of stages) {
    const p = probes[s.id] || { status: 'unknown', evidence: [] };
    lines.push(`## ${s.name}`);
    lines.push('');
    lines.push(`- **ID:** \`${s.id}\` · **Severity:** ${s.severity} · **Probe:** ${p.status}`);
    lines.push(`- **Why it exists:** ${s.why}`);
    lines.push('- **What can go wrong:**');
    for (const r of s.risks) lines.push(`  - ${r}`);
    lines.push('- **How we measure:**');
    for (const m of s.measure) lines.push(`  - ${m}`);
    if (p.evidence?.length) {
      lines.push('- **Evidence now:**');
      for (const e of p.evidence) lines.push(`  - ${e}`);
    }
    lines.push('');
  }
  lines.push('## Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('node tools/funnel-stage-health.js           # live probes + markdown');
  lines.push('node tools/funnel-stage-health.js --json    # machine-readable');
  lines.push('node tools/funnel-stage-health.js --offline # definitions only (CI)');
  lines.push('node tools/social-publish-gate.js --platform linkedin --campaign <id>');
  lines.push('node tools/verify-public-post.js --url <permalink> --must-contain thumbgate.app');
  lines.push('node tools/thumbgate-aeo-monitor.js --json');
  lines.push('node tools/payment-readiness.js');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(2);
  }
  if (args.help) {
    console.log(`Usage: node tools/funnel-stage-health.js [--json] [--offline] [--stage id]

Maps every ThumbGate GTM stage to: why / risks / measures, then probes live health.
Exit 1 if any critical stage probe is fail.
`);
    process.exit(0);
  }

  let stages = STAGES.slice().sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  if (args.stage) {
    stages = stages.filter((s) => s.id === args.stage);
    if (!stages.length) {
      console.error(`Unknown stage: ${args.stage}`);
      process.exit(2);
    }
  }

  const asOf = new Date().toISOString();
  const probes = await probeAll({ offline: args.offline });

  const criticalFails = stages.filter(
    (s) => s.severity === 'critical' && probes[s.id]?.status === 'fail',
  );

  const payload = {
    asOf,
    offline: args.offline,
    stages: stages.map((s) => ({
      ...s,
      probe: probes[s.id] || { status: 'unknown', evidence: [] },
    })),
    criticalFails: criticalFails.map((s) => s.id),
    ok: criticalFails.length === 0,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (args.markdown) {
    console.log(renderMarkdown(stages, probes, asOf));
  }

  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}

module.exports = {
  STAGES,
  parseContentLogSummary,
  probeAll,
  renderMarkdown,
  parseArgs,
};
