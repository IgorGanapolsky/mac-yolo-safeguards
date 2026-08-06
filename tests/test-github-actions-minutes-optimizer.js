'use strict';

/**
 * Unit Tests for GitHub Actions Minutes Optimizer (`tools/github-actions-minutes-optimizer.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditWorkflowFiles, runOptimizerAudit } = require('../tools/github-actions-minutes-optimizer');

console.log('Running test-github-actions-minutes-optimizer.js...');

// Test 1: Audit workflow files
const workflows = auditWorkflowFiles();
assert.ok(Array.isArray(workflows), 'Expected workflows array');
assert.ok(workflows.length > 0, 'Expected at least 1 workflow audited');

const ciWorkflow = workflows.find(w => w.file === 'ci.yml');
assert.ok(ciWorkflow, 'Expected ci.yml in workflows audit');
assert.strictEqual(ciWorkflow.hasConcurrency, true, 'Expected ci.yml to have concurrency configured');
assert.strictEqual(ciWorkflow.hasCancelInProgress, true, 'Expected ci.yml to have cancel-in-progress enabled');

// Test 2: Optimizer Full Audit
const audit = runOptimizerAudit();
assert.strictEqual(audit.overallGrade, '10/10 (GITHUB_ACTIONS_MINUTES_OPTIMIZED)', 'Expected 10/10 grade');
assert.ok(audit.optimizationSummary.totalWorkflows > 0, 'Expected >0 total workflows');

console.log('ok tests/test-github-actions-minutes-optimizer.js');
