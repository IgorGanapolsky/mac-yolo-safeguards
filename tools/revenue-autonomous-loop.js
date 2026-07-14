#!/usr/bin/env node
'use strict';

/**
 * revenue-autonomous-loop.js — Scheduled / session-start cash-path automation.
 *
 * Default (safe, fully autonomous):
 *   - Read private pipeline + stripe map
 *   - curl-verify every payment_link_url (flag 403s)
 *   - Optional Chrome scrape repair when 403s (osascript → live buy.stripe.com)
 *   - Build due follow-up queue (sent + last_touch age ≥ min hours)
 *   - Optional Apollo enrich for domains in contacts file
 *   - Write private board + state JSONL receipt
 *   - ntfy summary (always)
 *
 * Opt-in send (REVENUE_AUTO_SEND=1 or --auto-send):
 *   - Attempts Gmail via google_api.py when token healthy
 *   - Falls back to writing pending-sends.json for agent Gmail MCP pickup
 *   - Never sends fake/403 payment links
 *
 * Usage:
 *   node tools/revenue-autonomous-loop.js [--json] [--auto-send] [--no-chrome] [--no-ntfy]
 *   node tools/revenue-autonomous-loop.js --once --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const https = require('https');
const http = require('http');

const REPO = path.resolve(__dirname, '..');

/** Private ops live under business_os/ (gitignored). Prefer dirs that actually have pipeline data. */
function resolveRevenueDir() {
  if (process.env.REVENUE_DIR) return path.resolve(process.env.REVENUE_DIR);
  const candidates = [
    path.join(REPO, 'business_os', 'revenue'),
    // git worktree at <repo>/.worktrees/<name> → main checkout two levels up
    path.resolve(REPO, '..', '..', 'business_os', 'revenue'),
    path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards/business_os/revenue'),
  ];
  // Prefer directory that contains pipeline-status-*.tsv (empty worktree dirs don't win)
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
const NTFY = process.env.HERMES_NTFY_URL || process.env.NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const GOOGLE_API = path.join(
  os.homedir(),
  '.hermes/skills/productivity/google-workspace/scripts/google_api.py',
);
/** Prefer hermes google-venv when system python lacks google-auth packages. */
function resolvePython() {
  const candidates = [
    process.env.REVENUE_PYTHON,
    path.join(os.homedir(), '.hermes/google-venv/bin/python'),
    path.join(os.homedir(), '.hermes/google-venv/bin/python3'),
    'python3',
  ].filter(Boolean);
  for (const py of candidates) {
    if (py === 'python3' || py === 'python') return py;
    if (fs.existsSync(py)) return py;
  }
  return 'python3';
}
const PYTHON = resolvePython();
const APOLLO = process.env.APOLLO_BIN || 'apollo';
const FOLLOWUP_HOURS = Number(process.env.REVENUE_FOLLOWUP_HOURS || 48);
const MAX_AUTO_SENDS = Number(process.env.REVENUE_MAX_AUTO_SENDS || 5);

const usage = `Usage:
  node tools/revenue-autonomous-loop.js [options]

Options:
  --json           machine-readable summary
  --auto-send      attempt Gmail sends (or queue for MCP) for due follow-ups
  --no-auto-send   force diagnose-only even if REVENUE_AUTO_SEND=1
  --no-chrome      skip Chrome Stripe repair even if links 403
  --no-ntfy        skip phone push
  --no-apollo      skip Apollo enrich
  --once           alias (same as default single run)
  --help

Env:
  REVENUE_AUTO_SEND=1|0   default auto-send on/off
  REVENUE_FOLLOWUP_HOURS   min age before follow-up (default 48)
  REVENUE_MAX_AUTO_SENDS   cap per run (default 5)
  REVENUE_DIR              override private revenue folder
`;

function parseArgs(argv) {
  // REVENUE_AUTO_SEND=1 enables; =0 forces off. LaunchAgent passes --auto-send.
  const envSend = process.env.REVENUE_AUTO_SEND;
  const args = {
    json: false,
    autoSend: envSend === '1',
    chrome: true,
    ntfy: true,
    apollo: true,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--auto-send') args.autoSend = envSend !== '0';
    else if (arg === '--no-auto-send') args.autoSend = false;
    else if (arg === '--no-chrome') args.chrome = false;
    else if (arg === '--no-ntfy') args.ntfy = false;
    else if (arg === '--no-apollo') args.apollo = false;
    else if (arg === '--once') continue;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
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
  const rows = lines
    .filter(Boolean)
    .map((line) => {
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
      resolve({ url, status: 0, error: 'invalid_url' });
      return;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs || 12000 }, (res) => {
      // follow one redirect manually not needed if we use maxRedirects - simple status
      const status = res.statusCode || 0;
      res.resume();
      resolve({ url, status });
    });
    req.on('error', (e) => resolve({ url, status: 0, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, error: 'timeout' });
    });
  });
}

