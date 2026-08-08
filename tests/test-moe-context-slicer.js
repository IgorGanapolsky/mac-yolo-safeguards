'use strict';

/**
 * Unit Tests for MoE Context Slicer Engine (`tools/moe-context-slicer-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { sliceContextForRole, MOE_ROLE_CONTEXT_MAP } = require('../tools/moe-context-slicer-engine');

console.log('Running test-moe-context-slicer.js...');

// Test Planner Slicing
const plannerSlice = sliceContextForRole('Planner', {
  architecture: 'FastAPI + Redis',
  roadmap: 'Q3 Release',
  requirements: 'Auth + Rate limit',
  fullDiff: '+ const x = 1;',
});
assert.strictEqual(plannerSlice.status, 'MOE_ROLE_CONTEXT_SLICED', 'Expected SLICED status');
assert.strictEqual(plannerSlice.grade, '10/10 (MOE_CONTEXT_SLICING_ACTIVE)', 'Expected 10/10 grade');

// Test Builder Slicing
const builderSlice = sliceContextForRole('Builder');
assert.strictEqual(builderSlice.requiredContextBoundaries.length, 2, 'Expected 2 required builder boundaries');

// Test Judge Slicing
const judgeSlice = sliceContextForRole('Judge');
assert.strictEqual(judgeSlice.tokenBudgetCap, 1500, 'Expected 1500 token budget for Judge');

console.log('ok tests/test-moe-context-slicer.js');
