#!/usr/bin/env node
'use strict';

/**
 * gmail-outreach-reply-scan.js — High-ROI: find inbox replies to Diagnostic follow-ups.
 *
 * Scans Gmail (Chrome session) for threads related to our outreach subjects,
 * classifies snippets, suggests buyer-reply-packet kinds, writes a private board.
 *
 * Usage:
 *   node tools/gmail-outreach-reply-scan.js [--json] [--no-chrome] [--dry-rows-json '...']
 *   node tools/gmail-outreach-reply-scan.js --baseline   # first run: seed seen ids only
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  buildBuyerReplyPacket,
  OFFER_LADDER,
} = require('./governed-agent-sales-copy');

const REPO = path.resolve(__dirname, '..');

function resolveRevenueDir() {
  if (process.env.REVENUE_DIR) return path.resolve(process.env.REVENUE_DIR);
  const candidates = [
    path.join(REPO, 'business_os', 'revenue'),
    path.resolve(REPO, '..', '..', 'business_os', 'revenue'),
    path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards/business_os/revenue'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function resolveStatePath() {
  return (
    process.env.GMAIL_REPLY_SCAN_STATE ||
    path.join(os.homedir(), '.hermes', 'gmail-outreach-reply-scan-state.json')
  );
}

// Single source of truth for our outreach subject family. Both the local row
// filter and the Gmail search query are derived from this list. When the two
// drift apart the scan goes blind: on 2026-07-28 "ThumbGate Continuity" was
// added to the regex but not to the hardcoded query, so 6 of that day's sends
// were unwatchable.
const OUTREACH_SUBJECT_TERMS = [
  'Quick close-loop',
  'Quick check',
  'Governed agents',
  'Reliability Diagnostic',
  'agent reliability diagnostic',
  'Hardening Sprint',
  'Partner Pilot',
  'runaway-loop',
  'agent reliability',
  'ThumbGate Continuity',
  'design partner',
];

const OUTREACH_SUBJECT_RE = new RegExp(
  OUTREACH_SUBJECT_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

// in:anywhere, not in:inbox — the only real buyer reply this funnel has ever
// received (madhu@dhisana.ai, 2026-07-22) was sitting in TRASH, where an
// in:inbox scan could never have found it.
function outreachSearchQuery(days = 14) {
  const subjects = OUTREACH_SUBJECT_TERMS.map((t) => `subject:"${t}"`).join(' OR ');
  return `in:anywhere newer_than:${days}d -from:me (${subjects})`;
}

function parseArgs(argv) {
  const out = {
    json: false,
    chrome: true,
    baseline: false,
    help: false,
    dryRows: null,
    transport: 'auto', // auto | api | chrome
    ntfy: process.env.GMAIL_REPLY_SCAN_NTFY !== '0',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--no-chrome') out.chrome = false;
    else if (a === '--baseline') out.baseline = true;
    else if (a === '--no-ntfy') out.ntfy = false;
    else if (a === '--dry-rows-json') out.dryRows = argv[++i] || null;
    else if (a.startsWith('--transport=')) out.transport = a.split('=')[1];
  }
  return out;
}

/**
 * Classify an inbox snippet for next reply packet.
 */
function classifyReplySnippet(text) {
  const t = String(text || '');
  if (/not\s*now|unsubscribe|remove me|stop emailing|no longer interested/i.test(t)) {
    return 'not_now';
  }
  if (/langsmith|lang.?chain|observability|tracing only|we already (use|have).*(smith|trace)/i.test(t)) {
    return 'langsmith';
  }
  if (/hosting|kubernetes|ecs|bedrock agents?|we (already )?host|orchestration platform/i.test(t)) {
    return 'hosting';
  }
  if (/gateway|litellm|openrouter|base_url|we (already )?route/i.test(t)) {
    return 'gateway';
  }
  if (/interested|let'?s talk|schedule|book|how much|pricing|diagnostic|send (the )?link|yes/i.test(t)) {
    return 'engaged';
  }
  if (OUTREACH_SUBJECT_RE.test(t) && /Re:/i.test(t)) return 'engaged';
  return 'engaged';
}