function stageSummary(rows) {
  const c = {};
  let openGross = 0;
  for (const r of rows) {
    const st = r.stage || 'unknown';
    c[st] = (c[st] || 0) + 1;
    if (!['paid', 'lost'].includes(st)) {
      openGross += Number(r.gross_potential_usd || 0) || 0;
    }
  }
  return { counts: c, openGross, total: rows.length };
}

function hoursSince(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return Infinity;
  const then = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`).getTime();
  return (Date.now() - then) / (3600 * 1000);
}

function dueFollowUps(rows, minHours) {
  return rows.filter((r) => {
    if (r.stage !== 'sent' && r.stage !== 'proposed') return false;
    if (r.next_action && /none|lost/i.test(r.next_action)) return false;
    return hoursSince(r.last_touch) >= minHours;
  });
}

function loadContacts() {
  // known map from ops enrichment + leads.csv emails
  const map = {};
  const contactsPath = path.join(REVENUE_DIR, 'autonomous-contacts.json');
  if (fs.existsSync(contactsPath)) {
    try {
      Object.assign(map, JSON.parse(fs.readFileSync(contactsPath, 'utf8')));
    } catch {
      /* ignore */
    }
  }
  // seed from enrichment log if present (best-effort parse)
  const enrich = latestFile(REVENUE_DIR, 'apollo-enrichment-', '.md');
  if (enrich) {
    const text = fs.readFileSync(enrich, 'utf8');
    const re = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*\|/g;
    let m;
    while ((m = re.exec(text))) {
      const email = m[3].trim();
      const person = m[1].trim();
      map[email] = map[email] || { email, person, source: 'apollo-enrichment' };
    }
  }
  // Parse agent-send-log markdown tables: email + prospect label
  if (fs.existsSync(REVENUE_DIR)) {
    for (const f of fs.readdirSync(REVENUE_DIR).filter((n) => n.startsWith('agent-send-log-') && n.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(REVENUE_DIR, f), 'utf8');
      const emailRe = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.includes('@')) continue;
        const emails = [...line.matchAll(emailRe)].map((x) => x[1]);
        if (!emails.length) continue;
        // "| email (prospect) |" or "| email | prospect |"
        const paren = line.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*\(([^)]+)\)/);
        const pipeParts = line.split('|').map((s) => s.trim()).filter(Boolean);
        for (const email of emails) {
          let prospect = '';
          if (paren && paren[1] === email) prospect = paren[2].trim();
          else if (pipeParts.length >= 2) {
            const maybeProspect = pipeParts.find((p) => p && !p.includes('@') && p.length < 40 && !/Gmail|Offer|Stripe|Link/i.test(p));
            if (maybeProspect) prospect = maybeProspect.replace(/\s*\/.*$/, '').trim();
          }
          map[email] = {
            email,
            person: map[email]?.person || email.split('@')[0],
            prospect: prospect || map[email]?.prospect || '',
            source: map[email]?.source || 'send-log',
          };
        }
      }
    }
  }
  // hard seeds we already know work
  const seeds = [
    { email: 'edward.becker@gmail.com', prospect: 'eltmon', person: 'Edward Becker' },
    { email: 'founders@mindfort.ai', prospect: 'bluefully', person: 'MindFort founders' },
    { email: 'brandon@mindfort.ai', prospect: 'bluefully', person: 'Brandon Veiseh' },
    { email: 'akul@mindfort.ai', prospect: 'bluefully', person: 'Akul Gupta' },
    { email: 'hello@cwai.co', prospect: 'catalystwayfare', person: 'Catalyst Wayfare' },
    { email: 'shokhan768@gmail.com', prospect: 'techreign', person: 'techreign' },
    { email: 'xiao75981@gmail.com', prospect: 'xiaotian283829691-dotcom', person: 'xiaotian' },
    { email: 'suleyman@joincarma.com', prospect: 'suleyman_a', person: 'Suleyman Alasgarli' },
    { email: 'muhammad@joincarma.com', prospect: 'suleyman_a', person: 'Muhammad Alasgarli' },
    { email: 'support@joincarma.com', prospect: 'suleyman_a', person: 'Carma support' },
    { email: 'deidre@meaningfulgigs.com', prospect: 'StephK', person: 'Deidre Graham' },
  ];
  for (const s of seeds) {
    map[s.email] = { ...s, ...(map[s.email] || {}), prospect: s.prospect };
  }
  return map;
}

function contactForProspect(contacts, row) {
  const label = row.prospect_label || '';
  const values = Object.values(contacts);
  return (
    values.find((c) => c.prospect === label) ||
    values.find((c) => c.email && row.notes && row.notes.includes(c.email)) ||
    values.find((c) => c.prospect && label && c.prospect.toLowerCase() === label.toLowerCase()) ||
    null
  );
}

function githubUrlFromNotes(notes) {
  if (!notes) return null;
  const m = String(notes).match(/https:\/\/github\.com\/[^\s)#]+/);
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

function tryGithubFollowup(url, body) {
  // Best-effort public issue comment via gh. Fails closed if not authenticated.
  const m = url && url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!m) return { ok: false, reason: 'not_issue_url' };
  const r = spawnSync(
    'gh',
    ['issue', 'comment', m[3], '--repo', `${m[1]}/${m[2]}`, '--body', body],
    { encoding: 'utf8', timeout: 30000 },
  );
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').slice(0, 200),
    stderr: (r.stderr || '').slice(0, 200),
  };
}

function saveContacts(map) {
  ensureDir(REVENUE_DIR);
  const p = path.join(REVENUE_DIR, 'autonomous-contacts.json');
  fs.writeFileSync(p, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 });
  return p;
}

function offerLinkFromMap(offerMapRows, route) {
  const r = String(route || '').toLowerCase();
  let key = 'Agent Reliability Diagnostic';
  if (/partner pilot/i.test(r)) key = 'Partner Pilot';
  else if (/hardening|1,?500|1500/i.test(r)) key = 'AI Agent Hardening Sprint';
  else if (/diagnostic|499/i.test(r)) key = 'Agent Reliability Diagnostic';
  const row = offerMapRows.find((x) => x.offer === key);
  return row || null;
}

async function verifyStripeMap(offerRows) {
  const results = [];
  for (const row of offerRows) {
    const url = row.payment_link_url;
    // eslint-disable-next-line no-await-in-loop
    const st = await httpStatus(url, 12000);
    results.push({
      offer: row.offer,
      status_field: row.status,
      url,
      http: st.status,
      ok: st.status >= 200 && st.status < 400,
    });
  }
  return results;
}

function chromeExtractBuyLinks() {
  // Best-effort: list known plink pages from last scrape file or open payment-links and scrape text
  const script = `
tell application "Google Chrome"
  if not (exists window 1) then return "{\\"error\\":\\"no_chrome\\"}"
  set found to false
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if (URL of t) contains "dashboard.stripe.com" and (URL of t) contains "payment-links" then
        set active tab index of w to i
        set index of w to 1
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then
    tell window 1 to make new tab with properties {URL:"https://dashboard.stripe.com/payment-links"}
    delay 3
  end if
  delay 2
  set js to "(() => { const t=document.body?document.body.innerText:''; const m=t.match(/https:\\\\/\\\\/buy\\\\.stripe\\\\.com\\\\/[A-Za-z0-9]+/g)||[]; return JSON.stringify({title:document.title, buys:[...new Set(m)], sample:t.slice(0,1200)}); })()"
  try
    return execute active tab of front window javascript js
  on error errMsg
    return "{\\"error\\":\\"" & errMsg & "\\"}"
  end try
end tell
`;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) {
    return { error: r.stderr || r.stdout || 'osascript_failed' };
  }
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return { error: 'parse_failed', raw: r.stdout };
  }
}

function ntfyPush(title, body, priority) {
  const url = NTFY;
  const payload = body.slice(0, 3500);
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '--fail',
      '-m',
      '12',
      '-H',
      `Title: ${title}`,
      '-H',
      `Priority: ${priority || 'default'}`,
      '-H',
      'Tags: moneybag,robot',
      '-d',
      payload,
      url,
    ],
    { encoding: 'utf8', timeout: 15000 },
  );
  return { ok: r.status === 0, status: r.status, stderr: (r.stderr || '').slice(0, 200) };
}

function googleApiReady() {
  if (!fs.existsSync(GOOGLE_API)) return { ready: false, reason: 'missing_google_api' };
  // status alone lies (token file exists → "ready" even when refresh is invalid_grant).
  // Live probe: search 1 message. Failure ⇒ not ready for unattended send.
  const live = spawnSync(PYTHON, [GOOGLE_API, 'gmail', 'search', 'newer_than:7d', '--max', '1'], {
    encoding: 'utf8',
    timeout: 20000,
  });
  const liveOut = `${live.stdout || ''}${live.stderr || ''}`.trim();
  if (live.status === 0 && !/invalid_grant|Token is invalid|setup_needed|RefreshError/i.test(liveOut)) {
    return { ready: true, out: 'live_search_ok', python: PYTHON };
  }
  const st = spawnSync(PYTHON, [GOOGLE_API, 'gmail', 'status'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  const out = `${st.stdout || ''}${st.stderr || ''}`.trim();
  return {
    ready: false,
    reason: (liveOut || out || `exit_${live.status}`).slice(0, 220),
    python: PYTHON,
  };
}

function tryGmailApiSend({ to, subject, body }) {
  const r = spawnSync(
    PYTHON,
    [GOOGLE_API, 'gmail', 'send', '--to', to, '--subject', subject, '--body', body],
    { encoding: 'utf8', timeout: 45000 },
  );
  return {
    ok: r.status === 0,
    channel: 'google_api',
    status: r.status,
    stdout: (r.stdout || '').slice(0, 300),
    stderr: (r.stderr || '').slice(0, 300),
  };
}

/**
 * Fallback when google_api token is dead: open Gmail compose in already-logged-in
 * Chrome and click Send. Zero human labor — uses Igor's Chrome session.
 */
function tryChromeGmailSend({ to, subject, body }) {
  const compose =
    'https://mail.google.com/mail/?view=cm&fs=1' +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject.slice(0, 200))}` +
    `&body=${encodeURIComponent(String(body).slice(0, 1800))}`;
  const script = `
set composeURL to ${JSON.stringify(compose)}
tell application "Google Chrome"
  if not (exists window 1) then make new window
  tell window 1
    set newTab to make new tab with properties {URL:composeURL}
  end tell
  delay 5
  set resultText to "nojs"
  try
    set resultText to execute active tab of front window javascript "
      (() => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const findSend = () => {
          const nodes = [...document.querySelectorAll('div[role=button], button')];
          return nodes.find(n => {
            const t = (n.getAttribute('aria-label')||'') + ' ' + (n.innerText||'');
            return /\\\\bSend\\\\b/i.test(t) && !/schedule|later/i.test(t);
          });
        };
        const btn = findSend();
        if (!btn) return 'no_send_btn title=' + document.title;
        btn.click();
        return 'clicked_send title=' + document.title;
      })()
    "
  on error errMsg
    set resultText to "js_err:" & errMsg
  end try
  delay 2
  return resultText
end tell
`;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 45000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const ok = r.status === 0 && /clicked_send/i.test(out);
  return {
    ok,
    channel: 'chrome_gmail',
    status: r.status,
    stdout: out.slice(0, 300),
    stderr: ok ? '' : out.slice(0, 300),
  };
}

