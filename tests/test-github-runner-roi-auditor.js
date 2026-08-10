#!/usr/bin/env node
'use strict';

/**
 * test-github-runner-roi-auditor.js — Unit regression test for GitHub Runner ROI Auditor.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { auditRunnerRoi, parseArgs } = require('../tools/github-runner-roi-auditor.js');

function testAuditEvaluation() {
  const audit = auditRunnerRoi();
  assert.strictEqual(audit.recommendation, 'RETAIN_SELF_HOSTED_MAC_MINI_PRIMARY');
  assert.strictEqual(audit.savingsEstimateMonthlyUSD, 540);
  assert.strictEqual(audit.actionsFrugalityGrade, '10/10 (MAX_ROI)');
  console.log('✅ GitHub Runner ROI Audit unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/github-runner-roi-auditor.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.recommendation, 'RETAIN_SELF_HOSTED_MAC_MINI_PRIMARY');
  assert.strictEqual(json.savingsEstimateMonthlyUSD, 540);
  console.log('✅ GitHub Runner ROI Audit CLI execution test passed.');
}

function main() {
  console.log('=== Testing GitHub Runner ROI Auditor ===');
  testAuditEvaluation();
  testCliExecution();
  console.log('✅ GitHub Runner ROI Auditor Test PASSED!');
}

main();