function extractFromHint(rowText) {
  const t = String(rowText || '');
  // "From: jake Subject..." or leading name before Re:
  const m = t.match(/(?:From:)?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
  if (m) return { email: m[1].toLowerCase(), label: m[1].split('@')[0] };
  const name = t.match(/^(?:unread,?\s*)?([A-Za-z][A-Za-z0-9._-]{1,40})\s+(?:Re:|Quick|Governed)/i);
  if (name) return { email: '', label: name[1] };
  return { email: '', label: '' };
}

function isLikelyOutreachReply(rowText) {
  const t = String(rowText || '');
  // Must look like our outreach subject family
  if (!OUTREACH_SUBJECT_RE.test(t) && !/Re:.*(?:close-loop|Governed|Diagnostic)/i.test(t)) {
    return false;
  }
  // Sent-folder / own-outbound false positives: "To: madhu, Quick close-loop..." without Re:
  if (/\bTo:\s*[A-Za-z0-9._%+-]/i.test(t) && !/\bRe:\s*/i.test(t)) {
    return false;
  }
  // Prefer explicit reply marker or unread inbound
  if (/\bRe:\s*/i.test(t)) return true;
  if (/\bunread\b/i.test(t) && OUTREACH_SUBJECT_RE.test(t)) return true;
  // From-address + our subject (some Gmail list layouts)
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t) && OUTREACH_SUBJECT_RE.test(t)) {
    return true;
  }
  return false;
}

function loadContacts(revenueDir) {
  const p = path.join(revenueDir, 'autonomous-contacts.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function matchProspect(contacts, { email, label }) {
  const values = Object.values(contacts || {});
  if (email) {
    const hit = values.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
  }
  if (label) {
    const low = label.toLowerCase();
    const hit = values.find(
      (c) =>
        (c.person && c.person.toLowerCase().includes(low)) ||
        (c.prospect && c.prospect.toLowerCase().includes(low)) ||
        (c.email && c.email.toLowerCase().startsWith(`${low}@`)),
    );
    if (hit) return hit;
  }
  return null;
}

function rowId(rowText) {
  // stable-ish hash from first 120 chars
  const s = String(rowText || '').replace(/\s+/g, ' ').slice(0, 120);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `r_${h.toString(16)}`;
}

// Turn the page diagnostics into a named cause. Order matters: a signed-out
// page also has zero rows and a short body, so the most specific explanation
// has to win. 'search_genuinely_empty' is the one value that means the scan
// worked and the answer really is zero.
function classifyBlindCause(diag) {
  if (!diag) return 'no_page_diagnostics';
  if (diag.signedOut) return 'gmail_signed_out_needs_human_login';
  if (diag.emptyStateVisible) return 'search_genuinely_empty';
  if ((diag.trCount || 0) > 0) return 'row_selector_stale_tr_zA_no_longer_matches';
  if ((diag.bodyLen || 0) < 500) return 'page_not_rendered_in_time';
  return 'unknown_page_state';
}

// Headless Gmail via the google-workspace helper. This is the preferred transport:
// the Chrome scrape needs a signed-in GUI session, steals focus, breaks whenever
// Gmail changes its row markup, and on 2026-07-26..28 returned zero rows on every
// hourly run while a real buyer reply sat in Trash. The API path found that reply
// immediately. Chrome remains only as a fallback for machines without the token.
const GOOGLE_API_PY = path.join(
  os.homedir(),
  '.hermes/skills/productivity/google-workspace/scripts/google_api.py',
);

function gmailApiAvailable() {
  return fs.existsSync(GOOGLE_API_PY) && fs.existsSync(path.join(os.homedir(), '.hermes/google_token.json'));
}

function gmailApiCollectRows(days = 14) {
  if (!gmailApiAvailable()) return { ok: false, error: 'google_api_or_token_missing', rows: [] };
  const r = spawnSync(
    'python3',
    [GOOGLE_API_PY, 'gmail', 'search', outreachSearchQuery(days), '--max', '40'],
    { encoding: 'utf8', timeout: 60000 },
  );
  if (r.status !== 0) {
    // 403 insufficient scopes, expired refresh token, network — all are "unknown",
    // never "no replies". Carry the reason so the board can name it.
    const why = `${r.stderr || ''}`.trim().split('\n').pop() || `exit_${r.status}`;
    return { ok: false, error: `api_${why}`.slice(0, 120), rows: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout || '[]');
  } catch {
    return { ok: false, error: 'api_json_parse', rows: [] };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'api_unexpected_shape', rows: [] };
  // Render each message into the same one-line shape the Chrome scrape produced, so
  // the existing (tested) row filter, classifier and prospect matcher work unchanged.
  const rows = parsed.map((m) => {
    const unread = Array.isArray(m.labels) && m.labels.includes('UNREAD') ? 'unread ' : '';
    return `${unread}${m.from || ''} ${m.subject || ''} - ${m.snippet || ''}`.replace(/\s+/g, ' ').trim();
  });
  return { ok: true, rows, count: rows.length };
}

function chromeCollectInboxRows() {
  const url =
    'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(outreachSearchQuery());
  const script = `
set targetURL to ${JSON.stringify(url)}
tell application "Google Chrome"
  activate
  if not (exists window 1) then make new window
  set URL of active tab of window 1 to targetURL
  delay 8
  set resultText to "[]"
  try
    set resultText to execute active tab of window 1 javascript "
      (() => {
        const rows = [...document.querySelectorAll('tr.zA')].slice(0, 30).map(r =>
          (r.innerText || '').replace(/\\\\s+/g, ' ').slice(0, 200)
        );
        // Diagnostics for the zero-rows case. 'No rows' has several very
        // different causes and they are indistinguishable without these:
        //   signedOut          -> session expired, needs a human login
        //   emptyStateVisible  -> the search really did match nothing
        //   trCount>0 & rows=0 -> Gmail changed its row class, selector is stale
        //   all zero + short   -> page had not rendered within the delay
        const txt = (document.body && document.body.innerText) || '';
        return JSON.stringify({
          title: document.title,
          href: location.href.slice(0, 160),
          rows,
          diag: {
            trCount: document.querySelectorAll('tr').length,
            signedOut: /Sign in|Choose an account|couldn.t sign you in/i.test(txt.slice(0, 3000)),
            emptyStateVisible: /No messages matched your search|no conversations/i.test(txt),
            bodyLen: txt.length
          }
        });
      })()
    "
  on error errMsg
    set resultText to "{\\"error\\":\\"" & errMsg & "\\"}"
  end try
  return resultText
end tell
`;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 50000 });
  const raw = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) return { ok: false, error: `osascript_${r.status}`, rows: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ok: false, error: parsed.error, rows: [] };
    return {
      ok: true,
      rows: parsed.rows || [],
      title: parsed.title,
      href: parsed.href,
      diag: parsed.diag || null,
    };
  } catch {
    return { ok: false, error: 'json_parse', rows: [], raw: raw.slice(0, 200) };
  }
}

