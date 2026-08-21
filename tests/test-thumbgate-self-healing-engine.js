'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { ResilientFileSystem, SelfHealingSupervisor, resolveResilientPath } = require('../tools/thumbgate-self-healing-engine');

async function runTests() {
  console.log('=== Running ThumbGate Self-Healing, Self-Improving & Self-Learning Tests ===\n');

  const rfs = new ResilientFileSystem();
  const supervisor = new SelfHealingSupervisor();

  // 1. Resilient File System Write & Read (Tier 1 Primary & Fallback)
  const normalPath = path.join('/tmp', 'thumbgate-test-normal.json');
  const writeRes1 = rfs.writeFile(normalPath, { status: 'healthy', score: 100 });
  assert.strictEqual(writeRes1.ok, true);
  assert.strictEqual(writeRes1.tier, 'primary');

  const readRes1 = rfs.readFile(normalPath);
  assert.strictEqual(readRes1.ok, true);
  assert.ok(readRes1.data.includes('healthy'));
  console.log('PASS [1/6]: Primary File System Write & Read');

  // 2. Permission Denied / Read-Only Fallback to Memory Tier
  const forbiddenPath = '/root/forbidden-thumbgate-secret.json';
  const writeRes2 = rfs.writeFile(forbiddenPath, { secretToken: '12345' });
  assert.strictEqual(writeRes2.ok, true, 'Zero crash on unwritable path');
  assert.ok(['tmp_fallback', 'in_memory', 'user_cache'].includes(writeRes2.tier));

  const readRes2 = rfs.readFile(forbiddenPath);
  assert.strictEqual(readRes2.ok, true);
  assert.ok(readRes2.data.includes('12345'));
  console.log('PASS [2/6]: Resilient Multi-Tier Storage Failover on Permission Errors');

  // 3. Unicode Whitespace & Escaped Path Normalization (macOS screenshot fix)
  const mockEscaped = '/tmp/Screenshot\\ 2026-08-21\\ at\\ 11.45.19\\ AM.png';
  fs.writeFileSync('/tmp/Screenshot 2026-08-21 at 11.45.19\u202fAM.png', 'fake_png_data');
  const pathRes = resolveResilientPath(mockEscaped);
  assert.strictEqual(pathRes.ok, true);
  assert.ok(pathRes.resolvedPath.includes('Screenshot'));
  console.log('PASS [3/6]: Unicode Narrow No-Break Space & Escaped Path Resolution');

  // 4. Self-Healing Task Execution with Retry
  let attemptsMade = 0;
  const healingTask = await supervisor.executeWithSelfHealing('flaky_api_call', (attempt) => {
    attemptsMade = attempt;
    if (attempt < 2) {
      throw new Error('429 rate limit exceeded');
    }
    return { data: 'recovered_successfully' };
  });

  assert.strictEqual(healingTask.ok, true);
  assert.strictEqual(healingTask.healed, true);
  assert.strictEqual(attemptsMade, 2);
  console.log('PASS [4/6]: Closed-Loop Automatic Task Self-Healing & Retry');

  // 5. Graceful Degradation & Fallback
  const failingTaskWithFallback = await supervisor.executeWithSelfHealing(
    'unreachable_service',
    () => {
      throw new Error('EPERM operation not permitted on requested resource');
    },
    {
      maxRetries: 2,
      fallbackFn: (err) => ({ degraded: true, safeDefault: 'cached_view', err: err.message }),
    }
  );

  assert.strictEqual(failingTaskWithFallback.ok, true);
  assert.strictEqual(failingTaskWithFallback.fallbackUsed, true);
  assert.strictEqual(failingTaskWithFallback.result.degraded, true);
  console.log('PASS [5/6]: Graceful Fallback on Exhausted Retries');

  // 6. Self-Improving & Self-Learning Invariant Synthesis
  const knowledge = supervisor.getKnowledgeReport();
  assert.ok(knowledge.healedIncidents >= 2);
  assert.ok(knowledge.activePreventionRules.length >= 2);
  console.log('PASS [6/6]: Self-Improving Invariant Synthesis & Memory Learning');

  console.log('\n=== All 6 Self-Healing Engine Tests Passed (100% Green) ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
