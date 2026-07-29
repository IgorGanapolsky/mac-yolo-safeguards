#!/usr/bin/env node
'use strict';

/**
 * design-partner-outreach.js — July 2026 research-aligned DP ask templates.
 *
 * Does NOT send. Prints personalized bodies for igor@ send or LinkedIn DM.
 * Usage:
 *   node tools/design-partner-outreach.js --name Maksim --company Erium --email maksim@erium.ai
 *   node tools/design-partner-outreach.js --list
 */

const CONT = 'https://thumbgate.app';
const DIAG = 'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k';

function parseArgs(argv) {
  const a = { name: '', company: '', email: '', channel: 'email', list: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--name') a.name = argv[++i] || '';
    else if (argv[i] === '--company') a.company = argv[++i] || '';
    else if (argv[i] === '--email') a.email = argv[++i] || '';
    else if (argv[i] === '--channel') a.channel = argv[++i] || 'email';
    else if (argv[i] === '--list') a.list = true;
    else if (argv[i] === '--help') a.help = true;
  }
  return a;
}

function emailBody({ name, company }) {
  const hi = name ? `Hi ${name.split(/\s+/)[0]} —` : 'Hi —';
  const co = company ? ` at ${company}` : '';
  return `${hi}

I'm recruiting **5 design partners** for ThumbGate Continuity (not a mass SaaS blast).

Pain we co-build against: the coding agent dies or thrash-burns when the **Mac lid closes**, or a loop runs with no hard stop. Free control plane stays free; Continuity is the paid offline continuation.

**Design phase (30–60 days):** free Continuity access, 45 min every other week, async notes within 5 days.
**After:** 50% off list for 12 months (list is live plan price on ${CONT}).

If that matches a real failure mode${co}, reply with:
1) which pain hits more (lid-close vs runaway loop), and
2) whether a biweekly call works.

Optional formal path: 60-min Agent Reliability Diagnostic (${DIAG}) if you want a written teardown before joining as DP.

If not a fit, "not now" is perfect.

— Igor Ganapolsky
igor@igorganapolsky.com
${CONT}
`;
}

function linkedInDm({ name, company }) {
  const n = name ? name.split(/\s+/)[0] : '';
  const co = company ? ` (${company})` : '';
  return `${n ? `${n} — ` : ''}co-building ThumbGate Continuity${co}: Mac primary, paid VPS only when the lid closes. Looking for 5 design partners — free during co-build, 50% off for a year after, 45 min biweekly. If runaway agents or offline Mac death is real for you, want in? ${CONT}`;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    console.log('Usage: node tools/design-partner-outreach.js --name N --company C [--email E] [--channel email|linkedin]');
    process.exit(0);
  }
  if (a.list) {
    console.log(
      JSON.stringify(
        {
          cont: CONT,
          diag: DIAG,
          icp: 'Staff/senior eng or EM, 20-200 ppl, Cursor/Claude daily, runaway or lid-close pain',
          cap: '5-10 partners',
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const payload = {
    channel: a.channel,
    to: a.email || null,
    subject:
      a.channel === 'email'
        ? 'Design partner for offline agent Continuity?'
        : null,
    body:
      a.channel === 'linkedin'
        ? linkedInDm({ name: a.name, company: a.company })
        : emailBody({ name: a.name, company: a.company }),
  };
  console.log(JSON.stringify(payload, null, 2));
}

module.exports = { emailBody, linkedInDm, CONT, DIAG };

if (require.main === module) main();
