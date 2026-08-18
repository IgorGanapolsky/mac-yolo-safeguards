'use strict';

const assert = require('assert');
const { AntiBabysittingEngine } = require('../tools/autonomous-anti-babysitting-loop');

console.log('=== Running Autonomous Anti-Babysitting Engine Tests ===');

const engine = new AntiBabysittingEngine();

// Test 1: Catch babysitting markers
const badText1 = "Everything is tested. Let me know if I should merge this PR.";
const audit1 = engine.auditTextForBabysitting(badText1);
assert.equal(audit1.clean, false);
assert.equal(audit1.violations.length, 2); // "let me know" and "should I"
console.log('✔ Test 1: Successfully caught babysitting violations in text');

// Test 2: Clean autonomous statement passes
const cleanText = "All 253 unit tests and 63 control plane suites passed. Merging PR #1800 and releasing worktree.";
const audit2 = engine.auditTextForBabysitting(cleanText);
assert.equal(audit2.clean, true);
assert.equal(audit2.violations.length, 0);
console.log('✔ Test 2: Clean autonomous text passes with zero violations');

// Test 3: Plan autonomous actions
const context = {
  hasUnmergedCleanPrs: true,
  hasUntrackedFeatures: true,
  hasStaleWorktrees: true
};
const actions = engine.planAutonomousActions(context);
assert.equal(actions.length, 3);
assert.equal(actions[0].id, 'ACTION_ARM_AUTO_MERGE');
assert.equal(actions[1].id, 'ACTION_SYNC_TIELINE_CONTRACTS');
assert.equal(actions[2].id, 'ACTION_PRUNE_MERGED_WORKTREES');
console.log('✔ Test 3: Autonomous action planner generates actionable execution queue');

// Test 4: Health audit executes cleanly
const health = engine.runHealthAudit();
assert.equal(health.contractsValid, true);
console.log('✔ Test 4: Autonomous health audit verified contract integrity');

console.log('\nAll Autonomous Anti-Babysitting Engine tests passed cleanly!');
