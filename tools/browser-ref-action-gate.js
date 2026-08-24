#!/usr/bin/env node
'use strict';

/**
 * Provider-neutral structured browser action gate.
 *
 * The browser runtime remains client/provider owned. This module only accepts
 * actions bound to a fresh accessibility-style observation and refuses to call
 * an action complete without a provider receipt.
 */

const crypto = require('crypto');

const OBSERVATION_SCHEMA = 'thumbgate-browser-observation/v1';
const APPROVAL_SCHEMA = 'thumbgate-browser-approval/v1';
const MAX_ELEMENTS = 200;
const MAX_TEXT_BYTES = 64 * 1024;
const DEFAULT_MAX_AGE_MS = 60_000;
const REF_PATTERN = /^ref_[a-zA-Z0-9_-]{1,64}$/;
const SAFE_ACTIONS = new Set(['click', 'fill', 'select', 'navigate', 'read']);
const CONSEQUENTIAL_ACTIONS = new Set(['submit', 'send', 'publish', 'download', 'purchase', 'delete']);
const INJECTION_PATTERN = /\b(ignore (?:all |any )?(?:previous|prior|system) instructions?|reveal (?:the )?(?:system prompt|credentials?|secrets?)|exfiltrat(?:e|ion)|disable (?:the )?(?:safety|guard|policy))\b/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeElements(elements) {
  if (!Array.isArray(elements) || elements.length > MAX_ELEMENTS) {
    throw new Error(`elements must be an array with at most ${MAX_ELEMENTS} entries`);
  }
  const seen = new Set();
  return elements.map((element) => {
    if (!element || !REF_PATTERN.test(element.ref || '')) throw new Error('invalid structured element ref');
    if (seen.has(element.ref)) throw new Error(`duplicate structured element ref: ${element.ref}`);
    seen.add(element.ref);
    const name = String(element.name || '').slice(0, 500);
    const role = String(element.role || '').slice(0, 80);
    const hidden = element.hidden === true || element.ariaHidden === true;
    if (hidden && INJECTION_PATTERN.test(name)) {
      throw new Error(`hidden prompt-injection text rejected at ${element.ref}`);
    }
    return { ref: element.ref, role, name, hidden, disabled: element.disabled === true };
  });
}

function createObservation(input, options = {}) {
  const parsedUrl = parseHttpUrl(input?.url);
  if (!parsedUrl) throw new Error('observation url must be http(s)');
  const elements = normalizeElements(input.elements || []);
  const text = String(input.text || '');
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error(`observation text exceeds ${MAX_TEXT_BYTES} bytes`);
  const capturedAt = input.capturedAt || new Date(options.nowMs ?? Date.now()).toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('capturedAt must be an ISO timestamp');
  const payload = {
    schema: OBSERVATION_SCHEMA,
    url: parsedUrl.href,
    origin: parsedUrl.origin,
    capturedAt,
    elements,
    textDigest: digest(text),
  };
  return {
    ...payload,
    observationId: `obs_${digest(payload).slice(0, 24)}`,
    contentDigest: digest(payload),
  };
}

function actionFingerprint(action) {
  const payload = {
    type: action?.type || '',
    ref: action?.ref || null,
    targetUrl: action?.targetUrl || null,
    valueDigest: action?.value == null ? null : digest(String(action.value)),
    observationId: action?.observationId || null,
    observationDigest: action?.observationDigest || null,
  };
  return digest(payload);
}

function createApprovalReceipt(action, input = {}, options = {}) {
  if (!input.approvedBy || input.approved !== true) throw new Error('explicit approver identity and approved=true are required');
  const nowMs = options.nowMs ?? Date.now();
  const expiresAt = input.expiresAt || new Date(nowMs + 5 * 60_000).toISOString();
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= nowMs) throw new Error('approval expiry must be in the future');
  return {
    schema: APPROVAL_SCHEMA,
    approved: true,
    approvedBy: String(input.approvedBy),
    approvedAt: new Date(nowMs).toISOString(),
    expiresAt,
    actionFingerprint: actionFingerprint(action),
  };
}

function deny(code, detail) {
  return { allowed: false, code, detail };
}

