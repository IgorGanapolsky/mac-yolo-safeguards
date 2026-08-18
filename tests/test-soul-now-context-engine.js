#!/usr/bin/env node
'use strict';

/**
 * test-soul-now-context-engine.js
 * -------------------------------
 * Verifies Vellum-style SOUL.md, NOW.md, actor security, and memory TTL specs:
 *   - SOUL.md persona persistence
 *   - NOW.md active working scratchpad generation (<300 token budget)
 *   - Actor resolution (guardian vs trusted vs unknown deny-by-default)
 *   - 8-Tier memory TTL specs
 *   - Doctor check
 */

const assert = require('assert');
const fs = require('fs');
const {
  SOUL_FILE,
  NOW_FILE,
  ACTOR_ROLES,
  MEMORY_SPECS,
  ensureIdentityFiles,
  compileNow,
  resolveActor,
  runDoctor,
} = require('../tools/soul-now-context-engine');

console.log('🧪 Running SOUL.md & NOW.md Context Engine Test Suite...');

// 1. SOUL.md & NOW.md File Creation & Compilation
{
  ensureIdentityFiles();
  assert.ok(fs.existsSync(SOUL_FILE), 'SOUL.md must exist');
  const soulContent = fs.readFileSync(SOUL_FILE, 'utf8');
  assert.ok(soulContent.length > 50, 'SOUL.md must contain non-empty charter');
  assert.ok(soulContent.includes('Autonomy') || soulContent.includes('SOUL.md'), 'SOUL.md must contain autonomy directives');

  const nowContent = compileNow();
  assert.ok(fs.existsSync(NOW_FILE), 'NOW.md must exist after compile');
  assert.ok(nowContent.includes('NOW.md'), 'NOW.md must have header');
  assert.ok(nowContent.includes('Current Focus'), 'NOW.md must contain active focus');

  // Verify NOW.md is compact (< 1500 chars / ~350 tokens)
  assert.ok(nowContent.length < 1500, `NOW.md must be compact (<1500 chars), got ${nowContent.length}`);
  console.log('  ✓ SOUL.md & NOW.md scratchpad generation passes');
}

// 2. Actor Resolution & Deny-by-Default Security
{
  // Guardian (Igor)
  const guardianActor = resolveActor('guardian-local-session', 'iganapolsky@gmail.com');
  assert.strictEqual(guardianActor.role, ACTOR_ROLES.GUARDIAN);
  assert.strictEqual(guardianActor.allowedToolExecution, true);
  assert.strictEqual(guardianActor.allowedSpendMutation, true);

  // Trusted sub-agent
  const trustedActor = resolveActor('trusted-agent-codex-1', null);
  assert.strictEqual(trustedActor.role, ACTOR_ROLES.TRUSTED);
  assert.strictEqual(trustedActor.allowedToolExecution, true);
  assert.strictEqual(trustedActor.allowedSpendMutation, false, 'Sub-agents cannot mutate spend budget without guardian');

  // Unknown external actor
  const unknownActor = resolveActor('untrusted-webhook-token', 'stranger@example.com');
  assert.strictEqual(unknownActor.role, ACTOR_ROLES.UNKNOWN);
  assert.strictEqual(unknownActor.allowedToolExecution, false, 'Unknown actors must be denied tool execution');
  assert.strictEqual(unknownActor.allowedMemoryRead, false, 'Unknown actors must be denied memory read');
  console.log('  ✓ Actor resolution & fail-closed security passes');
}

// 3. 8-Tier Memory Model Specs
{
  const tiers = Object.keys(MEMORY_SPECS);
  assert.strictEqual(tiers.length, 8, 'Must define exactly 8 memory tiers');
  assert.ok(MEMORY_SPECS.episodic.ttlMs > 0);
  assert.ok(MEMORY_SPECS.semantic.ttlMs === Infinity);
  assert.ok(MEMORY_SPECS.procedural.ttlMs === Infinity);
  assert.ok(MEMORY_SPECS.prospective.ttlMs > 0);
  console.log('  ✓ 8-Tier memory TTL staleness specs pass');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.soulPresent, true);
  assert.strictEqual(doc.nowPresent, true);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All SOUL.md & NOW.md Context Engine tests passed successfully!');
process.exit(0);
