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

const OUTREACH_SUBJECT_RE =
  /Quick close-loop|Governed agents|Reliability Diagnostic|Hardening Sprint|Partner Pilot|runaway-loop|agent reliability/i;

function parseArgs(argv) {
  const out = {
    json: false,
    chrome: true,
    baseline: false,
    help: false,
    dryRows: null,
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

function chromeCollectInboxRows() {
  const url =
    'https://mail.google.com/mail/u/0/#search/' +
    encodeURIComponent(
      'in:inbox (subject:(Quick close-loop) OR subject:(Governed agents) OR subject:(Reliability Diagnostic) OR "runaway-loop") newer_than:14d',
    );
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
        return JSON.stringify({ title: document.title, href: location.href.slice(0,160), rows });
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
    return { ok: true, rows: parsed.rows || [], title: parsed.title, href: parsed.href };
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
    `chrome_ok: ${summary.chromeOk}`,
    `rows_scanned: ${summary.rowsScanned}`,
    `hot: ${summary.hot.length}`,
    '',
    '## Hot leads (act with buyer-reply-packet)',
    '',
  ];
  if (!summary.hot.length) lines.push('_No new outreach replies matched._', '');
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

  if (args.dryRows) {
    rows = JSON.parse(args.dryRows);
    chromeOk = true;
  } else if (args.chrome) {
    const col = chromeCollectInboxRows();
    chromeOk = col.ok;
    chromeError = col.error || null;
    rows = col.rows || [];
  }

  const { hot, seen } = processRows(rows, {
    contacts,
    state,
    baseline: args.baseline,
  });
  state.seen = seen;
  state.lastRun = new Date().toISOString();
  saveState(state);

  const summary = {
    checkedAt: new Date().toISOString(),
    chromeOk,
    chromeError,
    rowsScanned: rows.length,
    hot,
    boardPath: null,
    baseline: args.baseline,
    ok: chromeOk || Boolean(args.dryRows),
  };
  summary.boardPath = writeBoard(revenueDir, summary);

  if (!args.baseline && hot.length && args.ntfy) {
    ntfyPush(
      'Gmail outreach REPLY',
      hot.map((h) => `${h.kind} ${h.email || h.prospect || h.id}: ${h.snippet.slice(0, 80)}`).join('\n'),
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
      `gmail-reply-scan chrome=${summary.chromeOk} rows=${summary.rowsScanned} hot=${summary.hot.length} board=${summary.boardPath}\n`,
    );
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
  OUTREACH_SUBJECT_RE,
};

if (require.main === module) main();
