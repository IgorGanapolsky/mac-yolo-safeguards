'use strict';

/**
 * One buyer URL is not an experiment. The live listing stays at its price.
 * A demo row is not a sale. The Confidence Agent onboarding email is vendor
 * onboarding, not a buyer lead or an autopilot license. This module never
 * calls Confidence, never installs the remote Confidence MCP or Slack bot,
 * never connects GitHub to Confidence, and never rewrites a listing.
 */

const PRODUCT = 'Mac YOLO Safeguards';
const OFFER_URL = 'https://iganapolsky.gumroad.com/l/nllmvb';
const PRICE_CENTS = 4900;

const FOUNDER = [
  'iganapolsky@gmail.com',
  'igor@igorganapolsky.com',
  'igor.ganapolsky@icloud.com',
  'ig5973700@gmail.com',
  'founder@dayglass.app',
  'pro@dayglass.app',
];

const VENDOR_ONBOARDING_SENDERS = [
  'jsoderholm@confidence.spotify.com',
  'experimentation-cs@spotify.com',
];

const PAGE_READ = Object.freeze({
  readOn: '2026-11-03',
  page: 'https://app.confidence.spotify.com/experiments',
  workspace: 'ThumbGate Workspace',
  plan: 'Free',
  profileLabel: 'Igor G.',
  rows: Object.freeze([
    { name: 'ThumbGate Direct Checkout A/B', kind: 'A/B test', demo: false, note: 'Created today' },
    { name: 'Reduce checkout time (Continue) clone', kind: 'A/B test', demo: true, note: 'Created today' },
    { name: 'Reduce checkout time (Ship)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
    { name: 'Skip button', kind: 'Rollout', demo: true, note: 'Launched Oct 19' },
    { name: 'Reduce checkout time (Continue)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
    { name: 'Reduce checkout time (Abort)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
  ]),
});

const AGENT_EMAIL_READ = Object.freeze({
  readOn: '2026-11-08',
  sourceFile: '~/Downloads/confidence.pdf',
  subject: 'Meet the Confidence Agent, wherever you work',
  from: 'jsoderholm@confidence.spotify.com',
  replyTo: 'experimentation-cs@spotify.com',
  to: 'igor@igorganapolsky.com',
  sentOn: '2026-11-08',
  mcpCommand: 'claude mcp add --transport http confidence-flags https://mcp.confidence.dev/mcp/flags',
  mcpUrl: 'https://mcp.confidence.dev/mcp/flags',
  outcomePrompt: 'Summarise the checkout test and flag any guardrail regressions.',
  bestPractices: Object.freeze([
    'Give it a clear outcome: "Summarise the checkout test and flag any guardrail regressions."',
    'Add Slack to a shared product or launch channel, not just DMs, so answers are shared.',
    'Review before you act. Treat it like a sharp teammate, not autopilot.',
  ]),
  footerNote: 'You are receiving this because you signed up for Confidence.',
});

const LOCAL_PROJECT = Object.freeze({
  name: PRODUCT,
  description: 'Local Mac freeze guard, HUD, and self-serve reliability kit sold at one canonical listing until a third-party paid order is measured.',
  linkedSurfaces: Object.freeze([OFFER_URL]),
  documents: Object.freeze([
    'skills/confidence-offer-gate/SKILL.md',
    'tools/lib/confidence-offer-gate.js',
    'tests/test-confidence-offer-gate.js',
  ]),
  outcomePrompt: AGENT_EMAIL_READ.outcomePrompt,
  successMetric: 'third_party_paid_order',
  reviewBeforeAct: true,
  autopilot: false,
});

function canonical(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}`;
  } catch {
    return '';
  }
}

function founderEmail(email) {
  return FOUNDER.includes(String(email || '').trim().toLowerCase());
}

function vendorOnboardingEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  return VENDOR_ONBOARDING_SENDERS.includes(norm) || norm.endsWith('@confidence.spotify.com');
}

function paidOrder(charge) {
  if (!charge || charge.source !== 'measured') return false;
  if (charge.live !== true || charge.refunded !== false || charge.founder === true) return false;
  if (!Number.isInteger(charge.amountCents) || charge.amountCents <= 0) return false;
  if (founderEmail(charge.email) || vendorOnboardingEmail(charge.email)) return false;
  if (charge.processor !== 'gumroad' && charge.processor !== 'stripe') return false;
  return true;
}

function collectGuardrailRegressions(request = {}) {
  const regressions = [];
  if (request.guardrailHarm) regressions.push('guardrail_harm');
  if (request.sampleRatioMismatch) regressions.push('sample_ratio_mismatch');
  if (
    request.discount
    || request.rewriteListing
    || (Number.isInteger(request.priceCents) && request.priceCents !== PRICE_CENTS)
  ) {
    regressions.push('price_or_listing_mutation');
  }
  if (request.autopilot || request.reviewBeforeAct === false) {
    regressions.push('autopilot_without_review');
  }
  if (Array.isArray(request.guardrailRegressions)) {
    for (const item of request.guardrailRegressions) {
      const label = String(item || '').trim();
      if (label && !regressions.includes(label)) regressions.push(label);
    }
  }
  return regressions;
}

function blank(reason, effect, recommendation, regressions = []) {
  return {
    effect,
    recommendation,
    reason,
    product: PRODUCT,
    calledConfidence: false,
    mcpAdded: false,
    slackAdded: false,
    githubConnected: false,
    autopilot: false,
    reviewBeforeAct: true,
    listingChanged: false,
    launched: false,
    recordedCents: 0,
    countsAsRevenue: false,
    priceCents: PRICE_CENTS,
    offerUrl: OFFER_URL,
    guardrailRegressions: regressions,
    project: LOCAL_PROJECT,
  };
}

function surfacesOf(request) {
  const given = Array.isArray(request.surfaces) ? request.surfaces : [OFFER_URL];
  return [...new Set(given.map(canonical).filter(Boolean))];
}

function judgeOffer(request) {
  if (!request || typeof request !== 'object') {
    return blank('The experiment request is unreadable.', 'refuse', 'Abort');
  }
  if (request.rate || request.percent || request.pipeline || request.uplift) {
    return blank('That figure was not measured here.', 'refuse', 'Abort');
  }
  if (request.autopilot || request.reviewBeforeAct === false) {
    return blank(
      'Review before you act. Treat it like a sharp teammate, not autopilot.',
      'refuse',
      'Abort',
      collectGuardrailRegressions(request),
    );
  }
  const remote = typeof request.remote === 'string' ? request.remote : '';
  const mcpUrl = typeof request.mcpUrl === 'string' ? request.mcpUrl : '';
  if (request.addMcp || /mcp\.confidence\.dev/i.test(remote) || /mcp\.confidence\.dev/i.test(mcpUrl)) {
    return blank('This check does not add the Confidence MCP server.', 'refuse', 'Abort');
  }
  if (request.addSlack) {
    return blank('This check does not add the Confidence Slack bot.', 'refuse', 'Abort');
  }
  if (request.connectGithub) {
    return blank('This check does not connect GitHub to Confidence.', 'refuse', 'Abort');
  }
  if (request.onboardingReply || vendorOnboardingEmail(request.senderEmail)) {
    return blank('The Confidence Agent email is vendor onboarding, not a buyer lead.', 'refuse', 'Abort');
  }
  const projectOrName = `${request.name || ''} ${request.project || ''} ${request.topic || ''}`;
  if (/swappa|shopgoodwill|arbitrage\s+desk/i.test(projectOrName)) {
    return blank(
      'Swappa/ShopGoodwill arbitrage was an unused onboarding artifact, not our business.',
      'refuse',
      'Abort',
    );
  }
  if (request.callConfidence || request.upgradePlan || /confidence\.spotify\.com/i.test(remote)) {
    return blank('This check does not call Confidence. The plan stays Free.', 'refuse', 'Abort');
  }
  if (
    request.discount
    || request.rewriteListing
    || (Number.isInteger(request.priceCents) && request.priceCents !== PRICE_CENTS)
  ) {
    return blank(
      'A price change is not a win. The listing stays as it is.',
      'refuse',
      'Abort',
      collectGuardrailRegressions(request),
    );
  }
  const regressions = collectGuardrailRegressions(request);
  if (regressions.length > 0) {
    return blank('A guardrail moved the wrong way, or the split is uneven.', 'refuse', 'Abort', regressions);
  }

  const name = typeof request.name === 'string' ? request.name : '';
  const known = PAGE_READ.rows.find((row) => row.name === name);
  if (request.demo || (known && known.demo)) {
    return blank('Demo data is not a Mac YOLO sale.', 'hold', "Don't ship");
  }
  if (known && !known.demo) {
    return blank('That row is not the Mac app.', 'hold', 'Continue');
  }

  const distinct = surfacesOf(request);
  const paid = paidOrder(request.charge);
  if (request.charge && !paid) {
    return blank('That charge is not third-party live cash.', 'hold', 'Continue');
  }
  if (distinct.length < 2) {
    if (paid) {
      const held = blank('The charge can count. One buyer URL is still not an experiment.', 'hold', 'Continue');
      held.recordedCents = request.charge.amountCents;
      held.countsAsRevenue = true;
      return held;
    }
    return blank('Sell the Mac app. One buyer URL is not an experiment.', 'sell', 'Continue');
  }
  if (request.successMetric && request.successMetric !== 'third_party_paid_order') {
    return blank('The success metric is a paid order from someone else.', 'refuse', 'Abort');
  }
  if (paid && request.successMetric === 'third_party_paid_order') {
    const held = blank('The paid order is the success metric. The listing was not rewritten.', 'hold', 'Ship');
    held.recordedCents = request.charge.amountCents;
    held.countsAsRevenue = true;
    return held;
  }
  return blank('Two buyer URLs exist. Nothing has been paid, so the result stays open.', 'hold', 'Continue');
}

function summariseCheckout(request = {}) {
  const plan = judgeOffer(request);
  const surfaces = surfacesOf(request);
  const regressionText = plan.guardrailRegressions.length === 0
    ? 'none'
    : plan.guardrailRegressions.join(',');
  return {
    ...plan,
    outcomePrompt: AGENT_EMAIL_READ.outcomePrompt,
    surfacesCount: surfaces.length,
    regressionSummary: regressionText,
    summaryLine: `${plan.reason} Regressions=${regressionText}. Recommendation=${plan.recommendation}. ReviewBeforeAct=true.`,
  };
}

module.exports = {
  PRODUCT,
  OFFER_URL,
  PRICE_CENTS,
  PAGE_READ,
  AGENT_EMAIL_READ,
  LOCAL_PROJECT,
  vendorOnboardingEmail,
  judgeOffer,
  summariseCheckout,
};
