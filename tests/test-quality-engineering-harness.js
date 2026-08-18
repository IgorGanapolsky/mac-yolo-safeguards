#!/usr/bin/env node
'use strict';

/**
 * test-quality-engineering-harness.js
 * -----------------------------------
 * Unit tests for quality-engineering-harness.js:
 *   - Anti-slop detection
 *   - Output contract validation
 *   - Context curation & precision compaction
 *   - End-to-end quality evaluation & targeted repair loop
 */

const assert = require('assert');
const {
  auditSlop,
  validateOutputContract,
  curateContext,
  evaluateQuality,
  repairOutput,
  runDoctor,
} = require('../tools/quality-engineering-harness');

console.log('🧪 Running Quality Engineering Harness Test Suite...');

// 1. Slop Detection Tests
{
  const slopSample = "Sure! I'd be happy to help you with that. As an AI language model, here is the code you requested: console.log('hello'); I hope this helps! Feel free to ask if you have any questions.";
  const audit = auditSlop(slopSample);
  assert.strictEqual(audit.isClean, false, 'Should flag multiple slop patterns');
  assert.ok(audit.slopMatches.length >= 3, 'Should catch at least 3 distinct slop patterns');
  assert.ok(audit.slopScore < 50, 'Slop score should be heavily penalized');

  const cleanSample = "Role: QA Engineer\nGoal: Verify PR #1720\nRequirements:\n- Must pass 59/59 tests\nDefinition of Done: Zero failures on main";
  const cleanAudit = auditSlop(cleanSample);
  assert.strictEqual(cleanAudit.isClean, true, 'Clean sample should pass slop audit');
  assert.strictEqual(cleanAudit.slopScore, 100, 'Clean sample should score 100');
  console.log('  ✓ Slop detection passes (positive & negative cases)');
}

// 2. Output Contract Validation Tests
{
  const missingContract = "Here is some code without any structured roles or definition of done.";
  const invalidRes = validateOutputContract(missingContract);
  assert.strictEqual(invalidRes.isValid, false, 'Should fail missing contract keys');
  assert.ok(invalidRes.missingKeys.includes('Role'), 'Should flag missing Role');
  assert.ok(invalidRes.missingKeys.includes('Definition of Done'), 'Should flag missing Definition of Done');

  const validContract = `
# Deliverable Plan
- **Role**: Software Engineer
- **Goal**: Implement high-ROI quality harness
- **Requirements**:
  - Zero dead code
  - 100% test coverage
- **Definition of Done**:
  - Test suite passes with exit code 0
`;
  const validRes = validateOutputContract(validContract);
  assert.strictEqual(validRes.isValid, true, 'Should pass full output contract');
  assert.strictEqual(validRes.structureScore, 100, 'Structure score should be 100');
  console.log('  ✓ Output contract validation passes');
}

// 3. Context Curation Tests
{
  const noisyContext = `
// eslint-disable-next-line
const x = 1;
at node:internal/modules/cjs/loader:1430:15
at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
console.log('Very long debug string '.repeat(20));
const realCode = "IMPORTANT_INVARIANT";
`;
  const curated = curateContext(noisyContext);
  assert.ok(!curated.curatedContext.includes('at node:internal'), 'Should filter out internal stack traces');
  assert.ok(!curated.curatedContext.includes('eslint-disable'), 'Should filter out eslint comments');
  assert.ok(curated.curatedContext.includes('IMPORTANT_INVARIANT'), 'Should preserve real code invariants');
  assert.ok(curated.reductionPct > 0, 'Should achieve positive reduction percentage');
  console.log('  ✓ Context curation & precision compaction passes');
}

// 4. End-to-End Quality Evaluation & Targeted Repair Loop
{
  const badOutput = "Certainly! I can help with that. Here is the deliverable.";
  const evalRes = evaluateQuality(badOutput);
  assert.strictEqual(evalRes.passed, false, 'Bad output should fail overall quality evaluation');
  assert.ok(evalRes.recommendations.length > 0, 'Should provide actionable fix recommendations');

  const repair = repairOutput(badOutput, evalRes);
  assert.strictEqual(repair.repairApplied, true, 'Repair should be applied');
  assert.ok(!repair.repairedText.includes('Certainly! I can help'), 'Slop should be surgically stripped');
  assert.ok(repair.repairedText.includes('Output Contract Verification'), 'Contract headers should be appended');

  // Verify repaired text passes evaluation
  const postRepairEval = evaluateQuality(repair.repairedText);
  assert.strictEqual(postRepairEval.slop.isClean, true, 'Repaired text slop should be clean');
  console.log('  ✓ End-to-end evaluation and targeted repair passes');
}

// 5. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.slopDetectorRules >= 5);
  assert.strictEqual(doc.maxRepairAttempts, 2);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Quality Engineering Harness tests passed successfully!');
process.exit(0);
