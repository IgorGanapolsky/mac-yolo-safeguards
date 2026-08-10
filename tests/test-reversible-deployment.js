'use strict';

/**
 * Unit Tests for Reversible Deployment Engine (`tools/reversible-deployment-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditReversibleDeploymentPosture } = require('../tools/reversible-deployment-engine');

console.log('Running test-reversible-deployment.js...');

const audit = auditReversibleDeploymentPosture();
assert.strictEqual(audit.status, 'REVERSIBLE_DEPLOYMENT_ACTIVE', 'Expected REVERSIBLE_DEPLOYMENT_ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (REVERSIBLE_DEPLOYMENT_VERIFIED)', 'Expected 10/10 grade');
assert.strictEqual(audit.deploymentStages.length, 6, 'Expected 6 deployment stages');
assert.strictEqual(audit.expandAndContractDatabaseProtocol.length, 5, 'Expected 5 expand-and-contract steps');

console.log('ok tests/test-reversible-deployment.js');
