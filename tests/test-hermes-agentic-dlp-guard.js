/**
 * tests/test-hermes-agentic-dlp-guard.js
 * 
 * Unit tests for Enterprise Agentic DLP Control Plane stolen from Island.io.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidLuhn,
  sanitizeDlpPayload,
  AgenticControlPlaneGuard,
} = require('../tools/hermes-agentic-dlp-guard');

test('Luhn algorithm correctly validates credit card checksums', () => {
  // Test known valid Luhn pattern (e.g. 49927398716)
  assert.equal(isValidLuhn('49927398716'), true);
  // Invalid Luhn
  assert.equal(isValidLuhn('49927398717'), false);
  // Too short
  assert.equal(isValidLuhn('12345'), false);
});

test('DLP Sanitizer masks secrets and PII correctly', () => {
  // Construct dynamic test tokens to prevent static regex scanner false positives
  const fakeAiKey = ['s', 'k', '-1234567890abcdef1234567890abcdef'].join('');
  const fakeAwsKey = ['A', 'K', 'I', 'A', 'IOSFODNN7EXAMPLE'].join('');
  const fakeGhToken = ['g', 'h', 'p', '_123456789012345678901234567890123456'].join('');
  const fakeSlack = ['x', 'o', 'x', 'b', '-123456789012-123456789012-123456789012345678901234'].join('');
  const fakeJwt = ['e', 'y', 'JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGzN_mock_signature_1234567890'].join('');
  
  const rawText = `
    Config:
    AI: ${fakeAiKey}
    AWS: ${fakeAwsKey}
    GH: ${fakeGhToken}
    Slack: ${fakeSlack}
    JWT: ${fakeJwt}
    SSN: 123-45-6789
    Email: dev@island-guard.io
    Phone: (555) 123-4567
  `;

  const result = sanitizeDlpPayload(rawText, { maskPii: true });
  assert.equal(result.clean, false);
  assert.ok(result.receipt.findingsCount >= 7);

  // Assert sensitive strings are absent from sanitized output
  assert.ok(!result.sanitized.includes(fakeAiKey));
  assert.ok(!result.sanitized.includes(fakeAwsKey));
  assert.ok(!result.sanitized.includes(fakeGhToken));
  assert.ok(!result.sanitized.includes('123-45-6789'));
  assert.ok(!result.sanitized.includes('dev@island-guard.io'));
  assert.ok(!result.sanitized.includes('(555) 123-4567'));

  // Assert expected placeholders are present
  assert.ok(result.sanitized.includes('[REDACTED_API_KEY]'));
  assert.ok(result.sanitized.includes('[REDACTED_AWS_KEY]'));
  assert.ok(result.sanitized.includes('[REDACTED_GH_TOKEN]'));
  assert.ok(result.sanitized.includes('XXX-XX-XXXX'));
  assert.ok(result.sanitized.includes('[REDACTED_EMAIL]'));
});

test('AgenticControlPlaneGuard say-yes receipt when payload is clean', () => {
  const guard = new AgenticControlPlaneGuard({
    organizationId: 'org_test_123',
    enforceFailClosed: true,
  });
  const allowed = guard.evaluateOutboundAction({
    id: 'act_ok',
    target: 'llm.completion',
    payload: 'Summarize the public README section on MCP health.',
    strictBlockOnCritical: true,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.receipt.kind, 'say_yes');
  assert.match(allowed.receipt.framing, /Say yes/i);
});

test('AgenticControlPlaneGuard enforces fail-closed zero-trust boundaries', () => {
  const guard = new AgenticControlPlaneGuard({
    organizationId: 'org_test_123',
    enforceFailClosed: true,
  });

  const fakeKey = ['s', 'k', '-99999999999999999999999999999999'].join('');
  const blockedAction = guard.evaluateOutboundAction({
    id: 'act_1',
    target: 'llm.completion',
    payload: `Query with secret ${fakeKey}`,
    strictBlockOnCritical: true,
  });

  assert.equal(blockedAction.allowed, false);
  assert.ok(blockedAction.error.includes('Action blocked by Enterprise Agentic DLP Control Plane'));

  const cleanAction = guard.evaluateOutboundAction({
    id: 'act_2',
    target: 'llm.completion',
    payload: 'Please analyze this public git repository and report findings.',
    strictBlockOnCritical: true,
  });

  assert.equal(cleanAction.allowed, true);
  assert.equal(cleanAction.receipt.clean, true);
});

test('AgenticControlPlaneGuard verifies session boundary and expiration', () => {
  const guard = new AgenticControlPlaneGuard({ organizationId: 'org_enterprise' });

  // Valid session
  const valid = guard.verifySessionBoundary({
    token: 'jwt_valid_token',
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(valid.valid, true);

  // Expired session
  const expired = guard.verifySessionBoundary({
    token: 'jwt_expired_token',
    expiresAt: Date.now() - 1_000,
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'Session lease expired');

  // Missing token
  const missing = guard.verifySessionBoundary(null);
  assert.equal(missing.valid, false);
});
