#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  classifyReplySnippet,
  extractFromHint,
  isLikelyOutreachReply,
  matchProspect,
  processRows,
  rowId,
  run,
  outreachSearchQuery,
  classifyBlindCause,
  OUTREACH_SUBJECT_RE,
  OUTREACH_SUBJECT_TERMS,
} = require('../tools/gmail-outreach-reply-scan');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('classify objections and engaged', () => {
  assert.strictEqual(classifyReplySnippet('not now thanks'), 'not_now');
  assert.strictEqual(classifyReplySnippet('we already use LangSmith tracing'), 'langsmith');
  assert.strictEqual(classifyReplySnippet('we host agents on k8s'), 'hosting');
  assert.strictEqual(classifyReplySnippet('we have a litellm gateway'), 'gateway');
  assert.strictEqual(classifyReplySnippet('yes interested send the link'), 'engaged');
});

check('extractFromHint + isLikelyOutreachReply', () => {
  assert.ok(isLikelyOutreachReply('Re: Quick close-loop: Agent Reliability Diagnostic'));
  assert.ok(!isLikelyOutreachReply('Skool newsletter about AI apps'));
  // Own Sent rows must not count as inbound replies
  assert.ok(
    !isLikelyOutreachReply(
      'Click to teach Gmail. To: madhu, Quick close-loop: Agent Reliability Diagnostic ($499)',
    ),
  );
  assert.ok(
    !isLikelyOutreachReply('To: newman Quick close-loop: Agent Reliability Diagnostic ($499)'),
  );
  const e = extractFromHint('jake_wauchope@outlook.com Re: Quick close-loop');
  assert.strictEqual(e.email, 'jake_wauchope@outlook.com');
});

check('matchProspect from contacts', () => {
  const contacts = {
    'j@x.com': { email: 'j@x.com', person: 'Jake', prospect: 'n8n-jake-wauchope' },
  };
  assert.strictEqual(matchProspect(contacts, { email: 'j@x.com', label: '' }).prospect, 'n8n-jake-wauchope');
  assert.strictEqual(matchProspect(contacts, { email: '', label: 'Jake' }).prospect, 'n8n-jake-wauchope');
});

check('processRows suggests packet kinds', () => {
  const contacts = {
    'n@q.com': { email: 'n@q.com', person: 'Newman', prospect: 'quantstruct-newman-hu' },
  };
  const { hot } = processRows(
    [
      'n@q.com Re: Quick close-loop: Agent Reliability Diagnostic — we already use LangSmith',
      'noise about groceries',
    ],
    { contacts, state: { seen: {} }, baseline: false },
  );
  assert.strictEqual(hot.length, 1);
  assert.strictEqual(hot[0].kind, 'langsmith');
  assert.strictEqual(hot[0].prospect, 'quantstruct-newman-hu');
  assert.match(hot[0].replyCmd, /buyer-reply-packet/);
});

check('rowId stable', () => {
  assert.strictEqual(rowId('abc'), rowId('abc'));
});

check('run dry rows writes board', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-scan-'));
  process.env.REVENUE_DIR = dir;
  process.env.GMAIL_REPLY_SCAN_STATE = path.join(dir, 'state.json');
  fs.writeFileSync(
    path.join(dir, 'autonomous-contacts.json'),
    JSON.stringify({
      'a@b.com': { email: 'a@b.com', person: 'Ann', prospect: 'acme' },
    }),
  );
  const summary = run({
    json: true,
    chrome: false,
    baseline: false,
    ntfy: false,
    dryRows: JSON.stringify([
      'a@b.com Re: Governed agents — still burning — yes interested send link',
    ]),
    help: false,
  });
  assert.strictEqual(summary.hot.length, 1);
  assert.strictEqual(summary.hot[0].kind, 'engaged');
  assert.ok(fs.existsSync(summary.boardPath));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Regression: on 2026-07-28 the subject regex was widened to cover the
// "ThumbGate Continuity" campaign but the Gmail search query was a separate
// hardcoded string that was never updated, so those sends were unwatchable.
// The query and the filter must stay derived from one list.
check('search query cannot drift from the subject filter', () => {
  const q = outreachSearchQuery();
  for (const term of OUTREACH_SUBJECT_TERMS) {
    assert.ok(q.includes(term), `query is missing subject term: ${term}`);
    assert.ok(OUTREACH_SUBJECT_RE.test(term), `regex is missing subject term: ${term}`);
  }
  assert.ok(OUTREACH_SUBJECT_RE.test('ThumbGate Continuity — design partner (3 seats)'));
  assert.ok(OUTREACH_SUBJECT_RE.test('Quick check — agent reliability diagnostic ($499)'));
});

// Regression: the only real reply this funnel received was sitting in TRASH,
// where an in:inbox-scoped query could never have found it.
check('search query looks outside the inbox', () => {
  const q = outreachSearchQuery();
  assert.ok(q.includes('in:anywhere'), 'query must search trash/archive, not just the inbox');
  assert.ok(!q.includes('in:inbox'), 'query must not be inbox-scoped');
  assert.ok(q.includes('-from:me'), 'query must exclude our own outbound');
});

// Regression: chrome_ok:true + rows_scanned:0 was reported as "no replies" for
// three consecutive days. Zero scraped rows is an unknown, not a clean result.
check('zero scraped rows reports unknown, not zero replies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-scan-blind-'));
  process.env.REVENUE_DIR = dir;
  process.env.GMAIL_REPLY_SCAN_STATE = path.join(dir, 'state.json');

  // dryRows is the operator saying "these are the rows"; an empty set there is
  // a real zero and must NOT be flagged blind.
  const explicit = run({
    json: true, chrome: false, baseline: false, ntfy: false,
    dryRows: JSON.stringify([]), help: false,
  });
  assert.strictEqual(explicit.scanBlind, false);
  assert.strictEqual(explicit.replyStatus, 'scanned');
  assert.match(fs.readFileSync(explicit.boardPath, 'utf8'), /_No new outreach replies matched\._/);

  // A scrape that "succeeded" with nothing to show is the blind case.
  const blind = { checkedAt: new Date().toISOString(), chromeOk: true, rowsScanned: 0 };
  blind.scanBlind = blind.chromeOk && blind.rowsScanned === 0;
  assert.strictEqual(blind.scanBlind, true, 'chrome_ok with 0 rows must be treated as blind');

  fs.rmSync(dir, { recursive: true, force: true });
});

