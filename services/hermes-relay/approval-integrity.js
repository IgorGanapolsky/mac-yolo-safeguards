'use strict';

const crypto = require('crypto');

const APPROVAL_INTEGRITY_VERSION = 1;
const APPROVAL_TTL_MS = 2 * 60 * 1000;
const MAX_FIELD_LENGTH = 4000;
const MAX_DIFF_LENGTH = 20_000;

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,
];

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = stableValue(value[key]);
        return out;
      }, {});
  }
  return value === undefined ? null : value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize('NFC');
  return normalized || null;
}

function affectedFiles(payload) {
  const files = new Set();
  const explicit = payload.affectedFiles || payload.affected_files || [];
  for (const file of Array.isArray(explicit) ? explicit : [explicit]) {
    if (stringOrNull(file)) files.add(String(file));
  }
  const filePath = payload.filePath || payload.file_path;
  if (stringOrNull(filePath)) files.add(String(filePath));
  const diff = stringOrNull(payload.diff);
  if (diff) {
    for (const line of diff.split('\n')) {
      const match = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
      if (match && match[1] !== '/dev/null') files.add(match[1]);
    }
  }
  return [...files].sort();
}

function canonicalApprovalCall(payload) {
  return stableValue({
    version: APPROVAL_INTEGRITY_VERSION,
    action_id: stringOrNull(payload.actionId || payload.action_id || payload.id),
    tool_name: stringOrNull(payload.toolName || payload.tool_name),
    destination: stringOrNull(
      payload.destination || payload.workspacePath || payload.workspace_path || payload.filePath || payload.file_path,
    ),
    command: stringOrNull(payload.command),
    arguments: payload.arguments || payload.tool_input || null,
    affected_files: affectedFiles(payload),
    diff_sha256: payload.diff ? sha256(String(payload.diff)) : null,
  });
}

function redactText(value) {
  let text = String(value);
  let redacted = false;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, () => {
      redacted = true;
      return '[REDACTED]';
    });
  }
  return { text, redacted };
}

function displayField(value, limit) {
  if (value === null || value === undefined) {
    return { value: null, truncated: false, redacted: false };
  }
  const result = redactText(typeof value === 'string' ? value : stableStringify(value));
  const truncated = result.text.length > limit;
  return {
    value: truncated ? `${result.text.slice(0, limit)}\n[TRUNCATED — REVIEW ON COMPUTER]` : result.text,
    truncated,
    redacted: result.redacted,
  };
}

function createApprovalIntegrity(payload, options = {}) {
  const canonicalCall = canonicalApprovalCall(payload);
  if (!canonicalCall.action_id || !canonicalCall.tool_name) {
    throw new Error('approval integrity requires action id and tool name');
  }
  const issuedAtMs = Number(options.now || Date.now());
  const ttlMs = Number(options.ttlMs || APPROVAL_TTL_MS);
  const command = displayField(canonicalCall.command, MAX_FIELD_LENGTH);
  const args = displayField(canonicalCall.arguments, MAX_FIELD_LENGTH);
  const diff = displayField(payload.diff, MAX_DIFF_LENGTH);
  const destination = displayField(canonicalCall.destination, MAX_FIELD_LENGTH);
  const truncated = command.truncated || args.truncated || diff.truncated || destination.truncated;
  const redacted = command.redacted || args.redacted || diff.redacted || destination.redacted;
  return {
    version: APPROVAL_INTEGRITY_VERSION,
    algorithm: 'sha256',
    digest: sha256(stableStringify(canonicalCall)),
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(issuedAtMs + ttlMs).toISOString(),
    truncated,
    redacted,
    review_required_on_computer: truncated || redacted,
    display: {
      action_id: canonicalCall.action_id,
      tool_name: canonicalCall.tool_name,
      destination: destination.value,
      command: command.value,
      arguments: args.value,
      affected_files: canonicalCall.affected_files,
      diff: diff.value,
    },
  };
}

function validateAllowVerdict(integrity, verdict, now = Date.now()) {
  if (!integrity || !integrity.digest) return { ok: false, error: 'approval_integrity_required' };
  if (integrity.truncated || integrity.redacted || integrity.review_required_on_computer) {
    return { ok: false, error: 'approval_requires_computer_review' };
  }
  if (Date.parse(integrity.expires_at) <= Number(now)) {
    return { ok: false, error: 'approval_expired' };
  }
  if (!verdict || verdict.approval_digest !== integrity.digest) {
    return { ok: false, error: 'approval_digest_mismatch' };
  }
  return { ok: true };
}

module.exports = {
  APPROVAL_INTEGRITY_VERSION,
  APPROVAL_TTL_MS,
  canonicalApprovalCall,
  createApprovalIntegrity,
  redactText,
  sha256,
  stableStringify,
  validateAllowVerdict,
};