function processRows(rows, { contacts, state, baseline }) {
  const hot = [];
  const seen = state.seen || {};
  for (const rowText of rows || []) {
    if (!isLikelyOutreachReply(rowText)) continue;
    const id = rowId(rowText);
    const from = extractFromHint(rowText);
    const contact = matchProspect(contacts, from);
    const kind = classifyReplySnippet(rowText);
    const isNew = !seen[id];
    seen[id] = true;
    if (baseline) continue;
    if (!isNew && !process.env.GMAIL_REPLY_SCAN_INCLUDE_SEEN) continue;
    const packet = buildBuyerReplyPacket({
      kind,
      name: (contact && contact.person) || from.label || '',
      link: '',
      offer: OFFER_LADDER[0].label,
    });
    hot.push({
      id,
      isNew,
      kind,
      from,
      prospect: (contact && contact.prospect) || null,
      email: (contact && contact.email) || from.email || null,
      snippet: String(rowText).slice(0, 180),
      suggestedSubject: packet.subject,
      suggestedBodyPreview: packet.body.slice(0, 220),
      replyCmd: contact && contact.email
        ? `node tools/buyer-reply-packet.js --kind ${kind} --name ${JSON.stringify((contact.person || from.label || '').split(' ')[0])} --link <LIVE_STRIPE>`
        : `node tools/buyer-reply-packet.js --kind ${kind}`,
    });
  }
  return { hot, seen };
}

