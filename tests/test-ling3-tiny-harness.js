'use strict';

const assert = require('assert');
const { resolveLing3Route, Ling3TinyHarness } = require('../tools/ling3-tiny-harness');

console.log('=== Testing Ling 3.0 Tiny Zero-Cost Gateway Adapter ===');

const microRoute = resolveLing3Route('what is the status of pr 1655');
assert.strictEqual(microRoute.recommendedModel, 'ling-3.0-tiny');
assert.strictEqual(microRoute.isFreeTier, true);

const complexRoute = resolveLing3Route('refactor the entire multi-agent router architecture with state machines');
assert.strictEqual(complexRoute.recommendedModel, 'openrouter/auto');

const harness = new Ling3TinyHarness();
const evalRes = harness.evaluateTask('check build status');
assert.strictEqual(evalRes.zeroCostPolicyPass, true);

console.log('✅ Ling 3.0 Tiny Gateway Adapter Unit Tests PASSED!');
