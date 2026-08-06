'use strict';

/**
 * Unit Tests for Multi-Agent Evidence Bundle Engine (`tools/ai-evidence-bundle-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { initEvidenceBundle, verifyEvidenceBundle } = require('../tools/ai-evidence-bundle-engine');

console.log('Running test-ai-evidence-bundle.js...');

// Test 1: Initialize bundle
const initRes = initEvidenceBundle({ defect: 'HTTP 409 error' });
assert.strictEqual(initRes.status, 'PROVISIONED', 'Expected PROVISIONED status');
assert.strictEqual(initRes.filesCreated, 10, 'Expected 10 evidence bundle files');

// Test 2: Verify bundle completeness
const audit = verifyEvidenceBundle();
assert.strictEqual(audit.valid, true, 'Expected valid evidence bundle');
assert.strictEqual(audit.presentFilesCount, 10, 'Expected 10/10 files present');
assert.strictEqual(audit.cDataEvidenceBundleGrade, '10/10 (ANTI_CONTEXT_DRIFT_ACTIVE)', 'Expected 10/10 grade');

console.log('ok tests/test-ai-evidence-bundle.js');
