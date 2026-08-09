'use strict';

/**
 * Unit Tests for HuggingFace Sub-Agent Unit 4 Validator (`tools/hf-subagent-unit4-validator.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditHfUnit4SubagentCompliance } = require('../tools/hf-subagent-unit4-validator');

console.log('Running test-hf-subagent-unit4-validator.js...');

// Test 1: Unit 4 Handoff Compliance
{
  const diag = auditHfUnit4SubagentCompliance();
  assert.strictEqual(diag.passedChecks, 4, 'Expected 4/4 checks passed');
  assert.strictEqual(diag.passRate, 100, 'Expected 100% compliance rate');
  assert.strictEqual(diag.overallRating, '10/10 (HF_UNIT4_FULLY_COMPLIANT)', 'Expected Grade A+ rating');
  assert.strictEqual(diag.status, 'HF_UNIT4_HANDOFF_VERIFIED', 'Expected HF_UNIT4_HANDOFF_VERIFIED status');
}

console.log('ok tests/test-hf-subagent-unit4-validator.js');
