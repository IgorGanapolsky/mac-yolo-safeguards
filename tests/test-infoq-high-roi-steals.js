'use strict';

const assert = require('assert');
const {
  evaluateContextInfrastructure,
  resolveRemediationTransition,
  runFastEvalProbe,
  auditOverBuilding,
  FAILURE_STATES,
} = require('../tools/infoq-high-roi-steals');

console.log('=== Testing InfoQ High-ROI Steals Engine ===');

// 1. Context Infrastructure Test (Tacnode Pattern)
const contextEval = evaluateContextInfrastructure({ tokenBudget: 65536, currentTokens: 15000, fragmentationScore: 0.1 });
assert.strictEqual(contextEval.status, 'OPTIMAL');
assert.strictEqual(contextEval.recommendedAction, 'PROCEED');

const fragmentedEval = evaluateContextInfrastructure({ tokenBudget: 65536, currentTokens: 55000, fragmentationScore: 0.45 });
assert.strictEqual(fragmentedEval.status, 'FRAGMENTED_REQUIRES_COMPACTION');
assert.strictEqual(fragmentedEval.recommendedAction, 'COMPACT_CONTEXT_PACK');

// 2. State-Machine Remediation Test (Stripe Pattern)
const authError = resolveRemediationTransition('HEALTHY', { message: 'Claude OAuth refresh token was rejected' });
assert.strictEqual(authError.nextState, FAILURE_STATES.AUTH_REJECTED);
assert.strictEqual(authError.actionCode, 'RETRY_WITH_OPENAI');

const contextError = resolveRemediationTransition('HEALTHY', { message: 'Compacting context before next turn' });
assert.strictEqual(contextError.nextState, FAILURE_STATES.CONTEXT_CEILING);

// 3. Fast-Eval Probe Test (Spotify Honk Pattern)
const cleanOutput = runFastEvalProbe('All PRs have been merged and CI is passing.');
assert.strictEqual(cleanOutput.pass, true);
assert.strictEqual(cleanOutput.score, 1.0);

const slopOutput = runFastEvalProbe('Open PRs: all three are BLOCKED - Compacting context before next call');
assert.strictEqual(slopOutput.pass, false);
assert(slopOutput.violations.includes('BOT_SLOP_META_COMMENTARY'));

// 4. Over-Building Audit Test (Ponytail Pattern)
const sampleDiff = `
+ function addA() {}
+ function addB() {}
- function removeOld() {}
`;
const audit = auditOverBuilding(sampleDiff, 50);
assert.strictEqual(audit.recommendation, 'PASS_LEAN_DIFF');

console.log('✅ InfoQ High-ROI Steals Engine Unit Tests PASSED!');