function authorizeAction({ observation, action, approval, allowedOrigins = [], maxAgeMs = DEFAULT_MAX_AGE_MS, nowMs = Date.now() }) {
  if (!observation || observation.schema !== OBSERVATION_SCHEMA) return deny('INVALID_OBSERVATION', 'structured observation is required');
  if (!action || (!SAFE_ACTIONS.has(action.type) && !CONSEQUENTIAL_ACTIONS.has(action.type))) return deny('UNSUPPORTED_ACTION', 'action type is not allowlisted');
  if (Number.isFinite(action.x) || Number.isFinite(action.y) || action.coordinates) return deny('COORDINATE_ACTION_DENIED', 'use a current structured ref');
  if (action.observationId !== observation.observationId || action.observationDigest !== observation.contentDigest) {
    return deny('STALE_OR_UNBOUND_OBSERVATION', 'action must bind to the exact observation id and digest');
  }
  const ageMs = nowMs - Date.parse(observation.capturedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return deny('STALE_OBSERVATION', `observation age ${ageMs}ms exceeds ${maxAgeMs}ms`);

  const origins = new Set(allowedOrigins.length > 0 ? allowedOrigins : [observation.origin]);
  if (!origins.has(observation.origin)) return deny('ORIGIN_DENIED', 'observation origin is not allowed');
  if (action.targetUrl) {
    const target = parseHttpUrl(action.targetUrl);
    if (!target || !origins.has(target.origin)) return deny('CROSS_ORIGIN_ACTION_DENIED', 'target URL is outside the allowed origins');
  }

  const needsRef = !['navigate', 'read'].includes(action.type);
  const element = observation.elements.find((item) => item.ref === action.ref);
  if (needsRef && !element) return deny('UNKNOWN_REF', 'action ref is not present in the current observation');
  if (element?.hidden) return deny('HIDDEN_ELEMENT_DENIED', 'hidden elements cannot be action targets');
  if (element?.disabled) return deny('DISABLED_ELEMENT_DENIED', 'disabled elements cannot be action targets');

  const consequential = CONSEQUENTIAL_ACTIONS.has(action.type);
  if (consequential) {
    if (!approval || approval.schema !== APPROVAL_SCHEMA || approval.approved !== true) {
      return deny('APPROVAL_REQUIRED', 'consequential browser action requires an approval receipt');
    }
    if (approval.actionFingerprint !== actionFingerprint(action)) return deny('APPROVAL_MISMATCH', 'approval is not bound to this exact action');
    if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= nowMs) return deny('APPROVAL_EXPIRED', 'approval receipt expired');
  }

  return {
    allowed: true,
    code: consequential ? 'ALLOW_APPROVED_CONSEQUENTIAL' : 'ALLOW_STRUCTURED_ACTION',
    actionFingerprint: actionFingerprint(action),
    observationId: observation.observationId,
    origin: observation.origin,
    consequential,
  };
}

function verifyProviderReceipt(receipt, authorization, allowedOrigins = []) {
  if (!authorization?.allowed) return { verified: false, code: 'ACTION_NOT_AUTHORIZED' };
  if (!receipt || receipt.actionFingerprint !== authorization.actionFingerprint) {
    return { verified: false, code: 'RECEIPT_ACTION_MISMATCH' };
  }
  if (!Number.isInteger(receipt.status) || receipt.status < 200 || receipt.status >= 400) {
    return { verified: false, code: 'PROVIDER_STATUS_NOT_SUCCESS' };
  }
  const finalUrl = parseHttpUrl(receipt.finalUrl);
  const origins = new Set(allowedOrigins.length > 0 ? allowedOrigins : [authorization.origin]);
  if (!finalUrl || !origins.has(finalUrl.origin)) return { verified: false, code: 'RECEIPT_ORIGIN_DENIED' };
  const providerRequestId = receipt.requestId || receipt.cfRay || receipt.runId;
  if (!providerRequestId) return { verified: false, code: 'PROVIDER_REQUEST_ID_MISSING' };
  if (!receipt.completedAt || !Number.isFinite(Date.parse(receipt.completedAt))) {
    return { verified: false, code: 'COMPLETION_TIME_MISSING' };
  }
  return {
    verified: true,
    code: 'PROVIDER_RECEIPT_VERIFIED',
    status: receipt.status,
    finalUrl: finalUrl.href,
    providerRequestId: String(providerRequestId),
    browserMsUsed: finiteNonNegative(receipt.browserMsUsed) ? receipt.browserMsUsed : null,
    responseHash: receipt.responseHash || null,
    completedAt: receipt.completedAt,
  };
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function completionClaim(verification) {
  return verification?.verified
    ? { completed: true, evidence: verification }
    : { completed: false, evidence: verification || { code: 'PROVIDER_RECEIPT_MISSING' } };
}

module.exports = {
  APPROVAL_SCHEMA,
  CONSEQUENTIAL_ACTIONS,
  DEFAULT_MAX_AGE_MS,
  OBSERVATION_SCHEMA,
  actionFingerprint,
  authorizeAction,
  completionClaim,
  createApprovalReceipt,
  createObservation,
  digest,
  verifyProviderReceipt,
};
