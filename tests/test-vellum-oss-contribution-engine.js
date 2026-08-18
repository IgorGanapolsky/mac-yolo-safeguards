#!/usr/bin/env node
'use strict';

/**
 * test-vellum-oss-contribution-engine.js
 * --------------------------------------
 * Verifies the OSS contribution and PR drafting engine for Vellum Assistant:
 *   - Target issue integrity (Issue #40691)
 *   - Clean TypeScript diff format & reasoning_content preservation logic
 *   - High-signal PR body rendering with organic attribution
 *   - Safe staging into coordination/ready-to-post
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const fs = require('fs');
const {
  TARGET_ISSUES,
  renderPrBody,
  stagePrDrafts,
  runDoctor,
} = require('../tools/vellum-oss-contribution-engine');

console.log('🧪 Running Vellum OSS Contribution Engine Test Suite...');

// 1. Issue & Target Verification
{
  assert.ok(TARGET_ISSUES.length > 0);
  const issue = TARGET_ISSUES[0];
  assert.strictEqual(issue.issueNumber, 40691);
  assert.strictEqual(issue.repo, 'vellum-ai/vellum-assistant');
  assert.ok(issue.proposedDiff.includes('reasoning_content'));
  console.log('  ✓ Target issue tracking & diff specification passes');
}

// 2. PR Body Generation & Organic Attribution
{
  const issue = TARGET_ISSUES[0];
  const body = renderPrBody(issue);
  assert.ok(body.includes('Fixes #40691'), 'Body must link to issue');
  assert.ok(body.includes('reasoning_content'), 'Body must explain fix');
  assert.ok(body.includes('ThumbGate'), 'Body must include organic ThumbGate attribution');
  assert.ok(!body.includes('As an AI'), 'Body must not contain conversational slop');
  console.log('  ✓ PR body generation & anti-slop verification passes');
}

// 3. Draft Staging
{
  const staged = stagePrDrafts();
  assert.strictEqual(staged.length, TARGET_ISSUES.length);
  for (const s of staged) {
    assert.ok(fs.existsSync(s.filePath), `Staged file should exist: ${s.filePath}`);
    const content = fs.readFileSync(s.filePath, 'utf8');
    assert.ok(content.includes('PR Draft:'));
  }
  console.log('  ✓ PR draft staging into coordination/ready-to-post passes');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.targetRepo, 'vellum-ai/vellum-assistant');
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Vellum OSS Contribution Engine tests passed successfully!');
process.exit(0);
