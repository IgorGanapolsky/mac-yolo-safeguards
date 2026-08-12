'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { runInspectableAgentLoop, validateToolArguments } = require('../tools/inspectable-tool-calling-agent');

console.log('=== Testing Inspectable Tool-Calling Agent & Debugging Harness ===');

// Test 1: Programmatic Clean Execution
const cleanRun = runInspectableAgentLoop('Calculate leak score for Apex Heating with 4 missed calls per week');
assert.strictEqual(cleanRun.modelRequestStatus, 'SUCCESS');
assert.strictEqual(cleanRun.toolExecutionStatus, 'SUCCESS');
assert.strictEqual(cleanRun.compactToolResult.monthlyRevenueLeakUSD, 7200);

// Test 2: Model Request Failure Interception
const modelErrRun = runInspectableAgentLoop('Test model failure', true, false);
assert.strictEqual(modelErrRun.modelRequestStatus, 'MODEL_REQUEST_FAILED');
assert.strictEqual(modelErrRun.errorPathCaptured.stage, 'MODEL_API_REQUEST');

// Test 3: Pre-Execution Schema Validation Interception
const schemaErrRun = runInspectableAgentLoop('Test schema failure', false, true);
assert.strictEqual(schemaErrRun.toolExecutionStatus, 'SCHEMA_VALIDATION_FAILED');
assert.strictEqual(schemaErrRun.errorPathCaptured.stage, 'TOOL_SCHEMA_VALIDATION');

// Test 4: CLI JSON Mode
const run = spawnSync('node', ['tools/inspectable-tool-calling-agent.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `inspectable-tool-calling-agent failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.successRun.toolExecutionStatus, 'SUCCESS');

console.log('✅ Inspectable Tool-Calling Agent unit test passed.\n');
