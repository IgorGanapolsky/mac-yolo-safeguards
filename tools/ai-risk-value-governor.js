#!/usr/bin/env node
'use strict';

/**
 * Capital One Software / Gartner IT Symposium 2026 — AI Risk vs. Business Value Governor
 *
 * Implements the three concrete enterprise controls from Capital One Software's
 * November 10, 2026 Gartner Symposium analysis ("Why AI risk is outpacing value
 * and how to fix that"):
 *
 * 1. Protect Sensitive Data at the Source (Deterministic HMAC Surrogate Tokenization):
 *    Tokenizes secrets, API keys, payment cards (Luhn-checked 13–19 digit PANs), SSNs,
 *    and PII BEFORE text enters any LLM prompt, agent tool call, or RAG vector store,
 *    preserving 64-bit keyed surrogate tokens (`[TOK_EMAIL_<16hex>]`) so downstream
 *    analytics, cohort joins, and evals correlate entities without raw exposure.
 *
 * 2. Machine-Speed Agent Velocity & Blast-Radius Circuit Breaker:
 *    Tracks bounded rolling per-agent action velocity and halts runaway loops when
 *    mutation rate exceeds threshold.
 *
 * 3. Deliberate AI Value-vs-Risk Flywheel Gate:
 *    Scores finite expected business value against blast-radius × irreversibility ×
 *    secret-exposure risk, routing high-risk/low-value actions to owner approval or
 *    gate interdiction.
 */

const crypto = require('crypto');

const SECRET_RULES = Object.freeze([
  { kind: 'PRIVATE_KEY', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: 'GITHUB_PAT', re: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { kind: 'STRIPE_KEY', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}\b/g },
  { kind: 'OPENAI_OR_API_KEY', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,255}\b/g },
  { kind: 'GOOGLE_API_KEY', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/g },
  { kind: 'AWS_ACCESS_KEY', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'BEARER_JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
]);

const HIGH_RISK_KINDS = new Set([
  'PRIVATE_KEY',
  'GITHUB_PAT',
  'STRIPE_KEY',
  'OPENAI_OR_API_KEY',
  'GOOGLE_API_KEY',
  'SLACK_TOKEN',
  'AWS_ACCESS_KEY',
  'BEARER_JWT',
  'SSN',
  'PAN',
]);

const SSN_RE = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;
const PAN_CANDIDATE_RE = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;

