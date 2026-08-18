#!/usr/bin/env node
'use strict';

/**
 * test-taste-and-slop-register.js
 * -------------------------------
 * Verifies AI Slop Register, 3-way review comment classification, and diff auditing:
 *   - 3-Way feedback classification (Deterministic, Execution-Testable, Genuine Judgment)
 *   - Slop detection (banned filler, secrets, force pushes)
 *   - Pass-through on clean engineering code
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const {
  FEEDBACK_BUCKETS,
  classifyReviewComment,
  auditContent,
  runDoctor,
} = require('../tools/taste-and-slop-register');

console.log('🧪 Running AI Slop Register & Taste Engine Test Suite...');

// 1. 3-Way Review Feedback Classification
{
  const lintComment = "Fix the naming convention and avoid unused import statements.";
  const lintClass = classifyReviewComment(lintComment);
  assert.strictEqual(lintClass.bucket, FEEDBACK_BUCKETS.DETERMINISTIC);
  assert.strictEqual(lintClass.codifiable, true);

  const testComment = "The handler returns 500 when timeout happens, add an assertion test.";
  const testClass = classifyReviewComment(testComment);
  assert.strictEqual(testClass.bucket, FEEDBACK_BUCKETS.EXECUTION_TESTABLE);
  assert.strictEqual(testClass.codifiable, true);

  const archComment = "Does this UX align with our long-term customer onboarding vision?";
  const archClass = classifyReviewComment(archComment);
  assert.strictEqual(archClass.bucket, FEEDBACK_BUCKETS.GENUINE_JUDGMENT);
  assert.strictEqual(archClass.codifiable, false);
  console.log('  ✓ 3-Way review feedback classification passes (Deterministic / Test / Judgment)');
}

// 2. Slop Register Diff Auditing
{
  const sloppyDiff = [
    '// As an AI language model, here is the function',
    '// TODO: implement later',
    'git push --force origin main',
  ].join('\n');
  const auditRes = auditContent(sloppyDiff);
  assert.strictEqual(auditRes.clean, false);
  assert.ok(auditRes.violations.length >= 3);

  const cleanDiff = `
    export function calculateTax(amount: number): number {
      return Number((amount * 0.0825).toFixed(2));
    }
  `;
  const cleanAudit = auditContent(cleanDiff);
  assert.strictEqual(cleanAudit.clean, true);
  assert.strictEqual(cleanAudit.violations.length, 0);
  console.log('  ✓ Slop register diff auditing & block enforcement passes');
}

// 3. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.totalRules >= 4);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All AI Slop Register & Taste Engine tests passed successfully!');
process.exit(0);
