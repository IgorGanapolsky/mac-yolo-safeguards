'use strict';

/**
 * A write proceeds only as the repo owner. A handoff admits a short scope
 * until it expires. An audit event before enablement stays out. This module
 * never copies a credential and never records a price.
 */

const SCOPES = ['read', 'edit', 'test'];
const AUDIT_KINDS = ['session', 'membership'];
const NAME_LIMIT = 39;

function accountName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  if (!name || name.length > NAME_LIMIT || /\s/.test(name)) return '';
  return name;
}

function judgeAccount(login, owner, action) {
  if (action === 'share') {
    return { effect: 'block', reason: 'A connection stays on the account that signed in.' };
  }
  const acting = accountName(login);
  const destination = accountName(owner);
  if (!acting) {
    return { effect: 'block', reason: 'No account is signed in.' };
  }
  if (action === 'read') {
    return { effect: 'admit', reason: 'A read can use either signed-in account.' };
  }
  if (action === 'write') {
    if (!destination || acting.toLowerCase() !== destination.toLowerCase()) {
      return { effect: 'block', reason: "A write uses the repo owner's account." };
    }
    return { effect: 'admit', reason: 'The acting account is the repo owner.' };
  }
  return { effect: 'block', reason: 'That action is not in the table.' };
}

function judgeHandoff(target, scope, expiresAt, now) {
  const name = typeof target === 'string' ? target.trim() : '';
  if (!name || name.length > NAME_LIMIT || /\s/.test(name)) {
    return { effect: 'refuse', reason: 'The handoff names no target.' };
  }
  if (!SCOPES.includes(scope)) {
    return { effect: 'refuse', reason: 'That scope is outside the handoff.' };
  }
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const at = now instanceof Date ? now : new Date();
  if (Number.isNaN(expiry.getTime()) || Number.isNaN(at.getTime()) || expiry.getTime() <= at.getTime()) {
    return { effect: 'refuse', reason: 'The handoff has expired.' };
  }
  return { effect: 'admit', reason: 'The handoff is inside its scope and still current.' };
}

function judgeAudit(event, enabledAt) {
  if (!event || typeof event !== 'object') {
    return { effect: 'refuse', reason: 'The event is not a record.' };
  }
  if (event.price != null || event.pricing === true || event.illustration === true) {
    return { effect: 'refuse', reason: 'A price is not a measurement.' };
  }
  if (!AUDIT_KINDS.includes(event.kind)) {
    return { effect: 'refuse', reason: 'That event is outside the log.' };
  }
  const ts = event.ts instanceof Date ? event.ts : new Date(event.ts);
  const enabled = enabledAt instanceof Date ? enabledAt : new Date(enabledAt);
  if (Number.isNaN(ts.getTime()) || Number.isNaN(enabled.getTime()) || ts.getTime() < enabled.getTime()) {
    return { effect: 'refuse', reason: 'Activity before enablement stays out.' };
  }
  return { effect: 'admit', reason: 'The event is at or after enablement.' };
}

module.exports = {
  AUDIT_KINDS,
  NAME_LIMIT,
  SCOPES,
  judgeAccount,
  judgeAudit,
  judgeHandoff,
};