function passesLuhn(digits) {
  if (typeof digits !== 'string' || digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (doubleDigit) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function safeSerialize(value) {
  if (typeof value === 'string') return value;
  const seen = new WeakSet();
  try {
    return JSON.stringify(value ?? '', (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value ?? '');
  }
}

class AIRiskValueGovernor {
  constructor(options = {}) {
    const providedSalt = options.salt ?? process.env.MAC_YOLO_TOKENIZER_SALT;
    this.salt = providedSalt ? String(providedSalt) : crypto.randomBytes(32).toString('hex');
    this.maxActionsPerMinute = Number.isFinite(Number(options.maxActionsPerMinute))
      ? Math.max(0, Number(options.maxActionsPerMinute))
      : 30;
    this.minValueToRiskRatio = Number.isFinite(Number(options.minValueToRiskRatio))
      ? Math.max(0, Number(options.minValueToRiskRatio))
      : 1.0;
    this.windowMs = Number.isFinite(Number(options.windowMs)) && Number(options.windowMs) > 0
      ? Number(options.windowMs)
      : 60000;
    this.maxTrackedAgents = Number.isFinite(Number(options.maxTrackedAgents)) && Number(options.maxTrackedAgents) > 0
      ? Math.trunc(Number(options.maxTrackedAgents))
      : 1024;
    this.velocityLedger = new Map();
  }

  surrogateToken(kind, rawValue) {
    const digest = crypto
      .createHmac('sha256', this.salt)
      .update(`${kind}:${rawValue}`)
      .digest('hex')
      .slice(0, 16);
    return `[TOK_${kind}_${digest}]`;
  }

  _tokenizeWalk(input, tokenizeEmails, detections, seen) {
    if (typeof input === 'string') {
      let out = input;

      for (const rule of SECRET_RULES) {
        out = out.replace(rule.re, (match) => {
          const token = this.surrogateToken(rule.kind, match);
          detections.push({ kind: rule.kind, token, highRisk: true });
          return token;
        });
      }

      out = out.replace(SSN_RE, (match) => {
        const token = this.surrogateToken('SSN', match);
        detections.push({ kind: 'SSN', token, highRisk: true });
        return token;
      });

      out = out.replace(PAN_CANDIDATE_RE, (match) => {
        const digits = match.replace(/\D/g, '');
        if (!passesLuhn(digits)) return match;
        const token = this.surrogateToken('PAN', digits);
        detections.push({ kind: 'PAN', token, highRisk: true });
        return token;
      });

      if (tokenizeEmails) {
        out = out.replace(EMAIL_RE, (match) => {
          const token = this.surrogateToken('EMAIL', match.toLowerCase());
          detections.push({ kind: 'EMAIL', token, highRisk: false });
          return token;
        });
      }
      return out;
    }

    if (Array.isArray(input)) {
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      return input.map((item) => this._tokenizeWalk(item, tokenizeEmails, detections, seen));
    }

    if (input && typeof input === 'object') {
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      const outObj = {};
      for (const [k, v] of Object.entries(input)) {
        const cleanKey = this._tokenizeWalk(k, tokenizeEmails, detections, seen);
        outObj[cleanKey] = this._tokenizeWalk(v, tokenizeEmails, detections, seen);
      }
      return outObj;
    }

    return input;
  }

  tokenizeSource(input, options = {}) {
    const tokenizeEmails = options.tokenizeEmails !== false;
    const detections = [];
    const sanitized = this._tokenizeWalk(input, tokenizeEmails, detections, new WeakSet());
    if (options.detailed) {
      const highRiskCount = detections.filter((d) => HIGH_RISK_KINDS.has(d.kind)).length;
      return {
        sanitized,
        detections,
        redactionCount: detections.length,
        highRiskCount,
      };
    }
    return sanitized;
  }

  recordAgentAction(agentId, nowMs = Date.now()) {
    const id = String(agentId || 'default-agent');
    const cutoff = nowMs - this.windowMs;
    if (!this.velocityLedger.has(id) && this.velocityLedger.size >= this.maxTrackedAgents) {
      const oldestKey = this.velocityLedger.keys().next().value;
      if (oldestKey !== undefined) this.velocityLedger.delete(oldestKey);
    }
    const prev = (this.velocityLedger.get(id) || []).filter((ts) => ts > cutoff);
    prev.push(nowMs);
    this.velocityLedger.delete(id);
    this.velocityLedger.set(id, prev);
    const actionsInWindow = prev.length;
    const tripped = actionsInWindow > this.maxActionsPerMinute;
    return {
      agentId: id,
      actionsInWindow,
      maxActionsPerMinute: this.maxActionsPerMinute,
      tripped,
    };
  }

  evaluateRiskValueBalance(task = {}, nowMs = Date.now()) {
    const agentId = task.agentId || 'default-agent';
    const velocity = this.recordAgentAction(agentId, nowMs);
    const rawPayload = safeSerialize(task.payload);
    const sourceScan = this.tokenizeSource(rawPayload, { detailed: true });

    const rawVal = Number(task.businessValueScore ?? 1.0);
    const businessValue = Number.isFinite(rawVal) ? Math.min(100, Math.max(0, rawVal)) : 0;
    const rawRisk = Number(task.blastRadiusRiskScore ?? 1.0);
    const baseRisk = Number.isFinite(rawRisk) ? Math.max(0.1, rawRisk) : 100;
    const irreversibleMultiplier = task.irreversible ? 2.0 : 1.0;
    const rawSecretPenalty = task.allowRawSecrets ? 0 : sourceScan.highRiskCount * 3.0;
    const effectiveRisk = Number((baseRisk * irreversibleMultiplier + rawSecretPenalty).toFixed(4));
    const valueToRiskRatio = Number((businessValue / Math.max(0.1, effectiveRisk)).toFixed(2));

    if (velocity.tripped) {
      return {
        allowed: false,
        governanceAction: 'CIRCUIT_BREAK_VELOCITY',
        valueToRiskRatio,
        effectiveRisk,
        sanitizedPayload: sourceScan.sanitized,
        redactionCount: sourceScan.redactionCount,
        highRiskCount: sourceScan.highRiskCount,
        velocity,
        rationale: `Agent '${agentId}' exceeded ${this.maxActionsPerMinute} actions/min (${velocity.actionsInWindow})`,
      };
    }

    if (!task.allowRawSecrets && sourceScan.highRiskCount > 0) {
      return {
        allowed: false,
        governanceAction: 'INTERDICT_RAW_SECRET',
        valueToRiskRatio,
        effectiveRisk,
        sanitizedPayload: sourceScan.sanitized,
        redactionCount: sourceScan.redactionCount,
        highRiskCount: sourceScan.highRiskCount,
        velocity,
        rationale: `Blocked ${sourceScan.highRiskCount} raw credential/PAN/SSN token(s) at source; use sanitizedPayload`,
      };
    }

    const allowed = valueToRiskRatio >= this.minValueToRiskRatio;
    return {
      allowed,
      governanceAction: allowed ? 'ALLOW' : (task.irreversible ? 'REQUIRE_OWNER_APPROVAL' : 'INTERDICT_GATE'),
      valueToRiskRatio,
      effectiveRisk,
      sanitizedPayload: sourceScan.sanitized,
      redactionCount: sourceScan.redactionCount,
      highRiskCount: sourceScan.highRiskCount,
      velocity,
      rationale: allowed
        ? 'Verified business value justifies blast-radius risk with source tokenization applied'
        : `Risk (${effectiveRisk}) outpaces business value (${businessValue}); ratio ${valueToRiskRatio} < ${this.minValueToRiskRatio}`,
    };
  }
}

if (require.main === module) {
  const governor = new AIRiskValueGovernor();
  const demoPat = ['gh', 'p_0123456789abcdef0123456789abcdef012345'].join('');
  const sample = `Deploy with ${demoPat} and card 4532-0151-1283-0366 for ops@example.com`;
  const tokenized = governor.tokenizeSource(sample, { detailed: true });
  const gate = governor.evaluateRiskValueBalance({
    agentId: 'omp-worker',
    businessValueScore: 8,
    blastRadiusRiskScore: 2,
    payload: tokenized.sanitized,
  });
  console.log(JSON.stringify({ tokenized, gate }, null, 2));
}

module.exports = { AIRiskValueGovernor, passesLuhn };
