'use strict';

/** A quote is held until collected cash covers it, and even then nothing is bought. An idle meter is parked. This module never starts a machine and never sends a charge. */

const SPEND = ['topup', 'node', 'job', 'remote'];
const PARK = ['park', 'stop', 'idle'];
const PRODUCT = 'Mac YOLO Safeguards';

function acceptListing(listing) {
  if (!listing || typeof listing !== 'object') return false;
  if (listing.source !== 'measured') return false;
  if (!Number.isInteger(listing.cents) || listing.cents < 0) return false;
  if (typeof listing.url !== 'string' || !listing.url.startsWith('https://')) return false;
  if (listing.illustration || listing.hire || listing.rate || listing.percent) return false;
  return true;
}

function wholeCents(value) {
  return Number.isInteger(value) && value >= 0;
}

function judgeMeter(request) {
  const purchased = false;
  const chargeCents = 0;
  if (!request || typeof request !== 'object') {
    return { effect: 'refuse', reason: 'The meter request is unreadable.', purchased, chargeCents };
  }
  if (request.rate || request.illustration || request.percent || request.hire) {
    return { effect: 'refuse', reason: 'That rate is not a local measurement.', purchased, chargeCents };
  }
  if (PARK.includes(request.kind)) {
    return {
      effect: 'park',
      reason: 'An idle meter is parked, so the idle window is not billed.',
      purchased,
      chargeCents,
    };
  }
  if (request.kind === 'sell') {
    if (!acceptListing(request.listing)) {
      return { effect: 'refuse', reason: 'The price was not measured.', purchased, chargeCents };
    }
    return {
      effect: 'sell',
      reason: 'Sell the Mac app. Nothing was bought.',
      purchased,
      chargeCents,
      product: PRODUCT,
    };
  }
  if (!SPEND.includes(request.kind)) {
    return { effect: 'refuse', reason: 'That request has no local meter.', purchased, chargeCents };
  }
  if (!wholeCents(request.quoteCents)) {
    return { effect: 'refuse', reason: 'The quote was not measured.', purchased, chargeCents };
  }
  if (!wholeCents(request.collectedCents)) {
    return { effect: 'refuse', reason: 'Collected cash was not measured.', purchased, chargeCents };
  }
  if (request.collectedCents < request.quoteCents) {
    return { effect: 'block', reason: 'Collected cash does not cover the quote.', purchased, chargeCents };
  }
  return { effect: 'hold', reason: 'The quote is covered. Nothing was bought.', purchased, chargeCents };
}

module.exports = { PRODUCT, acceptListing, judgeMeter };
