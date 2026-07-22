#!/usr/bin/env node
'use strict';

/**
 * governed-agent-sales-copy.js — High-ROI buyer language for ThumbGate offers.
 *
 * Maps the 2026 "governed agents" frame (visibility / control / assure) to our
 * paid ladder without pretending we are an enterprise LLM gateway vendor.
 *
 * Used by: revenue-autonomous-loop follow-ups, buyer-reply-packet CLI, playbook.
 */

const TEMPLATE_VERSION = 'revenue-autonomous-followup-v2-governed';

const OFFER_LADDER = [
  {
    key: 'diagnostic',
    label: 'Agent Reliability Diagnostic ($499)',
    entry: 'visibility-led',
    oneLiner:
      'Map where tokens, retries, and tool actions burn — and which hop has no hard stop.',
  },
  {
    key: 'hardening',
    label: 'AI Agent Hardening Sprint ($1,500)',
    entry: 'control-led',
    oneLiner:
      'Install fail-closed budgets, tool permissioning, and stop conditions on the real agent path.',
  },
  {
    key: 'pilot',
    label: 'Partner Pilot ($3,000)',
    entry: 'assurance-led',
    oneLiner:
      'Operate governed agents with evidence: policy → enforcement → receipts, not PDF theater.',
  },
];

const WEDGES = {
  langsmith:
    'Tracing and an LLM gateway show cost after the fact. They do not hard-stop a runaway coding agent thrashing a Mac, re-running tools, or burning tokens without a finish condition. Visibility ≠ local loop enforcement.',
  hosting:
    'Hosting / orchestration moves work; it does not enforce OS-level stop, spend caps, or approval on tool hops when agents loop. Orchestration ≠ reliability control plane for runaway sessions.',
  we_have_gateway:
    'A base_url gateway is necessary but not sufficient. The failure we fix is action risk: which tools fire, which credentials, when a human must approve, and what fails closed when spend spikes.',
  not_now:
    'Understood — closing the loop. If a single unattended session ever burns a week of budget before anyone notices, reply with that failure pattern.',
};

function firstName(person, prospectLabel) {
  if (person && person !== prospectLabel) {
    const part = String(person).trim().split(/\s+/)[0];
    if (part && part.length < 40 && !part.includes('@')) return part;
  }
  return '';
}

function offerShort(route) {
  const r = String(route || '');
  if (/pilot|3000|3,000/i.test(r)) return OFFER_LADDER[2].label;
  if (/harden|1500|1,500|sprint/i.test(r)) return OFFER_LADDER[1].label;
  return OFFER_LADDER[0].label;
}

/**
 * Follow-up email after first touch (autonomous loop).
 * @returns {{ to: string, subject: string, body: string, offer: string, link: string|null, template: string }}
 */
function buildGovernedFollowupEmail(prospect, contact, offerRow) {
  const link =
    offerRow && offerRow.ok !== false ? offerRow.url || offerRow.payment_link_url : null;
  const httpOk = offerRow && Number(offerRow.http) === 200;
  const label = (prospect && prospect.prospect_label) || 'your team';
  const name = firstName(contact && contact.person, label);
  const offer = offerShort(prospect && prospect.route);
  const subject = `Governed agents — still burning on ${String(offer).slice(0, 48)}?`;

  let body = `Hi${name ? ` ${name}` : ''} —\n\n`;
  body += `Following up on agent reliability for ${label}.\n\n`;
  body +=
    `Industry frame this week: governance without a runtime hard stop is theater. ` +
    `A single unattended coding agent, retry loop, or bad batch can burn thousands before anyone notices.\n\n`;
  body +=
    `ThumbGate scopes that as three layers — visibility (where spend/actions go), ` +
    `control (budgets + tool permissioning + fail-closed stops), assure (receipts that policy actually fired).\n\n`;
  body += `If that pain is still current, reply with the one failure pattern that repeats. `;
  if (link && httpOk) {
    body += `When you're ready for a scoped paid step (${offer}), live checkout:\n${link}\n\n`;
  } else {
    body += `I won't send a broken pay link — reply and we'll scope first.\n\n`;
  }
  body += `If not now, reply "not now" and I'll close the loop.\n\n— Igor\n`;

  return {
    to: contact && contact.email,
    subject,
    body,
    offer: (prospect && prospect.route) || offer,
    link: link && httpOk ? link : null,
    template: TEMPLATE_VERSION,
  };
}

