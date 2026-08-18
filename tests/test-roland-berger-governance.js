/**
 * tests/test-roland-berger-governance.js
 *
 * Tests Roland Berger AI-First Organization & ISO 42001 governance engine.
 */

'use strict';

const assert = require('assert');
const { RolandBergerGovernanceEngine } = require('../tools/roland_berger_governance_engine');

console.log('--- Running Roland Berger Governance Engine Tests ---');

const engine = new RolandBergerGovernanceEngine({
  organization: 'Global Automotive OEM',
  complianceStandard: 'ISO/IEC 42001 & AIMS',
  maxSingleActionBudgetUsd: 100.0
});

// Test 1: Zero-Based Workflow Evaluation
console.log('Test 1: Zero-Based Workflow Evaluation');
const wfEvaluation = engine.evaluateZeroBasedWorkflow({
  name: 'Autonomous Supply Chain Code Dispatch',
  steps: [
    { name: 'Fetch telematics', type: 'autonomous_agent', estimatedDurationHours: 0.1 },
    { name: 'Compile model', type: 'automated_gate', estimatedDurationHours: 0.05 },
    { name: 'Deploy canary', type: 'autonomous_agent', estimatedDurationHours: 0.2 }
  ]
});
assert.strictEqual(wfEvaluation.legacyManualSteps, 0);
assert.strictEqual(wfEvaluation.agenticSteps, 3);
assert.strictEqual(wfEvaluation.pilotRiskRating, 'LOW (Production Ready)');
console.log('✓ Zero-based workflow evaluation passed');

// Test 2: Financial Spending Interdiction Gate
console.log('Test 2: Financial Spending Gate');
const expensiveAction = engine.evaluateActionGovernance({
  action: 'provision_gpu_cluster',
  estimatedCostUsd: 500.0
});
assert.strictEqual(expensiveAction.approved, false);
assert.strictEqual(expensiveAction.complianceStatus, 'BLOCKED');
assert.ok(expensiveAction.reason.includes('exceeds pre-authorized ceiling'));
console.log('✓ Financial spend interdiction gate passed');

// Test 3: Data Exfiltration / Secret Exposure Gate
console.log('Test 3: Secret Exfiltration Gate');
const leakyAction = engine.evaluateActionGovernance({
  action: 'send_webhook',
  payloadText: 'user_password=SuperSecretEnterpriseCredential123'
});
assert.strictEqual(leakyAction.approved, false);
assert.strictEqual(leakyAction.complianceStatus, 'BLOCKED');
assert.ok(leakyAction.reason.includes('ISO 42001 Privacy Violation'));
console.log('✓ Secret exfiltration gate passed');

// Test 4: Safe Action Cleared
console.log('Test 4: Safe Action Cleared');
const safeAction = engine.evaluateActionGovernance({
  action: 'git_commit_and_push',
  estimatedCostUsd: 0.00,
  payloadText: 'fix(billing): update invoice total'
});
assert.strictEqual(safeAction.approved, true);
assert.strictEqual(safeAction.complianceStatus, 'PASSED');
assert.ok(safeAction.provenanceHash.startsWith('sha256-'));
console.log('✓ Safe action provenance hashing passed');

// Test 5: Enterprise Consulting Readiness Scorecard
console.log('Test 5: Enterprise Readiness Scorecard');
const scorecard = engine.generateReadinessScorecard({
  zeroBasedScore: 90,
  governanceScore: 100,
  augmentationScore: 85,
  dataStrategyScore: 95
});
assert.strictEqual(scorecard.readinessLevel, 'AI-First Leader');
assert.strictEqual(scorecard.overallScore, '93/100');
console.log('✓ Readiness scorecard generation passed');

console.log('\nAll 5/5 Roland Berger Governance Engine tests passed successfully! 🎉');