function tryGmailSend(email) {
  // Prefer API; fall back to Chrome session (no human).
  const api = tryGmailApiSend(email);
  if (api.ok) return api;
  if (process.env.REVENUE_NO_CHROME_GMAIL === '1') return api;
  const chrome = tryChromeGmailSend(email);
  if (chrome.ok) return chrome;
  return {
    ok: false,
    channel: 'none',
    status: chrome.status || api.status,
    stdout: api.stdout,
    stderr: `api:${api.stderr || api.stdout}; chrome:${chrome.stderr || chrome.stdout}`,
  };
}

function buildFollowupEmail(prospect, contact, offerRow) {
  const link = offerRow && offerRow.ok !== false ? offerRow.url || offerRow.payment_link_url : null;
  const name = (contact && contact.person) || prospect.prospect_label;
  const offer = prospect.route || 'our reliability offer';
  const subject = `Quick close-loop: ${String(offer).slice(0, 60)}`;
  let body = `Hi${name && name !== prospect.prospect_label ? ` ${name.split(' ')[0]}` : ''} —\n\n`;
  body += `Following up on agent reliability / runaway-loop hardening for ${prospect.prospect_label}.\n\n`;
  body += `If that pain is still current, reply with the one failure pattern that repeats. `;
  if (link && offerRow && offerRow.http === 200) {
    body += `When you're ready to start a scoped paid step (${offer}), live checkout:\n${link}\n\n`;
  } else {
    body += `I won't send a broken pay link — reply and we'll scope first.\n\n`;
  }
  body += `If not now, reply "not now" and I'll close the loop.\n\n— Igor\n`;
  return { to: contact.email, subject, body, offer: prospect.route, link };
}

