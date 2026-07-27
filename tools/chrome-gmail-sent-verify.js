#!/usr/bin/env node
'use strict';

/**
 * chrome-gmail-sent-verify.js — Prove a Gmail send landed in Sent.
 *
 * clicked_send alone is not delivery proof (proven 2026-07-22). Scan Sent via
 * Chrome JS (iganapolsky@gmail.com session) and match recipient/subject.
 *
 * Usage:
 *   node tools/chrome-gmail-sent-verify.js --to newman@quantstruct.com
 *   node tools/chrome-gmail-sent-verify.js --to a@b.com --subject "Governed"
 *   node tools/chrome-gmail-sent-verify.js --json --query "in:sent newer_than:1d"
 */

const { spawnSync } = require('child_process');

const DEFAULT_ME = 'iganapolsky@gmail.com';

function parseArgs(argv) {
  const out = {
    to: '',
    subject: '',
    query: '',
    json: false,
    help: false,
    dryRows: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--to') out.to = argv[++i] || '';
    else if (a === '--subject') out.subject = argv[++i] || '';
    else if (a === '--query') out.query = argv[++i] || '';
    else if (a === '--dry-rows-json') out.dryRows = argv[++i] || null;
  }
  return out;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function localPart(email) {
  const e = normalizeEmail(email);
  const i = e.indexOf('@');
  return i > 0 ? e.slice(0, i) : e;
}

/**
 * Match a Sent-folder row text against recipient / subject.
 * Gmail often shows only first name / local-part in the list view.
 */
function rowMatches({ rowText, to, subject }) {
  const t = String(rowText || '');
  if (subject && !new RegExp(escapeRegExp(subject).slice(0, 40), 'i').test(t)) {
    return false;
  }
  if (!to) return Boolean(subject);
  const full = normalizeEmail(to);
  const local = localPart(to);
  if (full && t.toLowerCase().includes(full)) return true;
  // "To: newman Quick close-loop..." style
  if (local && local.length >= 3) {
    const re = new RegExp(`\\bTo:\\s*${escapeRegExp(local)}\\b`, 'i');
    if (re.test(t)) return true;
    if (new RegExp(`\\b${escapeRegExp(local)}\\b`, 'i').test(t) && /Quick close-loop|Governed agents|Reliability Diagnostic/i.test(t)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evaluateSentRows(rows, { to, subject } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const hits = list.filter((rowText) => rowMatches({ rowText, to, subject }));
  return {
    ok: hits.length > 0,
    totalRows: list.length,
    hitCount: hits.length,
    hits: hits.slice(0, 10),
    to: to || null,
    subject: subject || null,
  };
}

function buildSentSearchUrl({ to, subject, query }) {
  if (query) {
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
  }
  const parts = ['in:sent'];
  if (to) {
    const local = localPart(to);
    parts.push(local || to);
  }
  if (subject) parts.push(subject.slice(0, 48));
  if (parts.length === 1) parts.push('newer_than:1d');
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(parts.join(' '))}`;
}

function chromeCollectSentRows({ url, delaySec = 7 } = {}) {
  const target =
    url || 'https://mail.google.com/mail/u/0/#sent';
  const script = `
set targetURL to ${JSON.stringify(target)}
tell application "Google Chrome"
  activate
  if not (exists window 1) then make new window
  set URL of active tab of window 1 to targetURL
  delay ${Number(delaySec) || 7}
  set resultText to "[]"
  try
    set resultText to execute active tab of window 1 javascript "
      (() => {
        const rows = [...document.querySelectorAll('tr.zA')].slice(0, 40).map(r =>
          (r.innerText || '').replace(/\\\\s+/g, ' ').slice(0, 180)
        );
        return JSON.stringify({
          title: document.title,
          href: location.href.slice(0, 160),
          rows
        });
      })()
    "
  on error errMsg
    set resultText to "{\\"error\\":\\"" & errMsg & "\\"}"
  end try
  return resultText
end tell
`;
  const r = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 45000,
  });
  const raw = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    return { ok: false, error: `osascript_exit_${r.status}`, raw: raw.slice(0, 300), rows: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ok: false, error: parsed.error, rows: [], raw: raw.slice(0, 300) };
    return {
      ok: true,
      title: parsed.title,
      href: parsed.href,
      rows: parsed.rows || [],
    };
  } catch {
    return { ok: false, error: 'json_parse', raw: raw.slice(0, 300), rows: [] };
  }
}

/**
 * End-to-end: open Sent (or search) and check for recipient.
 */
function verifyChromeGmailSent({ to, subject, query, delaySec } = {}) {
  const url = buildSentSearchUrl({ to, subject, query });
  const collected = chromeCollectSentRows({ url, delaySec });
  if (!collected.ok) {
    return {
      ok: false,
      verified: false,
      channel: 'chrome_gmail_sent',
      error: collected.error,
      raw: collected.raw,
      ...evaluateSentRows([], { to, subject }),
    };
  }
  const evaled = evaluateSentRows(collected.rows, { to, subject });
  return {
    ...evaled,
    verified: evaled.ok,
    channel: 'chrome_gmail_sent',
    title: collected.title,
    href: collected.href,
    sample: (collected.rows || []).slice(0, 5),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/chrome-gmail-sent-verify.js --to email [--subject text] [--query q] [--json]\n',
    );
    process.exit(0);
  }
  let result;
  if (args.dryRows) {
    let rows;
    try {
      rows = JSON.parse(args.dryRows);
    } catch {
      process.stderr.write('bad --dry-rows-json\n');
      process.exit(2);
    }
    result = evaluateSentRows(rows, { to: args.to, subject: args.subject });
    result.channel = 'dry';
  } else {
    result = verifyChromeGmailSent({
      to: args.to,
      subject: args.subject,
      query: args.query,
    });
  }
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(
      `verified=${result.ok} hits=${result.hitCount} total=${result.totalRows} to=${args.to || '-'}\n`,
    );
    for (const h of result.hits || []) process.stdout.write(`  HIT ${h}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  DEFAULT_ME,
  parseArgs,
  normalizeEmail,
  localPart,
  rowMatches,
  evaluateSentRows,
  buildSentSearchUrl,
  chromeCollectSentRows,
  verifyChromeGmailSent,
};

if (require.main === module) main();
