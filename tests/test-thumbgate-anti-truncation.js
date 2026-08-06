'use strict';

/**
 * Unit Tests for ThumbGate Anti-Truncation & False Loop Interceptor (`tools/thumbgate-anti-truncation-interceptor.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { verifyPayloadCompleteness, runAntiTruncationDiagnostic } = require('../tools/thumbgate-anti-truncation-interceptor');

console.log('Running test-thumbgate-anti-truncation.js...');

// Test 1: Silent Truncation Interception (500 out of 6500 rows)
{
  const truncatedPayload = { fetchedRows: 500, totalRows: 6500, hasMorePages: false };
  const res = verifyPayloadCompleteness('query_db', truncatedPayload);
  assert.strictEqual(res.status, 'SILENT_TRUNCATION_BLOCKED', 'Expected SILENT_TRUNCATION_BLOCKED status');
  assert.strictEqual(res.severity, 'HIGH_DATA_LOSS_RISK', 'Expected HIGH_DATA_LOSS_RISK severity');
}

// Test 2: False Loop Termination Interception
{
  const falseLoopPayload = { fetchedRows: 1000, totalRows: 5000, hasMorePages: true, isLoopSuspected: true };
  const res = verifyPayloadCompleteness('query_db', falseLoopPayload);
  assert.strictEqual(res.status, 'FALSE_LOOP_TERMINATION_INTERCEPTED', 'Expected FALSE_LOOP_TERMINATION_INTERCEPTED status');
}

// Test 3: Verified Payload Completeness
{
  const completePayload = { fetchedRows: 6500, totalRows: 6500, hasMorePages: false };
  const res = verifyPayloadCompleteness('query_db', completePayload);
  assert.strictEqual(res.status, 'PAYLOAD_COMPLETE_VERIFIED', 'Expected PAYLOAD_COMPLETE_VERIFIED status');
  assert.strictEqual(res.cDataCompliance, 'PASS_NO_SILENT_DATA_LOSS', 'Expected PASS_NO_SILENT_DATA_LOSS');
}

// Test 4: Anti-Truncation Diagnostic
{
  const diag = runAntiTruncationDiagnostic();
  assert.strictEqual(diag.antiTruncationEngine, 'ACTIVE', 'Expected ACTIVE engine status');
}

console.log('ok tests/test-thumbgate-anti-truncation.js');
