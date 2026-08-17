'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { runQuoroomCollective } = require('../tools/quoroom-quorum-engine');

console.log('=== Testing Quoroom Autonomous Agent Collective & Quorum Engine ===');

// Test 1: Programmatic Evaluation
const result = runQuoroomCollective('Test Objective', 'Test Action');
assert.strictEqual(result.overallStatus, '10/10 (QUORUM VOTING PASSED)');
assert.strictEqual(result.votingResult.decision, 'APPROVED_FOR_EXECUTION');
assert.strictEqual(result.goalDecompositionTree.subgoals.length, 3);

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/quoroom-quorum-engine.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `quoroom-quorum-engine failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.sessionContinuity.autoNudgeActive, true);
assert.strictEqual(data.votingResult.quorumPassed, true);

console.log('✅ Quoroom Agent Collective & Quorum Engine unit test passed.\n');