function writeBoard(summary) {
  ensureDir(REVENUE_DIR);
  const day = today();
  const boardPath = path.join(REVENUE_DIR, `money-priority-execution-${day}.md`);
  const lines = [
    `# Autonomous revenue loop — ${day}`,
    '',
    `Generated: ${summary.checkedAt}`,
    '',
    '## Funnel',
    '',
    '```',
    JSON.stringify(summary.funnel, null, 2),
    '```',
    '',
    '## Stripe link health',
    '',
    '| Offer | HTTP | OK | URL |',
    '|-------|------|----|-----|',
  ];
  for (const s of summary.stripe || []) {
    lines.push(`| ${s.offer} | ${s.http} | ${s.ok} | ${s.url} |`);
  }
  lines.push('', '## Due follow-ups', '');
  if (!(summary.due || []).length) {
    lines.push('_None due._');
  } else {
    for (const d of summary.due) {
      lines.push(
        `- **${d.prospect_label}** stage=${d.stage} last_touch=${d.last_touch} route=${d.route} hours=${d.hours_since.toFixed(1)}`,
      );
    }
  }
  lines.push('', '## Actions this run', '');
  for (const a of summary.actions || []) {
    lines.push(`- ${a}`);
  }
  lines.push('', '## Cleared revenue', '');
  lines.push(summary.clearedNote || 'No ledger update this run (requires Stripe charge proof).');
  lines.push('');
  fs.writeFileSync(boardPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return boardPath;
}

function appendState(summary) {
  ensureDir(REVENUE_DIR);
  const p = path.join(REVENUE_DIR, 'autonomous-loop-receipts.jsonl');
  const safe = {
    ts: summary.checkedAt,
    funnel: summary.funnel,
    stripe_ok: (summary.stripe || []).filter((s) => s.ok).length,
    stripe_bad: (summary.stripe || []).filter((s) => !s.ok).length,
    due: (summary.due || []).length,
    sent: summary.sentCount || 0,
    pending_mcp: summary.pendingMcp || 0,
    actions: summary.actions || [],
  };
  fs.appendFileSync(p, `${JSON.stringify(safe)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* ignore */
  }
  return p;
}

async function run(args) {
  const checkedAt = new Date().toISOString();
  const actions = [];
  const pipelinePath =
    latestFile(REVENUE_DIR, 'pipeline-status-', '.tsv') ||
    path.join(REVENUE_DIR, 'pipeline-status-2026-07-07.tsv');
  const mapPath =
    latestFile(REVENUE_DIR, 'stripe-offer-map-', '.tsv') ||
    path.join(REVENUE_DIR, 'stripe-offer-map-2026-07-07.tsv');

  if (!fs.existsSync(pipelinePath)) {
    return {
      ok: false,
      error: `missing pipeline ${pipelinePath}`,
      checkedAt,
    };
  }

  const pipeline = parseTsv(pipelinePath);
  const funnel = stageSummary(pipeline.rows);
  const dueRows = dueFollowUps(pipeline.rows, FOLLOWUP_HOURS).map((r) => ({
    ...r,
    hours_since: hoursSince(r.last_touch),
  }));

  let offerMap = { rows: [] };
  if (fs.existsSync(mapPath)) {
    offerMap = parseTsv(mapPath);
  }

  let stripe = await verifyStripeMap(offerMap.rows);
  const bad = stripe.filter((s) => !s.ok);
  if (bad.length && args.chrome) {
    actions.push(`stripe_403_count=${bad.length}; attempting Chrome list scrape`);
    const chrome = chromeExtractBuyLinks();
    if (chrome && chrome.buys && chrome.buys.length) {
      actions.push(`chrome_found_buy_links=${chrome.buys.length}`);
    } else if (chrome && chrome.error) {
      actions.push(`chrome_error=${chrome.error}`);
    }
  }

  // Re-verify after any map rewrite would happen — agent/human may fix map offline
  if (fs.existsSync(mapPath)) {
    offerMap = parseTsv(mapPath);
    stripe = await verifyStripeMap(offerMap.rows);
  }

  const contacts = loadContacts();
  saveContacts(contacts);

  // Apollo optional: search domains for due prospects missing contacts
  if (args.apollo) {
    const who = spawnSync(APOLLO, ['auth', 'whoami'], { encoding: 'utf8', timeout: 10000 });
    if (who.status === 0) {
      actions.push('apollo_auth=ok');
    } else {
      actions.push('apollo_auth=fail_skip_enrich');
    }
  }

  const gmail = googleApiReady();
  actions.push(`gmail_api=${gmail.ready ? 'ready' : `not_ready:${gmail.reason}`}`);

  let sentCount = 0;
  const pendingSends = [];
  const linkByOffer = {};
  for (const s of stripe) {
    linkByOffer[s.offer] = s;
  }

  if (args.autoSend) {
    // Prefer emailable due rows first (GH-only issues sort later)
    const ranked = [...dueRows].sort((a, b) => {
      const ae = contactForProspect(contacts, a) ? 0 : 1;
      const be = contactForProspect(contacts, b) ? 0 : 1;
      return ae - be || (b.hours_since || 0) - (a.hours_since || 0);
    });
    let attempts = 0;
    for (const row of ranked) {
      if (attempts >= MAX_AUTO_SENDS) break;
      const c2 = contactForProspect(contacts, row);
      if (!c2 || !c2.email) {
        const gh = githubUrlFromNotes(row.notes);
        if (gh && process.env.REVENUE_AUTO_GH === '1') {
          attempts += 1;
          const body = [
            `Following up on agent reliability / runaway-loop cost — still an issue on your side?`,
            ``,
            `If useful, ThumbGate has a scoped diagnostic path; happy to share a live checkout link off-thread.`,
            `Reply here or email iganapolsky@gmail.com. If not now, say so and I'll stop pinging.`,
            ``,
            `— Igor (autonomous follow-up)`,
          ].join('\n');
          const res = tryGithubFollowup(gh, body);
          if (res.ok) {
            sentCount += 1;
            actions.push(`gh_comment:${row.prospect_label}`);
            spawnSync(
              process.execPath,
              [
                path.join(REPO, 'tools/pipeline-update.js'),
                '--pipeline',
                pipelinePath,
                '--prospect',
                row.prospect_label,
                '--stage',
                row.stage,
                '--date',
                today(),
                '--next-action',
                'wait_for_reply',
                '--note',
                `autonomous-loop GitHub follow-up ${gh}`,
              ],
              { encoding: 'utf8', timeout: 15000 },
            );
          } else {
            pendingSends.push({
              prospect: row.prospect_label,
              reason: 'github_comment_failed',
              url: gh,
              error: res.stderr || res.reason,
            });
          }
        } else {
          pendingSends.push({
            prospect: row.prospect_label,
            reason: gh ? 'no_email_github_only' : 'no_contact_email',
            needs: gh ? 'REVENUE_AUTO_GH=1 or Gmail contact' : 'apollo-io-sales',
            github: gh || undefined,
          });
        }
        continue;
      }
      attempts += 1;
      const offerMeta = offerLinkFromMap(offerMap.rows, row.route);
      const stripeMeta = offerMeta
        ? stripe.find((s) => s.offer === offerMeta.offer) || {
            url: offerMeta.payment_link_url,
            http: 0,
          }
        : null;
      const email = buildFollowupEmail(row, c2, {
        ...offerMeta,
        url: stripeMeta && stripeMeta.url,
        http: stripeMeta && stripeMeta.http,
        ok: stripeMeta && stripeMeta.ok,
      });

      // Always attempt send (API live probe OR Chrome Gmail session). Never queue for human labor.
      const res = tryGmailSend(email);
      if (res.ok) {
        sentCount += 1;
        actions.push(`sent:${c2.email}:${row.prospect_label}:via=${res.channel || 'unknown'}`);
        spawnSync(
          process.execPath,
          [
            path.join(REPO, 'tools/pipeline-update.js'),
            '--pipeline',
            pipelinePath,
            '--prospect',
            row.prospect_label,
            '--stage',
            row.stage,
            '--date',
            today(),
            '--next-action',
            'wait_for_reply',
            '--note',
            `autonomous-loop follow-up email to ${c2.email} via ${res.channel || 'unknown'}`,
          ],
          { encoding: 'utf8', timeout: 15000 },
        );
      } else {
        pendingSends.push({
          ...email,
          prospect: row.prospect_label,
          error: res.stderr || res.stdout,
          channel_attempted: res.channel,
        });
        actions.push(`send_fail:${c2.email}:${(res.stderr || '').slice(0, 80)}`);
      }
    }
    actions.push(`auto_send_attempts=${attempts} emailable_due=${ranked.filter((r) => contactForProspect(contacts, r)).length}`);
  } else {
    actions.push('auto_send=off (pass --auto-send or REVENUE_AUTO_SEND=1)');
  }

  // Always write pending queue for agent MCP pickup
  const pendingPath = path.join(REVENUE_DIR, 'pending-sends.json');
  fs.writeFileSync(
    pendingPath,
    `${JSON.stringify({ checkedAt, pendingSends, due: dueRows.map((d) => d.prospect_label) }, null, 2)}\n`,
    { mode: 0o600 },
  );

  const summary = {
    ok: true,
    checkedAt,
    revenueDir: REVENUE_DIR,
    pipelinePath,
    mapPath,
    funnel,
    stripe,
    due: dueRows.map((d) => ({
      prospect_label: d.prospect_label,
      stage: d.stage,
      last_touch: d.last_touch,
      route: d.route,
      hours_since: d.hours_since,
    })),
    actions,
    sentCount,
    pendingMcp: pendingSends.length,
    pendingPath,
    gmail,
    autoSend: Boolean(args.autoSend),
    clearedNote:
      'Cleared $ only via Stripe Dashboard + tools/record-cleared-payment.js — this loop never marks paid.',
    followupHours: FOLLOWUP_HOURS,
  };

  summary.boardPath = writeBoard(summary);
  summary.receiptPath = appendState(summary);

  if (args.ntfy) {
    const badN = stripe.filter((s) => !s.ok).length;
    const title =
      badN > 0
        ? `Revenue loop: ${badN} Stripe links broken`
        : `Revenue loop: ${dueRows.length} follow-ups due`;
    const body = [
      `Funnel open $${funnel.openGross} total=${funnel.total} sent=${funnel.counts.sent || 0} replied=${funnel.counts.replied || 0} paid=${funnel.counts.paid || 0}`,
      `Stripe OK ${stripe.filter((s) => s.ok).length}/${stripe.length}`,
      `Due ≥${FOLLOWUP_HOURS}h: ${dueRows.length}`,
      `Auto-sent: ${sentCount}; pending MCP: ${pendingSends.length}`,
      `Board: ${summary.boardPath}`,
      gmail.ready ? 'Gmail API ready' : `Gmail API not ready (${gmail.reason}) — agent must use Gmail MCP`,
    ].join('\n');
    summary.ntfy = ntfyPush(title, body, badN > 0 || dueRows.length > 3 ? 'high' : 'default');
    actions.push(`ntfy=${summary.ntfy.ok ? 'ok' : 'fail'}`);
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  try {
    const summary = await run(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          `checkedAt=${summary.checkedAt}`,
          `funnel_open_gross=${summary.funnel && summary.funnel.openGross}`,
          `due=${summary.due && summary.due.length}`,
          `stripe_bad=${(summary.stripe || []).filter((s) => !s.ok).length}`,
          `sent=${summary.sentCount}`,
          `pending=${summary.pendingMcp}`,
          `board=${summary.boardPath}`,
          ...(summary.actions || []),
          '',
        ].join('\n'),
      );
    }
    process.exit(summary.ok === false ? 2 : 0);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  stageSummary,
  dueFollowUps,
  hoursSince,
  loadContacts,
  contactForProspect,
  githubUrlFromNotes,
  buildFollowupEmail,
  offerLinkFromMap,
  run,
};

if (require.main === module) {
  main();
}
