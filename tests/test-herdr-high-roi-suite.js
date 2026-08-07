'use strict';

/**
 * Unit Tests for Herdr High-ROI Integrations Engine (`tools/herdr-high-roi-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const {
  checkHerdrCliStatus,
  provisionHerdrWorktree,
  formatHerdrNotification,
  generateObsidianSnapshot,
  runHerdrHighRoiDiagnostic
} = require('../tools/herdr-high-roi-engine');

console.log('Running test-herdr-high-roi-suite.js...');

// Test 1: CLI Binary Status Check
{
  const status = checkHerdrCliStatus();
  assert.strictEqual(typeof status.installed, 'boolean', 'Expected installed flag to be a boolean');
  if (process.platform !== 'darwin') {
    console.log('  [SKIP] Herdr CLI binary presence check requires macOS runner (binary is Mac-local)');
  } else {
    assert.strictEqual(status.installed, true, 'Expected Herdr CLI binary to be installed on Mac');
  }
}

// Test 2: Worktree Provisioning
{
  const wt = provisionHerdrWorktree('test-agent-pane');
  assert.strictEqual(wt.provisioned, true, 'Expected worktree to be provisioned');
  assert.ok(wt.branchName.startsWith('herdr/test-agent-pane-'), 'Expected correct branch name prefix');
}

// Test 3: Notification Formatting for Blocked & Done States
{
  const notif = formatHerdrNotification('hermes-bot', 'blocked', 'Waiting for approval');
  assert.ok(notif.title.includes('HERDR_BLOCKED'), 'Expected HERDR_BLOCKED prefix in title');
  assert.strictEqual(notif.state, 'blocked', 'Expected state === blocked');
}

// Test 4: Obsidian Vault Snapshot Generation
{
  const obs = generateObsidianSnapshot('worker-1', 'Task summary', 'abc1234', 500);
  assert.strictEqual(obs.readyForVault, true, 'Expected readyForVault === true');
  assert.ok(obs.markdownContent.includes('VERIFIED_DONE'), 'Expected VERIFIED_DONE in markdown');
}

// Test 5: Full Audit Diagnostic
{
  const diag = runHerdrHighRoiDiagnostic();
  assert.strictEqual(diag.overallRating, '10/10 (HERDR_HIGH_ROI_A_PLUS)', 'Expected Grade A+ rating');
}

console.log('ok tests/test-herdr-high-roi-suite.js');
