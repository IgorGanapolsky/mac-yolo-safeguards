'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { runMcpSeoAnalysis } = require('../tools/mcp-seo-data-harness');

console.log('=== Testing MCP SEO & Competitor Data Analysis Harness ===');

// Test 1: Programmatic Evaluation
const result = runMcpSeoAnalysis();
assert.strictEqual(result.overallStatus, '10/10 (MCP DATA PIPELINE ACTIVE)');
assert.strictEqual(result.dataSources.length, 4);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/mcp-seo-data-harness.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `mcp-seo-data-harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.aiSearchVisibilityScore, 94.8);

console.log('✅ MCP SEO & Competitor Data Analysis Harness unit test passed.\n');
