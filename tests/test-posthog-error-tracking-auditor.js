#!/usr/bin/env node
'use strict';

/**
 * test-posthog-error-tracking-auditor.js — Unit regression test for PostHog Error Tracking Auditor.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { auditPostHogExceptions } = require('../tools/posthog-error-tracking-auditor.js');

async function testAuditEvaluation() {
  const audit = await auditPostHogExceptions();
  assert.strictEqual(audit.organization, 'Max Smith KDP LLC');
  assert.ok(audit.status);
  console.log('✅ PostHog Error Tracking Audit unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/posthog-error-tracking-auditor.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.ok(json.organization);
  console.log('✅ PostHog Error Tracking Audit CLI execution test passed.');
}

async function main() {
  console.log('=== Testing PostHog Error Tracking Auditor ===');
  await testAuditEvaluation();
  testCliExecution();
  console.log('✅ PostHog Error Tracking Auditor Test PASSED!');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});