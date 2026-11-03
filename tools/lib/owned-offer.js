'use strict';

/**
 * Sell the Mac app that already has a price. A custom build is a quote, and
 * only after that purchase is paid. A free build, a call list, and a rented
 * stack do not change the price. This module never sends mail and never
 * places a call.
 */

const PRODUCT = 'Mac YOLO Safeguards';
const CUSTOM_USD = 25000;
const SPLIT_USD = [12500, 12500];
const WINDOW_DAYS = 30;
const RETAINER_USD = 3000;

const FREE = ['free pilot', 'for free', 'build for free', 'no charge', 'complimentary'];
const RENT = ['orgo', 'agent mail', 'agentmail', 'agent phone', 'agentphone', 'composio', 'fork bops', 'fork the'];
const CALLS = ['call 50', 'cold call', 'warm network', 'phone 50'];

function blockedKinds(motion) {
  const low = String(motion || '').toLowerCase();
  const blocked = [];
  if (FREE.some((mark) => low.includes(mark))) blocked.push('free-pilot');
  if (RENT.some((mark) => low.includes(mark))) blocked.push('rented-stack');
  if (CALLS.some((mark) => low.includes(mark))) blocked.push('call-list');
  return blocked;
}

function listingOk(listing) {
  if (!listing || typeof listing !== 'object') return false;
  if (listing.illustration === true || listing.hire === true || listing.episode === true) return false;
  if (listing.source !== 'measured') return false;
  if (!Number.isInteger(listing.cents) || listing.cents < 0) return false;
  if (typeof listing.url !== 'string' || !listing.url.startsWith('https://')) return false;
  return true;
}

function judgeOffer(motion, listing) {
  const blocked = blockedKinds(motion);
  const base = { blocked, sent: false, callsPlaced: 0, outboundUsd: 0 };
  if (!listingOk(listing)) {
    return { effect: 'refuse', reason: 'The price was not measured.', ...base };
  }
  const paid = listing.paid === true;
  return {
    effect: 'sell',
    reason: paid
      ? 'The Mac app is paid, so the custom quote can be written.'
      : 'Sell the Mac app. The custom build waits until that purchase is paid.',
    product: PRODUCT,
    cents: listing.cents,
    url: listing.url,
    customUsd: paid ? CUSTOM_USD : null,
    payments: paid ? SPLIT_USD.slice() : [],
    windowDays: WINDOW_DAYS,
    retainerUsd: RETAINER_USD,
    ...base,
  };
}

module.exports = {
  CALLS,
  CUSTOM_USD,
  FREE,
  SPLIT_USD,
  PRODUCT,
  RENT,
  RETAINER_USD,
  WINDOW_DAYS,
  blockedKinds,
  judgeOffer,
  listingOk,
};
