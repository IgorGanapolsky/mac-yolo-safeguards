'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteQuery, SYNONYM_RULES } = require('../tools/retrieval-query-rewrite');

test('rewrite is deterministic and expands session-not-found', () => {
  const a = rewriteQuery('Session not found on web continue');
  const b = rewriteQuery('Session not found on web continue');
  assert.deepEqual(a, b);
  assert.ok(a.rulesFired.includes('session-not-found'));
  assert.ok(a.rewritten.includes('mobile_'));
  assert.ok(a.rewritten.includes('isRecoverableSessionId'));
});

test('rewrite is no-op when no rule matches', () => {
  const r = rewriteQuery('how do I change the button color');
  assert.equal(r.rewritten, r.original);
  assert.equal(r.expansions.length, 0);
});

test('synonym rule table is non-empty', () => {
  assert.ok(SYNONYM_RULES.length >= 8);
});

test('cloud-connector and moe-routing rules expand', () => {
  const c = rewriteQuery('hermes cloud connector failover');
  assert.ok(c.rulesFired.includes('cloud-connector'));
  assert.ok(c.rewritten.includes('hermes-cloud-connector'));
  const m = rewriteQuery('dead expert economic router');
  assert.ok(m.rulesFired.includes('moe-routing'));
  assert.ok(m.rewritten.includes('moe-expert-health'));
});

// Measured miss 2026-08-04: NL "discovers computers on local network" ranked
// gatewayDiscovery.ts ~#220 until lan-gateway-discovery expansion + stem scoring.
test('lan-gateway-discovery expands discovers-computers NL query', () => {
  const r = rewriteQuery('mobile app discovers computers on local network');
  assert.ok(r.rulesFired.includes('lan-gateway-discovery'));
  assert.ok(r.rewritten.includes('gatewayDiscovery'));
  assert.ok(r.rewritten.includes('discoverAllGatewaysOnLan'));
  assert.ok(r.expansions.includes('lanScan'));
});
