'use strict';

/**
 * Unit Tests for CData 8-Dimension Enterprise MCP Reliability Harness (`tools/mcp-enterprise-reliability-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditMcpReliabilityDimensions, runFullMcpReliabilitySuite } = require('../tools/mcp-enterprise-reliability-harness');

console.log('Running test-mcp-enterprise-reliability.js...');

// Test 1: Single Tool Audit (All 8 dimensions)
const singleAudit = auditMcpReliabilityDimensions('mcp_thumbgate', {});
assert.strictEqual(singleAudit.overallGrade, '8/8 (ENTERPRISE_GRADE_PASS)', 'Expected 8/8 grade');
assert.strictEqual(singleAudit.cDataResearchCompliance, '100% PASS', 'Expected 100% PASS');
assert.strictEqual(singleAudit.dimensions.length, 8, 'Expected 8 enterprise dimensions');

// Test 2: Full MCP Suite Audit
const suite = runFullMcpReliabilitySuite();
assert.strictEqual(suite.suiteStatus, 'ALL_MCP_SERVERS_ENTERPRISE_READY', 'Expected ALL_MCP_SERVERS_ENTERPRISE_READY');
assert.strictEqual(suite.totalServersAudited, 5, 'Expected 5 MCP servers audited');

console.log('ok tests/test-mcp-enterprise-reliability.js');
