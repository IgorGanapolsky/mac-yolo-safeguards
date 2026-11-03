'use strict';

/**
 * A defect report still counts when nobody is mentioned. The first report
 * is reproduced. The same report, with no new fact, stops. A person accepts
 * the result only after that reproduction. This module never scans processes
 * and never records a price or a percent.
 */

const MARKS = [
  'freeze',
  'frozen',
  'froze',
  'fail',
  'bug',
  'broken',
  'error',
  'regression',
  'outage',
  'crash',
  'defect',
];

function signature(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/@[a-z0-9._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDefect(text) {
  const body = signature(text);
  if (!body) return false;
  return MARKS.some((mark) => body.includes(mark));
}

function judgeReport(text, seen, evidence, priorEvidence) {
  if (!isDefect(text)) {
    return { effect: 'ignore', reason: 'No defect is stated.' };
  }
  if (seen != null && seen !== '' && (!Number.isInteger(seen) || seen < 0)) {
    return { effect: 'stop', reason: 'The try count is unreadable.' };
  }
  const count = seen == null || seen === '' ? 0 : seen;
  const next = typeof evidence === 'string' ? evidence.trim() : '';
  const prior = typeof priorEvidence === 'string' ? priorEvidence.trim() : '';
  if (count === 0) {
    return { effect: 'reproduce', reason: 'Reproduce it before anyone accepts a fix.' };
  }
  if (next && next !== prior) {
    return { effect: 'reproduce', reason: 'A new fact reopens one try.' };
  }
  return { effect: 'stop', reason: 'The same report already had a try.' };
}

function judgeResult(claim) {
  const reproduced = Boolean(claim && claim.reproduced === true);
  const accepted = Boolean(claim && claim.accepted === true);
  const fixed = Boolean(claim && claim.fixed === true);
  if ((fixed || accepted) && !reproduced) {
    return { effect: 'refuse', reason: 'Acceptance needs a reproduction.' };
  }
  if (reproduced && accepted) {
    return { effect: 'accept', reason: 'A person accepted a reproduced result.' };
  }
  if (reproduced) {
    return { effect: 'hold', reason: 'Reproduced. Waiting for a person to accept it.' };
  }
  return { effect: 'refuse', reason: 'Nothing has been reproduced.' };
}

function acceptMeasurement(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.illustration === true || claim.pricing === true) return false;
  if (claim.percent != null || claim.price != null) return false;
  if (claim.source !== 'measured') return false;
  return typeof claim.minutes === 'number' && Number.isFinite(claim.minutes) && claim.minutes >= 0;
}

module.exports = {
  MARKS,
  acceptMeasurement,
  isDefect,
  judgeReport,
  judgeResult,
  signature,
};
