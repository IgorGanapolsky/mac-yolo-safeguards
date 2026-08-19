'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
  auditFleetHygiene,
  cleanStaleLockfiles,
  runGeometricCompaction,
  getRepoWorktrees,
} = require('../tools/git-at-scale-hygiene');

test('git-at-scale-hygiene audits current repository cleanly', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const result = auditFleetHygiene(repoRoot, { compact: false });
  assert.ok(result.branchCount >= 1, 'Should find at least 1 branch');
  assert.ok(result.worktreeCount >= 1, 'Should find at least 1 worktree (root)');
  assert.ok(Array.isArray(result.worktrees), 'Worktrees should be an array');
  assert.ok(Array.isArray(result.staleLocksRemoved), 'staleLocksRemoved should be an array');
});

test('git-at-scale-hygiene performs dry-run geometric compaction', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const result = auditFleetHygiene(repoRoot, { compact: true, dryRun: true });
  assert.ok(result.compaction, 'Compaction info should be present');
  assert.equal(result.compaction.mode, 'dry-run');
  assert.equal(result.compaction.compacted, true);
});

test('cleanStaleLockfiles safely handles non-existent or clean repos', () => {
  const nonExistent = path.join(__dirname, 'non-existent-dir-12345');
  const res = cleanStaleLockfiles(nonExistent);
  assert.deepEqual(res.removed, []);
});
