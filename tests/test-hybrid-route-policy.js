'use strict';

const assert = require('assert');
const {
  validatePolicy,
  decide,
  examplePolicy,
  selfTest,
  main,
  DEFAULT_POLICY,
} = require('../tools/hybrid-route-policy');

console.log('=== test-hybrid-route-policy ===');

assert.strictEqual(validatePolicy(examplePolicy()).ok, true);
assert.strictEqual(decide('ssn verification help', {}).route, 'local_fast');
assert.strictEqual(decide('implement unit test for pair server', {}).route, 'local_coder_candidate');
assert.strictEqual(decide('architecture review of gateway', { paidOk: true }).route, 'glm52_reasoning');
assert.strictEqual(decide('architecture review of gateway', { paidOk: false }).route, 'local_fast');

const exclusive = validatePolicy({
  default_route: 'local_fast',
  candidates: ['local_fast'],
  router: { model: 'x' },
  rules: [{ id: 'a', match: { keywords_any: ['x'] }, route: 'local_fast' }],
});
assert.strictEqual(exclusive.ok, false);

const st = selfTest();
assert.strictEqual(st.ok, true);
assert.strictEqual(main(['self-test']), 0);
assert.strictEqual(main(['example']), 0);

// Default policy candidates must match live hermes-economic-router ROUTES ids.
const eco = require('../tools/hermes-economic-router.js');
const liveIds = new Set((eco.ROUTES || []).map((r) => r.id));
assert(liveIds.size > 0, 'economic router must export ROUTES');
for (const id of DEFAULT_POLICY.candidates) {
  assert.strictEqual(typeof id, 'string');
  assert(id.length > 0);
  assert(liveIds.has(id), `MISSING economic route id: ${id}`);
}
assert(!DEFAULT_POLICY.candidates.includes('cloud_general'));
assert(!DEFAULT_POLICY.candidates.includes('cloud_coder'));

console.log('✅ test-hybrid-route-policy PASSED');
