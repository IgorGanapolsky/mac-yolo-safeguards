'use strict';

/**
 * Messages wait during a declared offline window. The work that grows the
 * business, and a real outage, still go through. A blank override declares
 * no window. This module never sends mail and never records an illustration
 * as a measurement.
 */

const yieldLib = require('./work-first-yield');

const BLOCK_HOURS = 3;

const GROWTH = ['mac yolo listing', 'mac yolo cash', 'app store lookup', 'listing check'];
const INCIDENTS = ['outage', 'security', 'incident', 'direct request'];
const REPLIES = ['email', 'slack', 'post', 'comment', 'digest', 'status', 'reply', 'linkedin', 'tweet', 'message'];

function classify(action) {
  const text = String(action || '').toLowerCase();
  if (!text.trim()) return 'unknown';
  if (INCIDENTS.some((mark) => text.includes(mark))) return 'incident';
  if (GROWTH.some((mark) => text.includes(mark))) return 'growth';
  if (REPLIES.some((mark) => text.includes(mark))) return 'reply';
  return 'unknown';
}

function windowState(overrideText, now) {
  const zone = yieldLib.overrideZone(typeof overrideText === 'string' ? overrideText : '');
  if (!zone) return { on: false, zone: null };
  const at = now instanceof Date ? now : new Date();
  return { on: yieldLib.inFocusBlock(at, zone.start, zone.end, BLOCK_HOURS), zone };
}

function judge(action, overrideText, now) {
  const state = windowState(overrideText, now);
  const kind = classify(action);
  if (!state.on) {
    return { effect: 'admit', kind, reason: 'No offline window is declared.' };
  }
  if (kind === 'incident') {
    return { effect: 'admit', kind, reason: 'An outage still comes through.' };
  }
  if (kind === 'growth') {
    return { effect: 'admit', kind, reason: 'This is the work that grows the business.' };
  }
  if (kind === 'reply') {
    return { effect: 'defer', kind, reason: 'Messages wait until the window ends.' };
  }
  return { effect: 'defer', kind, reason: 'Unknown work waits during the window.' };
}

function acceptMeasurement(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.illustration === true) return false;
  if (claim.source !== 'measured') return false;
  return typeof claim.minutes === 'number' && Number.isFinite(claim.minutes) && claim.minutes >= 0;
}

module.exports = {
  BLOCK_HOURS,
  acceptMeasurement,
  classify,
  judge,
  windowState,
};
