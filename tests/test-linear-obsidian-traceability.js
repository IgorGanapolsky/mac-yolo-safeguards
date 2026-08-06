'use strict';

/**
 * Unit Tests for Linear Traceability & Obsidian Knowledge Separation (`tools/linear-obsidian-traceability-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { verifyObsidianKnowledgeVault, verifyLinearTraceabilityPosture, runTraceabilitySuite } = require('../tools/linear-obsidian-traceability-engine');

console.log('Running test-linear-obsidian-traceability.js...');

// Test 1: Obsidian Vault layout verification
const vaultRes = verifyObsidianKnowledgeVault();
assert.strictEqual(vaultRes.status, 'VAULT_STRUCTURE_VERIFIED', 'Expected VAULT_STRUCTURE_VERIFIED');
assert.strictEqual(vaultRes.structureCount, 10, 'Expected 10 structural vault documents');

// Test 2: Linear Traceability lifecycle state verification
const linearRes = verifyLinearTraceabilityPosture('Released');
assert.strictEqual(linearRes.linearTraceabilityLayer, 'ACTIVE', 'Expected ACTIVE layer');
assert.strictEqual(linearRes.neverMarkDoneOnMerge, true, 'Expected neverMarkDoneOnMerge true');
assert.strictEqual(linearRes.releasedPostDeployEnforced, true, 'Expected releasedPostDeployEnforced true');

// Test 3: Full suite run
const suite = runTraceabilitySuite();
assert.strictEqual(suite.traceabilityGrade, '10/10 (LINEAR_RELEASE_TRACEABILITY_VERIFIED)', 'Expected 10/10 grade');

console.log('ok tests/test-linear-obsidian-traceability.js');