function buildGithubFollowupBody() {
  return [
    `Following up on agent reliability / runaway-loop cost — still an issue on your side?`,
    ``,
    `Governance docs without a runtime hard stop don't cap unattended sessions. ` +
      `If useful, ThumbGate has a scoped diagnostic (visibility → control → assure); happy to share a live checkout link off-thread.`,
    `Reply here or email iganapolsky@gmail.com. If not now, say so and I'll stop pinging.`,
    ``,
    `— Igor (autonomous follow-up)`,
  ].join('\n');
}

/**
 * Buyer replied or asked a question — paste-ready packets (no auto-send).
 */
function buildBuyerReplyPacket(opts = {}) {
  const kind = String(opts.kind || 'engaged').toLowerCase();
  const name = opts.name ? String(opts.name).trim() : '';
  const link = opts.link ? String(opts.link).trim() : '';
  const offer = opts.offer ? String(opts.offer).trim() : OFFER_LADDER[0].label;
  const hi = name ? `Hi ${name.split(/\s+/)[0]} —\n\n` : 'Hi —\n\n';

  if (kind === 'not_now' || kind === 'not-now') {
    return {
      kind: 'not_now',
      subject: 'Closing the loop',
      body: `${hi}${WEDGES.not_now}\n\n— Igor\n`,
    };
  }

  if (kind === 'objection_langsmith' || kind === 'langsmith') {
    return {
      kind: 'objection_langsmith',
      subject: 'Gateway vs hard stop',
      body:
        `${hi}${WEDGES.langsmith}\n\n` +
        `If you want the $499 Diagnostic to map the first gap (visibility only), ` +
        (link ? `live checkout:\n${link}\n\n` : `reply and I'll send a live checkout once verified.\n\n`) +
        `— Igor\n`,
    };
  }

  if (kind === 'objection_hosting' || kind === 'hosting') {
    return {
      kind: 'objection_hosting',
      subject: 'Hosting ≠ loop enforcement',
      body:
        `${hi}${WEDGES.hosting}\n\n` +
        `Scoped next step: ${offer}. ` +
        (link ? `Live checkout:\n${link}\n\n` : '') +
        `— Igor\n`,
    };
  }

  if (kind === 'objection_gateway' || kind === 'gateway') {
    return {
      kind: 'objection_gateway',
      subject: 'Gateway is necessary, not sufficient',
      body: `${hi}${WEDGES.we_have_gateway}\n\n— Igor\n`,
    };
  }

  // engaged default
  return {
    kind: 'engaged',
    subject: `Next step — ${offer}`,
    body:
      `${hi}Thanks for the reply.\n\n` +
      `To keep this concrete: name the one failure pattern that repeats (retry loop, tool thrash, spend spike, silent hang). ` +
      `I'll map it to visibility → control → assure and keep the paid step scoped.\n\n` +
      (link
        ? `If you already want the ${offer}:\n${link}\n\n`
        : `When you're ready for ${offer}, I'll send a curl-verified checkout only.\n\n`) +
      `— Igor\n`,
  };
}

function ladderMarkdown() {
  return OFFER_LADDER.map(
    (o) => `- **${o.label}** (${o.entry}): ${o.oneLiner}`,
  ).join('\n');
}

module.exports = {
  TEMPLATE_VERSION,
  OFFER_LADDER,
  WEDGES,
  firstName,
  offerShort,
  buildGovernedFollowupEmail,
  buildGithubFollowupBody,
  buildBuyerReplyPacket,
  ladderMarkdown,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const kindIdx = args.indexOf('--kind');
  const kind = kindIdx >= 0 ? args[kindIdx + 1] : 'engaged';
  const nameIdx = args.indexOf('--name');
  const name = nameIdx >= 0 ? args[nameIdx + 1] : '';
  const linkIdx = args.indexOf('--link');
  const link = linkIdx >= 0 ? args[linkIdx + 1] : '';
  const packet = buildBuyerReplyPacket({ kind, name, link });
  process.stdout.write(`Subject: ${packet.subject}\n\n${packet.body}`);
}
