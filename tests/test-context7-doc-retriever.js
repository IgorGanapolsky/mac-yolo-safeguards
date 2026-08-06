'use strict';

/**
 * Unit Tests for Context7 Doc Retriever (`tools/context7-doc-retriever.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { lookupSdkDocumentation, auditContext7Coverage } = require('../tools/context7-doc-retriever');

console.log('Running test-context7-doc-retriever.js...');

// Test 1: Valid method lookup
{
  const sdk = lookupSdkDocumentation('expo', 'useCameraPermissions');
  assert.strictEqual(sdk.found, true, 'Expected expo SDK found');
  assert.strictEqual(sdk.isVerified, true, 'Expected method verified');
  assert.strictEqual(sdk.pinnedVersion, '52.0.0', 'Expected pinned version 52.0.0');
}

// Test 2: Unregistered method warning
{
  const sdk = lookupSdkDocumentation('expo', 'nonExistentMethodXYZ');
  assert.strictEqual(sdk.found, true, 'Expected SDK found');
  assert.strictEqual(sdk.isVerified, false, 'Expected unverified method');
  assert.strictEqual(sdk.status, 'API_METHOD_HALLUCINATION_WARNING', 'Expected hallucination warning');
}

// Test 3: Coverage audit
{
  const audit = auditContext7Coverage([
    { name: 'expo', method: 'useCameraPermissions' },
    { name: 'react-native', method: 'StyleSheet' }
  ]);
  assert.strictEqual(audit.summary.coveragePercent, 100, 'Expected 100% coverage');
  assert.strictEqual(audit.summary.status, 'ZERO_HALLUCINATION_A_PLUS', 'Expected A+ rating');
}

console.log('ok tests/test-context7-doc-retriever.js');