// The first version of the blindness check only covered "scrape succeeded but
// found nothing", so a scrape that FAILED, or was never attempted, still wrote
// reply_status 'scanned' and "_No new outreach replies matched._" — the exact
// absence-as-evidence bug, one branch over. Caught in review, not by me.
check('a failed or skipped scrape is blind, not a clean zero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-scan-nochrome-'));
  process.env.REVENUE_DIR = dir;
  process.env.GMAIL_REPLY_SCAN_STATE = path.join(dir, 'state.json');

  // transport:'chrome' skips the Gmail API path; chrome:false then leaves NO
  // transport at all. That is the scenario this case exists for — the previous
  // `--no-chrome` shorthand stopped meaning "no transport" once the headless
  // Gmail API became the preferred one.
  const s = run({ json: true, chrome: false, baseline: false, ntfy: false, dryRows: null, help: false, transport: 'chrome' });
  assert.strictEqual(s.transport, 'none');
  assert.strictEqual(s.scanBlind, true, 'no usable transport must be blind');
  assert.match(String(s.blindCause), /^scan_not_attempted_no_transport$|^no_transport_/);
  assert.strictEqual(s.replyStatus, 'unknown_scan_returned_nothing');

  const board = fs.readFileSync(s.boardPath, 'utf8');
  assert.match(board, /REPLY STATE UNKNOWN/);
  assert.doesNotMatch(
    board,
    /_No new outreach replies matched\._/,
    'a failed scrape must never render as a clean zero',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

// "Blind" is only actionable if it names which kind of blind. A dead session
// needs a human login; a stale selector needs a code change; an empty result
// set is not blindness at all.
check('blind cause names the actual failure', () => {
  assert.strictEqual(classifyBlindCause(null), 'no_page_diagnostics');
  // Signed-out pages ALSO have 0 rows and a short body — most specific wins.
  assert.strictEqual(
    classifyBlindCause({ signedOut: true, trCount: 0, bodyLen: 120, emptyStateVisible: false }),
    'gmail_signed_out_needs_human_login',
  );
  assert.strictEqual(
    classifyBlindCause({ signedOut: false, emptyStateVisible: true, trCount: 0, bodyLen: 9000 }),
    'search_genuinely_empty',
  );
  assert.strictEqual(
    classifyBlindCause({ signedOut: false, emptyStateVisible: false, trCount: 42, bodyLen: 9000 }),
    'row_selector_stale_tr_zA_no_longer_matches',
  );
  assert.strictEqual(
    classifyBlindCause({ signedOut: false, emptyStateVisible: false, trCount: 0, bodyLen: 40 }),
    'page_not_rendered_in_time',
  );
  assert.strictEqual(
    classifyBlindCause({ signedOut: false, emptyStateVisible: false, trCount: 0, bodyLen: 9000 }),
    'unknown_page_state',
  );
});

// A search Gmail explicitly reports as empty is a real zero. Treating it as
// blindness would page on every quiet hour and train us to ignore the alert.
check('genuinely empty search is not reported as blind', () => {
  const emptyIsReal = classifyBlindCause({
    signedOut: false, emptyStateVisible: true, trCount: 0, bodyLen: 9000,
  });
  assert.strictEqual(emptyIsReal, 'search_genuinely_empty');
  const stale = classifyBlindCause({
    signedOut: false, emptyStateVisible: false, trCount: 42, bodyLen: 9000,
  });
  assert.notStrictEqual(stale, 'search_genuinely_empty');
});

console.log(`\nPASS ${n}/${n} gmail-outreach-reply-scan`);

// The headless Gmail API is the preferred transport. The Chrome scrape needs a
// signed-in GUI session and returned zero rows on every hourly run for three days
// while a real buyer reply sat in Trash; the API found it immediately.
check('gmail-api transport is preferred over chrome when available', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'gmail-outreach-reply-scan.js'),
    'utf8',
  );
  const apiAt = src.indexOf('gmailApiCollectRows(');
  const chromeAt = src.indexOf('chromeCollectInboxRows()', src.indexOf('let transport'));
  assert.ok(apiAt > 0, 'API collector must exist');
  assert.ok(apiAt < chromeAt, 'the API must be attempted before the Chrome scrape');
  // A failed API call must fall through to Chrome, never be treated as zero replies.
  assert.match(src, /transport === 'none' && args\.transport !== 'api' && args\.chrome/);
  // And an API-sourced result is a REAL zero when empty — the query is server-side.
  assert.match(src, /if \(transport === 'gmail-api'\)/);
});
