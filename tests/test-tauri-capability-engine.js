#!/usr/bin/env node
'use strict';

/**
 * test-tauri-capability-engine.js
 * -------------------------------
 * Verifies Tauri 2.0 Capability-Based Security & IPC Isolation Engine:
 *   - Permission evaluation (granted vs ungranted)
 *   - Allow/deny path glob boundary enforcement
 *   - Banned command signature detection
 *   - Doctor check
 */

const assert = require('assert');
const {
  evaluateCapability,
  matchGlob,
  runDoctor,
} = require('../tools/tauri-capability-engine');

console.log('🧪 Running Tauri Capability Engine Test Suite...');

// 1. Glob Matcher Verification
{
  assert.strictEqual(matchGlob('tools/test.js', 'tools/**'), true);
  assert.strictEqual(matchGlob('business_os/secrets.json', 'business_os/**'), true);
  assert.strictEqual(matchGlob('src/index.js', 'tools/**'), false);
  console.log('  ✓ Glob matcher passes');
}

// 2. Permission Evaluation
{
  const allowedAction = { action: 'fs:write', path: 'tools/new-engine.js' };
  const resAllowed = evaluateCapability(allowedAction);
  assert.strictEqual(resAllowed.allowed, true);
  assert.strictEqual(resAllowed.checks.permission, true);

  const ungrantedAction = { action: 'kernel:reflash', path: 'tools/new-engine.js' };
  const resUngranted = evaluateCapability(ungrantedAction);
  assert.strictEqual(resUngranted.allowed, false);
  assert.ok(resUngranted.reason.includes('not granted'));
  console.log('  ✓ Permission grant & denial evaluation passes');
}

// 3. Path Security Boundary & Denylist Enforcement
{
  const deniedPathAction = { action: 'fs:write', path: 'business_os/customer_ledger.json' };
  const resDenied = evaluateCapability(deniedPathAction);
  assert.strictEqual(resDenied.allowed, false);
  assert.strictEqual(resDenied.checks.pathDenied, true);
  assert.ok(resDenied.reason.includes('DENIED'));

  const outsideScopeAction = { action: 'fs:write', path: '/etc/passwd' };
  const resOutside = evaluateCapability(outsideScopeAction);
  assert.strictEqual(resOutside.allowed, false);
  assert.strictEqual(resOutside.checks.pathAllowed, false);
  console.log('  ✓ Denylist & boundary enforcement passes');
}

// 4. Banned Command Signatures
{
  const dangerousCmd = { action: 'shell:execute', command: 'rm -rf /' };
  const resCmd = evaluateCapability(dangerousCmd);
  assert.strictEqual(resCmd.allowed, false);
  assert.strictEqual(resCmd.checks.commandSafe, false);
  console.log('  ✓ Banned command detection passes');
}

// 5. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.totalPermissions > 0);
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All Tauri Capability Engine tests passed successfully!');
process.exit(0);
