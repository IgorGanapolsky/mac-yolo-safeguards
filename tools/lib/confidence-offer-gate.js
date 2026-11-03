'use strict';

/**
 * One buyer URL is not an experiment. The live listing stays at its price.
 * A demo row is not a sale. This module never calls Confidence and never
 * rewrites a listing.
 */

const PRODUCT = 'Mac YOLO Safeguards';
const OFFER_URL = 'https://iganapolsky.gumroad.com/l/nllmvb';
const PRICE_CENTS = 4900;

const FOUNDER = [
  'iganapolsky@gmail.com',
  'igor.ganapolsky@icloud.com',
  'ig5973700@gmail.com',
  'founder@dayglass.app',
  'pro@dayglass.app',
];

const PAGE_READ = {
  readOn: '2026-11-03',
  page: 'https://app.confidence.spotify.com/experiments',
  workspace: 'ThumbGate Workspace',
  plan: 'Free',
  profileLabel: "Igor G.",
  rows: [
    { name: 'ThumbGate Direct Checkout A/B', kind: 'A/B test', demo: false, note: 'Created today' },
    { name: 'Reduce checkout time (Continue) clone', kind: 'A/B test', demo: true, note: 'Created today' },
    { name: 'Reduce checkout time (Ship)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
    { name: 'Skip button', kind: 'Rollout', demo: true, note: 'Launched Oct 19' },
    { name: 'Reduce checkout time (Continue)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
    { name: 'Reduce checkout time (Abort)', kind: 'A/B test', demo: true, note: 'Launched Oct 19' },
  ],
};

function canonical(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}`;
  } catch {
    return '';
  }
}

function founderEmail(email) {
  return FOUNDER.includes(String(email || '').trim().toLowerCase());
}

function paidOrder(charge) {
  if (!charge || charge.source !== 'measured') return false;
  if (charge.live !== true || charge.refunded !== false || charge.founder === true) return false;
  if (!Number.isInteger(charge.amountCents) || charge.amountCents <= 0) return false;
  if (founderEmail(charge.email)) return false;
  if (charge.processor !== 'gumroad' && charge.processor !== 'stripe') return false;
  return true;
}

function blank(reason, effect, recommendation) {
  return {
    effect,
    recommendation,
    reason,
    product: PRODUCT,
    calledConfidence: false,
    listingChanged: false,
    launched: false,
    recordedCents: 0,
    countsAsRevenue: false,
    priceCents: PRICE_CENTS,
    offerUrl: OFFER_URL,
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
  const remote = typeof request.remote === 'string' ? request.remote : '';
  if (request.callConfidence || request.upgradePlan || /confidence\.spotify\.com/i.test(remote)) {
    return blank('This check does not call Confidence. The plan stays Free.', 'refuse', 'Abort');
  }
  if (
    request.discount
    || request.rewriteListing
    || (Number.isInteger(request.priceCents) && request.priceCents !== PRICE_CENTS)
  ) {
    return blank('A price change is not a win. The listing stays as it is.', 'refuse', 'Abort');
  }
  if (request.guardrailHarm || request.sampleRatioMismatch) {
    return blank('A guardrail moved the wrong way, or the split is uneven.', 'refuse', 'Abort');
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

module.exports = {
  PRODUCT,
  OFFER_URL,
  PRICE_CENTS,
  PAGE_READ,
  judgeOffer,
};
