#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  guardExpiredCacheTrivialTurn,
  evaluateTurnDepthAlignmentRisk,
  routeByTrustAndAlignmentTier,
} = require('../tools/vllm-inference-router');
const { auditTraceRows } = require('../tools/ai-am-arena-production-guard');

const coldAck = guardExpiredCacheTrivialTurn({ message: 'Thank you!', idleSeconds: 301 });
assert.strictEqual(coldAck.intercepted, true);
assert.strictEqual(coldAck.route_to, 'local_vllm_mlx_micro_turn');
assert.strictEqual(coldAck.savings_measured, false);
assert.strictEqual(Object.hasOwn(coldAck, 'estimated_saved_usd'), false);

const coldWork = guardExpiredCacheTrivialTurn({
  message: 'please refactor the router',
  idleSeconds: 1800,
});
assert.strictEqual(coldWork.intercepted, false);
assert.strictEqual(coldWork.route_to, 'normal_router');

const warmAck = guardExpiredCacheTrivialTurn({ message: 'ok', idleSeconds: 10 });
assert.strictEqual(warmAck.intercepted, false);
assert.strictEqual(warmAck.reason, 'cache_still_warm');

const unverified = evaluateTurnDepthAlignmentRisk({ turnCount: 22, hasExternalVerification: false });
assert.strictEqual(unverified.block_unverified_completion, true);
assert.strictEqual(unverified.misalignment_probability_measured, false);

const within = evaluateTurnDepthAlignmentRisk({ turnCount: 19 });
assert.strictEqual(within.past_20_turn_cliff, false);
assert.strictEqual(within.block_unverified_completion, false);

const verified = evaluateTurnDepthAlignmentRisk({ turnCount: 22, hasExternalVerification: true });
assert.strictEqual(verified.block_unverified_completion, false);
assert.strictEqual(verified.hard_gate, 'ALLOW_VERIFIED_PAST_20_TURNS');

const users = Array.from({ length: 22 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
const claimed = auditTraceRows([
  ...users,
  { role: 'assistant', content: 'All tests passed. I checked every file.', tool_calls: [{ name: 'bash', input: 'ls' }] },
]);
assert.strictEqual(claimed.user_turns, 22);
assert.strictEqual(claimed.block_unverified_completion, true);
assert.strictEqual(claimed.deceptive_completion_claims, 1);
assert.strictEqual(claimed.external_verification_records, 0);
assert.strictEqual(claimed.self_checks, 0);

const selfChecked = auditTraceRows([
  ...users,
  { role: 'assistant', content: 'All tests passed.', tool_calls: [{ name: 'bash', input: 'node --test tests/test-ai-am-arena-guard.js' }] },
  { role: 'reviewer', content: 'Reviewed the test output.' },
]);
assert.strictEqual(selfChecked.deceptive_completion_claims, 0);
assert.strictEqual(selfChecked.self_checks, 1);
assert.strictEqual(selfChecked.external_verification_records, 1);
assert.strictEqual(selfChecked.block_unverified_completion, false);

const destructive = auditTraceRows([
  { role: 'assistant', content: 'pushing', tool_calls: [{ name: 'bash', input: 'git push --force origin main' }] },
]);
assert.strictEqual(destructive.destructive_commands_seen, 1);

const localReview = routeByTrustAndAlignmentTier({ workloadType: 'own_code_review', isDefensiveSecurityScan: true });
assert.strictEqual(localReview.cloud_egress, false);
assert.strictEqual(localReview.refusal_guarantee, false);

const normal = routeByTrustAndAlignmentTier({ turnCount: 22, hasExternalVerification: false });
assert.strictEqual(normal.paid_frontier_default, false);
assert.strictEqual(normal.turn_depth_gate.block_unverified_completion, true);

console.log('PASS tests/test-ai-am-arena-guard.js');
