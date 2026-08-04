'use strict';

/**
 * sender-health — read the verdict written by tools/smtp-auth-check.js.
 *
 * On 2026-07-29 five prospects were consumed while every message bounced; the ledger
 * recorded them as sent. You get one first email per person, so a bounced send is not a
 * retry — it is a burned contact. Writing a health verdict nobody reads would have
 * changed nothing, which is exactly what review pointed out.
 *
 * Deliberate asymmetry: a sender explicitly proven BAD blocks, an UNKNOWN sender only
 * warns. Blocking on unknown would deadlock the loop the first time a new address is
 * introduced, and a guard that halts normal work gets switched off.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.join('coordination', 'sender-health.json');
// A verdict from last week says nothing about today; seven bounces arrived four seconds
// after sending, so freshness is the whole point.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function loadSenderHealth(repoRoot = process.cwd(), file = DEFAULT_PATH) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  } catch {
    return { senders: {} };
  }
}

/**
 * @returns {{allowed: boolean, status: string, reason: string}}
 */
function checkSender(address, { repoRoot = process.cwd(), now = Date.now(), file } = {}) {
  const addr = String(address || '').toLowerCase();
  if (!addr) return { allowed: false, status: 'no_sender', reason: 'no sender address supplied' };

  const health = loadSenderHealth(repoRoot, file);
  const entry = (health.senders || {})[addr];

  if (!entry) {
    return {
      allowed: true,
      status: 'unknown',
      reason: `no health record for ${addr}; run smtp-auth-check --write-health to prove it`,
    };
  }
  if (entry.status === 'blocked') {
    return {
      allowed: false,
      status: 'blocked',
      reason: `${addr} is proven not to deliver (${entry.verdict}): ${entry.detail || 'no detail'}`,
    };
  }
  const checkedAt = Date.parse(entry.checkedAt || '');
  if (!Number.isFinite(checkedAt) || now - checkedAt > STALE_AFTER_MS) {
    return {
      allowed: true,
      status: 'stale',
      reason: `health for ${addr} was last proven ${entry.checkedAt || 'never'}; re-probe before a large batch`,
    };
  }
  return { allowed: true, status: 'ok', reason: `${addr} proven deliverable at ${entry.checkedAt}` };
}

module.exports = { checkSender, loadSenderHealth, STALE_AFTER_MS };
