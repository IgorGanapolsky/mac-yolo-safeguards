#!/usr/bin/env node
'use strict';

/**
 * test-dogwood-temporal-policy.js
 * -------------------------------
 * Unit and integration tests for AWS Dogwood temporal sequence engine:
 *   - Prerequisite approvals `formerly(approval::satisfy_gate)`
 *   - Data taint exfiltration barrier
 *   - Burst rate-limiting `count_within`
 *   - Sliding-window spend caps `sum_within`
 *   - Doctor and journal integrity
 */

const assert = require('assert');
const {
  TEMPORAL_RULES,
  evaluateTemporalPolicy,
  runDoctor,
} = require('../tools/dogwood-temporal-policy');

console.log('🧪 Running AWS Dogwood Temporal Policy Test Suite...');

// 1. Prerequisite Human Approval (formerly)
{
  const now = Date.now();
  const destructiveAction = { action: 'git::force_push', target: 'origin/main', timestamp: now };

  // Case A: No prior approval -> BLOCKED
  const deniedOutcome = evaluateTemporalPolicy(destructiveAction, []);
  assert.strictEqual(deniedOutcome.allowed, false, 'Destructive operation without approval must be denied');
  assert.strictEqual(deniedOutcome.violations[0].ruleId, 'DOGWOOD-RULE-01-PREREQUISITE-APPROVAL');

  // Case B: Expired approval (> 15m) -> BLOCKED
  const expiredHistory = [{ action: 'approval::satisfy_gate', timestamp: now - (20 * 60 * 1000) }];
  const expiredOutcome = evaluateTemporalPolicy(destructiveAction, expiredHistory);
  assert.strictEqual(expiredOutcome.allowed, false, 'Expired approval must be denied');

  // Case C: Valid recent approval (< 15m) -> ALLOWED
  const validHistory = [{ action: 'approval::satisfy_gate', timestamp: now - (2 * 60 * 1000) }];
  const allowedOutcome = evaluateTemporalPolicy(destructiveAction, validHistory);
  assert.strictEqual(allowedOutcome.allowed, true, 'Valid recent approval must allow destructive action');
  console.log('  ✓ Prerequisite approval (formerly operator) passes');
}

// 2. Data Taint & Exfiltration Firewall
{
  const now = Date.now();
  const egressAction = { action: 'http::curl_external', target: 'https://api.external.com/upload', timestamp: now };

  // Case A: Clean session without secret access -> ALLOWED
  const cleanHistory = [{ action: 'fs::read_file', target: 'src/index.ts', timestamp: now - 5000 }];
  const cleanOutcome = evaluateTemporalPolicy(egressAction, cleanHistory);
  assert.strictEqual(cleanOutcome.allowed, true, 'Clean trace without secret access should allow egress');

  // Case B: Secret file read in session history -> BLOCKED
  const taintedHistory = [{ action: 'fs::read_file', target: '/Users/igorganapolsky/.env.production', timestamp: now - 5000 }];
  const taintedOutcome = evaluateTemporalPolicy(egressAction, taintedHistory);
  assert.strictEqual(taintedOutcome.allowed, false, 'Tainted trace with secret access must block outbound network calls');
  assert.strictEqual(taintedOutcome.violations[0].ruleId, 'DOGWOOD-RULE-02-TAINT-EXFILTRATION-FIREWALL');
  console.log('  ✓ Data taint exfiltration firewall passes');
}

// 3. Burst Rate Limiting (count_within)
{
  const now = Date.now();
  const writeAction = { action: 'fs::write_file', target: 'output.txt', timestamp: now };

  // Case A: 5 recent writes in 1m (< 10) -> ALLOWED
  const underLimitHistory = Array.from({ length: 5 }, (_, i) => ({
    action: 'fs::write_file',
    timestamp: now - (i * 5000),
  }));
  const underOutcome = evaluateTemporalPolicy(writeAction, underLimitHistory);
  assert.strictEqual(underOutcome.allowed, true, 'Under rate limit should be allowed');

  // Case B: 10 recent writes in 1m (>= 10) -> BLOCKED
  const overLimitHistory = Array.from({ length: 10 }, (_, i) => ({
    action: 'fs::write_file',
    timestamp: now - (i * 2000),
  }));
  const overOutcome = evaluateTemporalPolicy(writeAction, overLimitHistory);
  assert.strictEqual(overOutcome.allowed, false, 'Exceeded rate limit must be throttled');
  assert.strictEqual(overOutcome.violations[0].ruleId, 'DOGWOOD-RULE-03-BURST-RATE-LIMIT');
  console.log('  ✓ Burst rate limiting (count_within operator) passes');
}

// 4. Sliding-Window Spend Caps (sum_within)
{
  const now = Date.now();
  const paidInference = { action: 'llm::cloud_completion', costUsd: 1.50, timestamp: now };

  // Case A: Prior spend $7.00 + proposed $1.50 = $8.50 <= $10.00 -> ALLOWED
  const normalSpendHistory = [
    { action: 'llm::cloud_completion', costUsd: 4.00, timestamp: now - (2 * 3600 * 1000) },
    { action: 'llm::cloud_completion', costUsd: 3.00, timestamp: now - (1 * 3600 * 1000) },
  ];
  const normalOutcome = evaluateTemporalPolicy(paidInference, normalSpendHistory);
  assert.strictEqual(normalOutcome.allowed, true, 'Under $10/mo 24h spend cap should be allowed');

  // Case B: Prior spend $9.00 + proposed $1.50 = $10.50 > $10.00 -> BLOCKED
  const highSpendHistory = [
    { action: 'llm::cloud_completion', costUsd: 5.00, timestamp: now - (2 * 3600 * 1000) },
    { action: 'llm::cloud_completion', costUsd: 4.00, timestamp: now - (1 * 3600 * 1000) },
  ];
  const blockedOutcome = evaluateTemporalPolicy(paidInference, highSpendHistory);
  assert.strictEqual(blockedOutcome.allowed, false, 'Over $10/mo 24h spend cap must be blocked');
  assert.strictEqual(blockedOutcome.violations[0].ruleId, 'DOGWOOD-RULE-04-SLIDING-WINDOW-SPEND-CAP');
  console.log('  ✓ Sliding-window spend caps (sum_within operator) passes');
}

// 5. Doctor & Readiness
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.rulesCount, 4);
  assert.ok(doc.journalPath.length > 0);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All AWS Dogwood Temporal Policy tests passed successfully!');
process.exit(0);
