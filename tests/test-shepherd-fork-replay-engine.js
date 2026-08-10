'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ShepherdForkReplayEngine } = require('../tools/shepherd-fork-replay-engine');

console.log('=== Testing Shepherd Fork-Replay Substrate Engine (arXiv:2605.10913) ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-test-'));
try {
  const engine = new ShepherdForkReplayEngine({ traceDir: tmpDir });

  // 1. Create Commit
  const commit = engine.createCommit('run-test', 3, {
    events: [{ type: 'run_command', cmd: 'npm test' }],
    promptPrefixHash: 'test-hash-123',
  });
  assert(commit.commitHash);
  assert.strictEqual(commit.stepIndex, 3);

  // 2. Fork from Commit
  const fork = engine.forkFromCommit('run-test', commit.commitHash);
  assert(fork.forkedRunId.includes('run-test_fork_'));
  assert(fork.promptCacheReuseRate >= 0.95);
  assert.strictEqual(fork.forkSpeedupRatio, 5.0);

  console.log('✅ Shepherd Fork-Replay Substrate Engine Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
