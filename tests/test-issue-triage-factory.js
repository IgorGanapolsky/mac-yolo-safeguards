'use strict';

/**
 * Unit Tests for Astro/Cloudflare Issue Triage Harness (`tools/issue-triage-factory.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { triageIssue, verifyPatch } = require('../tools/issue-triage-factory');

console.log('Running test-issue-triage-factory.js...');

// Test 1: Bug report triage & reproduction flag
{
  const triaged = triageIssue({
    issueId: 'GH-100',
    title: 'Critical bug causing crash in chat screen',
    body: 'App hits null reference error'
  });

  assert.strictEqual(triaged.category, 'BUG_REPORT', 'Expected BUG_REPORT category');
  assert.strictEqual(triaged.priority, 'P0_CRITICAL', 'Expected P0_CRITICAL priority');
  assert.strictEqual(triaged.requiresReproduction, true, 'Expected reproduction required');
}

// Test 2: Patch verification gate
{
  const patch = verifyPatch('GH-100', ['src/screens/ChatScreen.tsx'], true);
  assert.strictEqual(patch.isVerified, true, 'Expected patch to be verified');
  assert.strictEqual(patch.verdict, 'PATCH_VERIFIED_AUTOMATICALLY', 'Expected PATCH_VERIFIED_AUTOMATICALLY verdict');
  assert.strictEqual(patch.suggestedLabel, 'status:verified-fix', 'Expected status:verified-fix label');
}

console.log('ok tests/test-issue-triage-factory.js');
