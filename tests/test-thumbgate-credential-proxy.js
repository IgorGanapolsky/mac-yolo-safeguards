'use strict';

/**
 * Unit Tests for ThumbGate Credential Proxy (`tools/thumbgate-credential-proxy.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { redactAgentContext, processAgentProxyCall, runProxyDiagnostic } = require('../tools/thumbgate-credential-proxy');

console.log('Running test-thumbgate-credential-proxy.js...');

// Test 1: Redaction of Bearer tokens
{
  const rawInput = 'Authorization: Bearer ghp_1234567890abcdefghijklmnopqrstuvwxyz';
  const redacted = redactAgentContext(rawInput);
  assert.ok(!redacted.includes('ghp_1234567890'), 'Expected token to be redacted');
  assert.ok(redacted.includes('[REDACTED_BY_THUMBGATE_PROXY]'), 'Expected redaction marker');
}

// Test 2: Process Agent Proxy Call (Zero-Trust)
{
  const envelope = {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    payload: { headers: { Authorization: 'Bearer sk-abcdef1234567890' } },
    secretAlias: 'OPENAI_API_KEY_PROD',
  };
  const res = processAgentProxyCall(envelope);
  assert.strictEqual(res.status, 'PROXY_SUCCESS', 'Expected PROXY_SUCCESS status');
  assert.strictEqual(res.credentialIsolated, true, 'Expected credentialIsolated === true');
  assert.strictEqual(res.agentExposedSecretsCount, 0, 'Expected 0 exposed secrets');
}

// Test 3: Proxy Diagnostic
{
  const diag = runProxyDiagnostic();
  assert.strictEqual(diag.proxyRating, '10/10 (ZERO_TRUST_CREDENTIAL_ISOLATION)', 'Expected 10/10 rating');
}

console.log('ok tests/test-thumbgate-credential-proxy.js');
