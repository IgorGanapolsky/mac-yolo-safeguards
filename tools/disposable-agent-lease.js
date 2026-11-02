'use strict';

/**
 * Disposable agent lease.
 * Source: https://www.youtube.com/watch?v=Z78LjQn0u2E
 *
 * A lease is a record. It does not start a process, issue a credential,
 * or delete a lock. Retirement only changes the record.
 */

const ALLOWED_TOOLS = ['read', 'grep', 'bash', 'edit'];
const SPAWN_ROLES = {
  SpecialistDeepDive: 20,
  DeliberateDissent: 10,
};
const MAX_TTL_MINUTES = 30;
const DROPPED_FIELDS = ['thought', 'chain_of_thought', 'scratchpad', 'failed_attempts', 'intermediate'];

function createDisposableLease({
  objective = '',
  tools = [],
  paths = [],
  ttlMinutes,
  outcome = '',
  nowMs = Date.now(),
} = {}) {
  const reasons = [];
  const objectiveText = String(objective || '').trim();
  const outcomeText = String(outcome || '').trim();
  const ttl = Number(ttlMinutes);
  if (!objectiveText) reasons.push('objective_required');
  if (!outcomeText) reasons.push('outcome_required');
  if (!Number.isFinite(ttl) || ttl <= 0) reasons.push('ttl_required');
  else if (ttl > MAX_TTL_MINUTES) reasons.push('ttl_exceeds_30_minutes');

  const requested = Array.isArray(tools) ? tools.map((tool) => String(tool)) : [];
  const accepted = requested.filter((tool) => ALLOWED_TOOLS.includes(tool));
  const refused = requested.filter((tool) => !ALLOWED_TOOLS.includes(tool));
  if (accepted.length === 0) reasons.push('at_least_one_allowed_tool');
  if (refused.length > 0) reasons.push('tool_not_allowed');
  if (accepted.length > 4) reasons.push('more_than_four_tools');

  const pathList = Array.isArray(paths) ? paths.map((item) => String(item).trim()).filter(Boolean) : [];
  if (pathList.length === 0) reasons.push('path_scope_required');
  if (pathList.some((item) => item === '/' || item === '.' || item.includes('..'))) {
    reasons.push('path_scope_too_wide');
  }

  const valid = reasons.length === 0;
  const ttlMinutesOut = valid ? ttl : null;
  return {
    valid,
    reasons,
    objective: objectiveText,
    outcome: outcomeText,
    tools: valid ? accepted : [],
    paths: valid ? pathList : [],
    ttl_minutes: ttlMinutesOut,
    created_at: new Date(nowMs).toISOString(),
    expires_at: valid ? new Date(nowMs + ttl * 60 * 1000).toISOString() : null,
    status: valid ? 'active' : 'refused',
    credentials_issued: false,
    spawn_depth: 0,
    can_spawn: valid,
    working_notes_persisted: false,
  };
}

function spawnDisposableChild(parent, { role = '', nowMs = Date.now() } = {}) {
  if (!parent || parent.valid !== true || parent.status !== 'active') {
    return { valid: false, reasons: ['parent_not_active'], credentials_issued: false, verifies_parent: false };
  }
  if ((parent.spawn_depth || 0) >= 1 || parent.can_spawn !== true) {
    return { valid: false, reasons: ['spawn_depth_exceeded'], credentials_issued: false, verifies_parent: false };
  }
  const maxTtl = SPAWN_ROLES[role];
  if (!maxTtl) {
    return { valid: false, reasons: ['role_not_allowed'], credentials_issued: false, verifies_parent: false };
  }
  const parentExpires = new Date(parent.expires_at).getTime();
  const remainingMs = parentExpires - nowMs;
  if (!(remainingMs > 0)) {
    return { valid: false, reasons: ['parent_expired'], credentials_issued: false, verifies_parent: false };
  }
  const childTools = role === 'DeliberateDissent'
    ? parent.tools.filter((tool) => tool === 'read' || tool === 'grep')
    : parent.tools.slice();
  if (role === 'DeliberateDissent' && childTools.length === 0) {
    return { valid: false, reasons: ['dissent_needs_read_or_grep'], credentials_issued: false, verifies_parent: false };
  }
  const childTtlMs = Math.min(maxTtl * 60 * 1000, remainingMs);
  return {
    valid: true,
    reasons: [],
    role,
    objective: parent.objective,
    tools: childTools,
    paths: parent.paths.slice(),
    ttl_minutes: childTtlMs / 60000,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + childTtlMs).toISOString(),
    status: 'active',
    credentials_issued: false,
    spawn_depth: 1,
    can_spawn: false,
    verifies_parent: false,
    working_notes_persisted: false,
  };
}

function extractDisposableIntelligence(record = {}) {
  const dropped = DROPPED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(record, field));
  const decision = String(record.decision || '').trim();
  const evidence = String(record.evidence || '').trim();
  const kept = decision && evidence ? { decision, evidence } : null;
  return {
    kept,
    persisted: Boolean(kept),
    dropped_fields: dropped,
    intermediate_thoughts_discarded: dropped.length > 0,
    dissent_verified: false,
  };
}

function retireDisposableLease(lease, { nowMs = Date.now(), outcomeMet = false } = {}) {
  const base = {
    credentials_issued: false,
    credentials_revoked: false,
    compute_released: false,
    working_context_retained: false,
    locks_deleted: false,
  };
  if (!lease || lease.valid !== true) {
    return { ...base, status: 'refused', reason: 'lease_not_valid' };
  }
  const expired = new Date(lease.expires_at).getTime() <= nowMs;
  if (!expired && outcomeMet !== true) {
    return { ...base, status: 'still_active', reason: 'outcome_not_met_and_ttl_remaining' };
  }
  return {
    ...base,
    status: outcomeMet === true ? 'retired' : 'expired',
    reason: outcomeMet === true ? 'outcome_met' : 'ttl_reached',
  };
}

module.exports = {
  ALLOWED_TOOLS,
  createDisposableLease,
  spawnDisposableChild,
  extractDisposableIntelligence,
  retireDisposableLease,
};