function writeBoard(revenueDir, summary) {
  fs.mkdirSync(revenueDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const boardPath = path.join(revenueDir, `gmail-reply-hot-leads-${day}.md`);
  const lines = [
    `# Gmail outreach replies — ${day}`,
    '',
    `Generated: ${summary.checkedAt}`,
    `transport: ${summary.transport}`,
    `chrome_ok: ${summary.chromeOk}`,
    `rows_scanned: ${summary.rowsScanned}`,
    `reply_status: ${summary.replyStatus || 'scanned'}`,
    `hot: ${summary.hot.length}`,
    '',
    '## Hot leads (act with buyer-reply-packet)',
    '',
  ];
  if (summary.scanBlind) {
    const REMEDY = {
      gmail_signed_out_needs_human_login:
        'Gmail is signed out in that Chrome profile. A human has to log in; no code change will fix it.',
      row_selector_stale_tr_zA_no_longer_matches:
        'The page has table rows but none match `tr.zA` — Gmail changed its markup. Update the selector.',
      page_not_rendered_in_time:
        'The page was still near-empty when read. Raise the delay in chromeCollectInboxRows.',
      no_page_diagnostics:
        'Ran before diagnostics existed, or the injected JS returned no diag block.',
      unknown_page_state: 'Page rendered with no rows and no recognised empty-state text.',
      scan_not_attempted_no_chrome:
        'Run with --no-chrome and no --dry-rows-json, so no mailbox was read at all.',
    };
    const remedy =
      REMEDY[summary.blindCause] ||
      (String(summary.blindCause).startsWith('scrape_failed_')
        ? 'The Chrome scrape itself errored — see blindCause for the osascript failure.'
        : 'Verify by hand before reporting a reply count.');
    lines.push(
      '> **REPLY STATE UNKNOWN — do not read this as "0 replies".**',
      `> cause: \`${summary.blindCause}\``,
      `> ${remedy}`,
      `> page title: ${summary.pageTitle || 'unknown'}`,
      `> diagnostics: ${JSON.stringify(summary.pageDiag)}`,
      '',
    );
  } else if (!summary.hot.length) {
    lines.push('_No new outreach replies matched._', '');
  }
  for (const h of summary.hot) {
    lines.push(
      `### ${h.prospect || h.email || h.from.label || h.id}`,
      '',
      `- kind: **${h.kind}**`,
      `- email: ${h.email || 'unknown'}`,
      `- snippet: ${h.snippet}`,
      `- cmd: \`${h.replyCmd}\``,
      '',
      'Suggested subject: ' + h.suggestedSubject,
      '',
      '```',
      h.suggestedBodyPreview,
      '```',
      '',
    );
  }
  fs.writeFileSync(boardPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return boardPath;
}

function loadState() {
  const statePath = resolveStatePath();
  try {
    if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    /* ignore */
  }
  return { seen: {} };
}

function saveState(state) {
  const statePath = resolveStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function ntfyPush(title, body) {
  const topic = process.env.NTFY_TOPIC || 'yolo-guard-fdh8ktuw1vtxb5sb';
  spawnSync(
    'curl',
    ['-sS', '-H', `Title: ${title}`, '-H', 'Priority: high', '-H', 'Tags: moneybag', '-d', body.slice(0, 900), `https://ntfy.sh/${topic}`],
    { encoding: 'utf8', timeout: 10000 },
  );
}

function run(args) {
  const revenueDir = resolveRevenueDir();
  const contacts = loadContacts(revenueDir);
  const state = loadState();
  let rows = [];
  let chromeOk = false;
  let chromeError = null;
  let pageDiag = null;
  let pageTitle = null;

  // Transport preference: operator-supplied rows > headless Gmail API > Chrome.
  // The API path is preferred because it needs no GUI session, cannot be broken by
  // a Gmail markup change, and searches in:anywhere reliably — the Chrome scrape
  // returned zero rows on every hourly run for three days while a real reply sat
  // in Trash.
  let transport = 'none';
  let apiError = null;

  if (args.dryRows) {
    rows = JSON.parse(args.dryRows);
    chromeOk = true;
    transport = 'dry-rows';
  } else {
    if (args.transport !== 'chrome') {
      const api = gmailApiCollectRows();
      if (api.ok) {
        rows = api.rows;
        transport = 'gmail-api';
      } else {
        apiError = api.error;
      }
    }
    // Fall back to Chrome only when the API could not be used at all. A failed API
    // call is NOT treated as "no replies" — if Chrome is also unavailable the run
    // is blind, and blindCause carries the API error.
    if (transport === 'none' && args.transport !== 'api' && args.chrome) {
      const col = chromeCollectInboxRows();
      chromeOk = col.ok;
      chromeError = col.error || null;
      rows = col.rows || [];
      pageDiag = col.diag || null;
      pageTitle = col.title || null;
      transport = 'chrome';
    }
  }

  const { hot, seen } = processRows(rows, {
    contacts,
    state,
    baseline: args.baseline,
  });
  state.seen = seen;
  state.lastRun = new Date().toISOString();
  saveState(state);

  // A successful scrape that returns zero rows is NOT evidence of zero replies.
  // It is equally consistent with a changed Gmail selector, a tab that never
  // finished loading, or a signed-out session — and it read as "no replies" for
  // three consecutive days (2026-07-26..28) while a real reply sat unhandled.
  // EVERY path that does not end in a trustworthy row set is blind. An earlier
  // version of this check only covered "scrape succeeded but found nothing", so
  // a scrape that FAILED — or was never attempted — still reported
  // reply_status 'scanned' and "_No new outreach replies matched._". That is
  // the same absence-as-evidence bug this file exists to prevent, one branch
  // over: a dead Chrome session looked identical to an empty mailbox.
  const blindCause = (() => {
    if (args.dryRows) return null; // the operator supplied the rows; trust them
    if (transport === 'gmail-api') {
      // The API answered. Zero results here IS a real zero: the query is exact,
      // ran server-side over in:anywhere, and cannot be defeated by page markup.
      return null;
    }
    if (transport === 'none') {
      // Neither transport produced anything — the API failed (or was absent) and
      // Chrome was unavailable or disabled. Reply state is unknown, not zero.
      return apiError ? `no_transport_${apiError}` : 'scan_not_attempted_no_transport';
    }
    if (!chromeOk) return `scrape_failed_${chromeError || 'unknown'}`;
    if (rows.length === 0) return classifyBlindCause(pageDiag);
    return null;
  })();

  // 'search_genuinely_empty' is the one cause meaning the scan worked and the
  // answer really is zero. Everything else stays blind.
  const reallyBlind = Boolean(blindCause) && blindCause !== 'search_genuinely_empty';

  const summary = {
    checkedAt: new Date().toISOString(),
    transport,
    apiError,
    chromeOk,
    chromeError,
    rowsScanned: rows.length,
    scanBlind: reallyBlind,
    blindCause,
    pageTitle: reallyBlind ? pageTitle : undefined,
    pageDiag: reallyBlind ? pageDiag : undefined,
    replyStatus: reallyBlind ? 'unknown_scan_returned_nothing' : 'scanned',
    hot,
    boardPath: null,
    baseline: args.baseline,
    ok: transport === 'gmail-api' || chromeOk || Boolean(args.dryRows),
  };
  summary.boardPath = writeBoard(revenueDir, summary);

  if (!args.baseline && hot.length && args.ntfy) {
    ntfyPush(
      'Gmail outreach REPLY',
      hot.map((h) => `${h.kind} ${h.email || h.prospect || h.id}: ${h.snippet.slice(0, 80)}`).join('\n'),
    );
  }

  // Page on blindness too. A silently blind monitor is worse than no monitor:
  // it manufactures a "0 replies" fact that downstream reports then repeat.
  if (!args.baseline && reallyBlind && args.ntfy) {
    ntfyPush(
      'Gmail reply scan BLIND',
      `cause: ${blindCause}\npage: ${pageTitle || 'unknown'}\nquery: ${outreachSearchQuery()}\nReply state is UNKNOWN, not zero.`,
    );
  }
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/gmail-outreach-reply-scan.js [--json] [--baseline] [--no-chrome] [--dry-rows-json]\n',
    );
    process.exit(0);
  }
  const summary = run(args);
  if (args.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else {
    process.stdout.write(
      `gmail-reply-scan transport=${summary.transport} rows=${summary.rowsScanned} status=${summary.replyStatus} hot=${summary.hot.length} board=${summary.boardPath}\n`,
    );
    if (summary.scanBlind) {
      process.stdout.write(
        '  WARNING: scrape returned 0 rows — reply state is UNKNOWN, not zero.\n',
      );
    }
    for (const h of summary.hot) {
      process.stdout.write(`  HOT kind=${h.kind} email=${h.email || '-'} prospect=${h.prospect || '-'}\n`);
    }
  }
  process.exit(summary.ok === false ? 2 : 0);
}

module.exports = {
  parseArgs,
  classifyReplySnippet,
  extractFromHint,
  isLikelyOutreachReply,
  matchProspect,
  processRows,
  rowId,
  run,
  classifyBlindCause,
  outreachSearchQuery,
  OUTREACH_SUBJECT_RE,
  OUTREACH_SUBJECT_TERMS,
};

if (require.main === module) main();
