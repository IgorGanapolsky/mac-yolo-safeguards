#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { MicroAutonomyEvalEngine } = require('../tools/micro-autonomy-eval-engine');

console.log('=== Testing Micro-Autonomy Eval Engine & Acceptance Verifier ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-engine-test-'));
const engine = new MicroAutonomyEvalEngine({ receiptDir: tmpDir });

// 1. Test Spec Creation
const spec = engine.createDefaultSpec('test-spec-suite');
assert.strictEqual(spec.name, 'test-spec-suite');
assert.strictEqual(spec.requireZeroCodeQLFindings, true);
console.log('✓ Default spec creation test passed');

// 2. Test Execution & Receipt Generation
const receipt = engine.evaluateExecution(spec, 'test-agent', { costUsd: 0.0, tokensUsed: 500 });
assert.strictEqual(typeof receipt.verifierPassed, 'boolean');
assert.strictEqual(receipt.agentIdentity, 'test-agent');
assert.strictEqual(fs.existsSync(path.join(tmpDir, 'latest.json')), true);
console.log('✓ Execution evaluation & receipt generation test passed');

// 3. Test Report Generation
const report = engine.generateReport();
assert.strictEqual(report.totalRuns, 1);
assert.strictEqual(typeof report.passRatePct, 'string');
console.log('✓ Metric report generation test passed');

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('✅ Micro-Autonomy Eval Engine Unit Tests PASSED!');
