'use strict';

const assert = require('assert');
const path = require('path');
const { TielineProductContractEngine } = require('../tools/tieline-product-contract.js');

console.log('=== Running Tieline Product Contract Engine Tests ===');

const engine = new TielineProductContractEngine();

// Test 1: Contract retrieval
const contracts = engine.getContracts();
assert.ok(contracts.length >= 4);
console.log(`✔ Test 1: Successfully retrieved ${contracts.length} product contracts`);

// Test 2: Compute blast radius for HostingSelector change
const radius1 = engine.computeBlastRadius(['apps/hermes-control-plane/app/components/HostingSelector.tsx']);
assert.equal(radius1.impactedFeaturesCount, 1);
assert.equal(radius1.affectedContracts[0].featureId, 'FEATURE_HOSTING_MODE');
assert.ok(radius1.requiredTests.includes('apps/hermes-control-plane/tests/hosting-selector.test.mjs'));
console.log('✔ Test 2: Blast radius for HostingSelector correctly mapped to FEATURE_HOSTING_MODE and required test');

// Test 3: Compute blast radius for multi-file changes
const radius2 = engine.computeBlastRadius([
  'tools/hermes-economic-router.js',
  'apps/hermes-control-plane/app/components/AiEmployeeCard.tsx'
]);
assert.equal(radius2.impactedFeaturesCount, 2);
const features = radius2.affectedContracts.map(c => c.featureId);
assert.ok(features.includes('FEATURE_ECONOMIC_ROUTER'));
assert.ok(features.includes('FEATURE_DIGITAL_EMPLOYEE'));
assert.ok(radius2.requiredTests.includes('tests/test-glm53-coding-plan.js'));
assert.ok(radius2.requiredTests.includes('apps/hermes-control-plane/tests/qoder-improvements.test.mjs'));
console.log('✔ Test 3: Multi-file blast radius correctly resolved multiple contracts and tests');

// Test 4: Verify contract integrity on repo disk
const integrity = engine.verifyContractIntegrity(path.join(__dirname, '..'));
console.log(`Contract integrity check: valid=${integrity.valid}, issues=${integrity.issues.length}`);
if (!integrity.valid) {
  console.log('Issues found:', integrity.issues);
}
assert.equal(integrity.valid, true);
console.log('✔ Test 4: All contract-linked code files and test files exist on disk');

console.log('\nAll Tieline Product Contract Engine tests passed cleanly!');
