'use strict';

/**
 * Unit Tests for HuggingFace Skill Unit 1 Validator (`tools/hf-skill-unit1-validator.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditHfUnit1SkillCompliance } = require('../tools/hf-skill-unit1-validator');

console.log('Running test-hf-skill-unit1-validator.js...');

// Test 1: Skill Compliance Audit
{
  const diag = auditHfUnit1SkillCompliance();
  if (process.platform !== 'darwin' && diag.totalSkillsChecked === 0) {
    console.log('  [SKIP] global skills dir audit requires operator macOS home (none discovered on this runner)');
  } else {
    assert.ok(diag.totalSkillsChecked > 0, 'Expected to inspect skills in global directory');
  }
  assert.strictEqual(diag.passRate, 100, 'Expected 100% frontmatter compliance rate');
  assert.strictEqual(diag.overallRating, '10/10 (HF_UNIT1_FULLY_COMPLIANT)', 'Expected 10/10 rating');
  assert.strictEqual(diag.status, 'HF_UNIT1_SKILLS_VERIFIED', 'Expected HF_UNIT1_SKILLS_VERIFIED status');
}

console.log('ok tests/test-hf-skill-unit1-validator.js');
