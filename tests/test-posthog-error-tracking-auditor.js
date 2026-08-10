#!/usr/bin/env node
'use strict';

/**
 * test-posthog-error-tracking-auditor.js — Unit regression test for PostHog Error Tracking Auditor.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { auditPostHogExceptions } = require('../tools/posthog-error-tracking-auditor.js');

function testAuditEvaluation() {
  const audit = auditPostHogExceptions();
  assert.strictEqual(audit.organization, 'Max Smith KDP LLC');
  assert.strictEqual(audit.status, 'STABLE (NON_CRITICAL)');
  assert.strictEqual(audit.totalExceptions, 8);
  assert.strictEqual(audit.issues.length, 2);
  assert.strictEqual(audit.issues[0].category, 'DEBUG_TEST_HARNESS');
  console.log('✅ PostHog Error Tracking Audit unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/posthog-error-tracking-auditor.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.status, 'STABLE (NON_CRITICAL)');
  console.log('✅ PostHog Error Tracking Audit CLI execution test passed.');
}

function main() {
  console.log('=== Testing PostHog Error Tracking Auditor ===');
  testAuditEvaluation();
  testCliExecution();
  console.log('✅ PostHog Error Tracking Auditor Test PASSED!');
}

main();
