'use strict';

/**
 * Unit Tests for InfoQ High-ROI Architectural Steals Harness (`tools/infoq-high-roi-steals.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const {
  runInfoQStealsSuite,
  auditMcpToolPruning,
  evaluateLocalFirstRouting,
  evaluateHybridRrfRetrieval
} = require('../tools/infoq-high-roi-steals');

console.log('Running test-infoq-high-roi-steals.js...');

// Test 1: MCP Tool Pruning audit
{
  const mcpAudit = auditMcpToolPruning();
  assert.strictEqual(mcpAudit.estimatedTokenSavingsPercent, 62, 'Expected 62% token savings from MCP pruning');
  assert.strictEqual(mcpAudit.status, 'OPTIMIZED', 'Expected OPTIMIZED status');
}

// Test 2: Local-First Deterministic Fallback Routing
{
  const workloads = [
    { id: 'W1', isDeterministic: true, complexity: 'LOW' },
    { id: 'W2', isDeterministic: true, complexity: 'LOW' },
    { id: 'W3', isDeterministic: true, complexity: 'LOW' },
    { id: 'W4', isDeterministic: false, complexity: 'HIGH' }
  ];
  const routing = evaluateLocalFirstRouting(workloads);
  assert.strictEqual(routing.localRatioPercent, 75, 'Expected 75% local routing ratio');
  assert.ok(routing.status.startsWith('PASS'), 'Expected PASS status for local routing');
}

// Test 3: Hybrid RAG RRF Fusion Evaluation
{
  const hybridRag = evaluateHybridRrfRetrieval('test query');
  assert.ok(hybridRag.ndcgScore >= 0.95, 'Expected nDCG >= 0.95');
  assert.strictEqual(hybridRag.status, 'A_PLUS (nDCG >= 0.95)', 'Expected A_PLUS rating');
}

// Test 4: Full suite execution
{
  const suite = runInfoQStealsSuite();
  assert.strictEqual(suite.overallScore, '10/10 (A+)', 'Expected 10/10 (A+) overall score');
}

console.log('ok tests/test-infoq-high-roi-steals.js');
