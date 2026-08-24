#!/usr/bin/env node
'use strict';

/**
 * Outreach critic — Netflix oci-agent steal (actor-critic, InfoQ 2026-08).
 *
 * Netflix's Critic agent rates every Actor output with a three-level verdict
 * and caveats before a human accepts it; their case study showed an
 * unreviewed LLM overstating an effect 4x. Our actor is the daily outreach
 * tick; before this tool existed, nothing independently rated a draft.
 *
 * Deliberately DETERMINISTIC, not an LLM rubric: this repo has shipped
 * self-scored "10/10 A+" theater harnesses three times. A critic you can
 * unit-test cannot flatter itself.
 *
 * Verdicts (Netflix's scale, verbatim):
 *   not_satisfactory          — hard failure: dishonest claim or missing consent/CTA basics
 *   satisfactory_with_caveats — sendable but flagged (length, weak personalization, hype)
 *   fully_satisfactory        — all checks pass
 *
 * Usage:
 *   node tools/outreach-critic.js --anchor "Golem" --anchor "Claude Code" < draft.txt
 *   critiqueDraft({ subject, body, anchors: ["Golem"] })  // as a library
 */

const HARD = [
  // Invented social proof or track record — the honesty covenant class.
  // Matches "500 customers", "500+ customers", "1,000+ users" — plus-suffixed
  // social-proof formats must not slip past (Codex review P2 on #1925).
  { re: /\b[\d][\d,]*\s*\+?\s*(?:happy\s+)?(?:customers?|clients?|users?|founders?|teams?)\b/i, why: 'claims a customer/user count (we have none to claim)' },
  { re: /\btrusted\s+by\b/i, why: '"trusted by" social-proof claim' },
  { re: /\b(?:SOC\s?2|ISO\s?27001|HIPAA|FedRAMP|certified|award[- ]winning)\b/i, why: 'certification/award claim (none are held)' },
  { re: /\bguarantee[ds]?\b/i, why: 'outcome guarantee' },
  { re: /\b(?:testimonial|case\s+study\s+shows|proven\s+results)\b/i, why: 'invented proof vocabulary' },
];

const HYPE = [
  { re: /\b(?:10x|revolutionary|game[- ]chang\w*|cutting[- ]edge|world[- ]class|unlock|skyrocket)\b/i, why: 'hype vocabulary' },
  { re: /\b(?:limited\s+time|act\s+now|last\s+chance|don.?t\s+miss)\b/i, why: 'false-scarcity vocabulary' },
];

const GENERIC_SUBJECTS = /^(?:quick\s+question|following\s+up|checking\s+in|touching\s+base|introduction|partnership\s+opportunity)\b/i;

// Protect scanner (Future AGI "Protect" steal, 2026-08-21): no outbound draft may
// leak a credential. Patterns are assembled from fragments so this source file
// itself never carries a contiguous key-shape (keeps secret scanners quiet). They
// are high-specificity (real prefixes / PEM headers / key= assignments), so honest
// copy never trips; scan reasons never echo the matched value.
const rx = (...parts) => new RegExp(parts.join(""));
const SECRET_PATTERNS = [
  { re: rx("\\b", "s", "k-", "ant-", "[A-Za-z0-9_-]{20,}"), why: "contains what looks like an Anthropic API key" },
  { re: rx("\\b", "s", "k-", "[A-Za-z0-9]{20,}"), why: "contains what looks like an OpenAI API key" },
  { re: rx("\\b", "AK", "IA", "[0-9A-Z]{16}\\b"), why: "contains what looks like an AWS access key id" },
  { re: rx("\\b", "gh", "[pousr]_", "[A-Za-z0-9]{30,}"), why: "contains what looks like a GitHub token" },
  { re: rx("\\b", "xox", "[baprs]-", "[A-Za-z0-9-]{10,}"), why: "contains what looks like a Slack token" },
  { re: rx("-----", "BEGIN ", "[A-Z ]*PRIVATE KEY", "-----"), why: "contains a private key block" },
  { re: rx("\\b", "Bearer", "\\s+[A-Za-z0-9._-]{20,}"), why: "contains a Bearer token" },
  { re: new RegExp("\\b(?:api[_-]?key|secret|token|password)\\s*[:=]\\s*[\x27\"]?[A-Za-z0-9/_+.=-]{16,}", "i"), why: "contains an inline credential assignment" },
];

// Scan text for leaked secrets. Reasons are safe (never echo the match). Exported
// so any outbound surface can gate on it.
function scanForSecrets(text) {
  const reasons = [];
  for (const rule of SECRET_PATTERNS) if (rule.re.test(String(text || ""))) reasons.push(rule.why);
  return reasons;
}

function critiqueDraft({ subject = '', body = '', anchors = [] }) {
  const caveats = [];
  const hard = [];

  for (const rule of HARD) if (rule.re.test(body) || rule.re.test(subject)) hard.push(rule.why);
  for (const leak of scanForSecrets(body + '\n' + subject)) hard.push(leak);

  // Consent + reachability basics: an honest cold note always carries both.
  if (!/reply\s+["'“]?no["'”]?/i.test(body) && !/unsubscribe|won.?t\s+write\s+again/i.test(body)) {
    hard.push('missing opt-out line');
  }
  if (!/cal\.com\/[\w-]+/i.test(body) && !/thumbgate\.app/i.test(body)) {
    hard.push('missing any call-to-action link (cal.com or thumbgate.app)');
  }

  // Personalization: the draft must reference something specific to the
  // prospect (their repo, post, or product name), supplied by the caller.
  if (anchors.length > 0) {
    const found = anchors.filter((a) => body.toLowerCase().includes(String(a).toLowerCase()));
    if (found.length === 0) hard.push('no personalization anchor present (' + anchors.join(', ') + ')');
  } else {
    caveats.push('no anchors supplied — personalization unverifiable');
  }

  for (const rule of HYPE) if (rule.re.test(body)) caveats.push(rule.why);
  if (body.length < 350) caveats.push('body under 350 chars — likely too thin to earn a reply');
  if (body.length > 1800) caveats.push('body over 1800 chars — too long for a cold note');
  if (GENERIC_SUBJECTS.test(subject.trim())) caveats.push('generic subject line');
  const links = (body.match(/https?:\/\//g) || []).length;
  if (links > 3) caveats.push(links + ' links — more than 3 reads as bulk mail');

  const verdict = hard.length > 0
    ? 'not_satisfactory'
    : caveats.length > 0
      ? 'satisfactory_with_caveats'
      : 'fully_satisfactory';
  return { verdict, hard, caveats };
}

module.exports = { critiqueDraft, scanForSecrets };

if (require.main === module) {
  const anchors = [];
  let subject = '';
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--anchor') anchors.push(String(argv[++i] || ''));
    else if (argv[i] === '--subject') subject = String(argv[++i] || '');
  }
  let body = '';
  process.stdin.on('data', (c) => { body += c; });
  process.stdin.on('end', () => {
    const result = critiqueDraft({ subject, body, anchors });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict === 'not_satisfactory' ? 1 : 0);
  });
}
