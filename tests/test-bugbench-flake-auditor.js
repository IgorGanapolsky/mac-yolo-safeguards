'use strict';

/**
 * Unit Tests for BugBench Flake Auditor (`tools/bugbench-flake-auditor.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditSelectorResilience, auditPassRateTrust, runBugBenchDiagnostic } = require('../tools/bugbench-flake-auditor');

console.log('Running test-bugbench-flake-auditor.js...');

// Test 1: Selector Resilience Audit
{
  const locators = ['[data-testid="input"]', '[aria-label="Submit"]', '[role="button"]'];
  const res = auditSelectorResilience(locators);
  assert.strictEqual(res.resilienceScore, 100, 'Expected 100% resilience score');
  assert.strictEqual(res.status, 'RESILIENT', 'Expected RESILIENT status');
}

// Test 2: AI Pass Rate Trust Audit
{
  const trust = auditPassRateTrust({ totalTests: 10, passedTests: 10, retriedTests: 0 });
  assert.strictEqual(trust.flakeRatePercent, 0, 'Expected 0% flake rate');
  assert.strictEqual(trust.trustedPassRatePercent, 100, 'Expected 100% trusted pass rate');
  assert.strictEqual(trust.status, 'TRUSTED_ZERO_FLAKE', 'Expected TRUSTED_ZERO_FLAKE status');
}

// Test 3: Full BugBench Diagnostic
{
  const diag = runBugBenchDiagnostic();
  assert.strictEqual(diag.overallScore, '10/10 (A+)', 'Expected 10/10 (A+) overall score');
}

console.log('ok tests/test-bugbench-flake-auditor.js');
