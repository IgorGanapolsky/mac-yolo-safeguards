'use strict';

const assert = require('assert');
const {
  TokenBudgetManager,
  ConfidenceEvaluator,
  MicrosoftCopilotAgentHarness,
} = require('../tools/github-copilot-framework-harness');

console.log('=== Testing Microsoft GitHub Copilot Agent Framework Harness ===');

const shortPayload = TokenBudgetManager.truncatePayload('Hello world prompt', 100);
assert.strictEqual(shortPayload.truncated, false);

const longText = 'x'.repeat(20000);
const truncatedPayload = TokenBudgetManager.truncatePayload(longText, 1000);
assert.strictEqual(truncatedPayload.truncated, true);
assert.strictEqual(truncatedPayload.tokenCount, 1000);
console.log('  ✓ Token Budget Manager dynamically truncated payload to 1,000 token ceiling.');

const highConf = ConfidenceEvaluator.evaluateAction(0.95);
assert.strictEqual(highConf.approved, true);

const lowConf = ConfidenceEvaluator.evaluateAction(0.6);
assert.strictEqual(lowConf.approved, false);
console.log('  ✓ Confidence Evaluator approved 0.95 score and blocked 0.6 score.');

const harness = new MicrosoftCopilotAgentHarness('test-copilot-agent');
const workflowResult = harness.runProductionWorkflow('Build and verify production agent pipeline', 0.92);

assert.strictEqual(workflowResult.success, true);
assert.strictEqual(workflowResult.state, 'COMPLETED');
assert.strictEqual(harness.history.length, 4);
console.log('  ✓ Agent State Machine executed full lifecycle (IDLE -> PLANNING -> EXECUTING -> VERIFYING -> COMPLETED).');

console.log('✅ Microsoft GitHub Copilot Agent Framework Harness Unit Tests PASSED!');
