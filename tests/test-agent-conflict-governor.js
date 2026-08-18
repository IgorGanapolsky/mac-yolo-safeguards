#!/usr/bin/env node
/**
 * Test Suite for Agent Conflict Governor & De-Escalation Engine
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { auditAgentActionSafety, detectGoalConflict } = require('../tools/agent_conflict_governor.js');

test('auditAgentActionSafety intercepts peer process kill attempts', () => {
  const result = auditAgentActionSafety('pkill -f claude-agent');
  assert.equal(result.allowed, false);
  assert.equal(result.ruleId, 'peer_process_kill');
  assert.match(result.reason, /Hostile multi-agent action/);
});

test('auditAgentActionSafety allows normal non-destructive developer commands', () => {
  const result = auditAgentActionSafety('npm test && git status');
  assert.equal(result.allowed, true);
});

test('detectGoalConflict detects overlapping target file claims across agents', () => {
  const taskA = {
    agentId: 'agent-alpha',
    objective: 'Migrate backend to TypeScript',
    targetFiles: ['backend/server.py', 'config/app.json']
  };

  const taskB = {
    agentId: 'agent-beta',
    objective: 'Migrate backend to Rust',
    targetFiles: ['backend/server.py', 'Cargo.toml']
  };

  const conflict = detectGoalConflict(taskA, taskB);
  assert.equal(conflict.hasConflict, true);
  assert.deepEqual(conflict.conflictingFiles, ['backend/server.py']);
  assert.equal(conflict.resolutionStrategy, 'isolate_worktrees');
});
