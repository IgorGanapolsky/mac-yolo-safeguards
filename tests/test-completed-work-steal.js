#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/completed-work-steal.js
 *
 * Covers the pure logic: plan.md parsing, cross-referencing, report generation.
 * The plan.md parser is tested against a fixture string (not a live file) so
 * the contract is deterministic and doesn't depend on the real plan.md shifting.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// We need to require the tool — but require() runs module.exports, not main().
// The tool guards main() with require.main === module, so requiring it is safe.
const {
  parsePlan,
  crossReference,
  generateReport,
  extractSeverity,
  summarize,
} = require('../tools/completed-work-steal');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

// ─── 1. plan.md parsing ─────────────────────────────────────────────

// Build a fixture plan.md with a known Task Board section
const fixturePlan = `# Some intro

## 1. Task Board

| T-STEAL-TEST-1 | Test task with PR | in_progress | agent-1 | \`tools/foo.js\` | GitHub #9999 / PR #9999 / open |
| T-STEAL-TEST-2 | Completed task | released | agent-2 | \`tools/bar.js\` | GitHub #9998 / merged PR #9998 as \`abc123\` |
| T-STEAL-TEST-3 | Blocked task | blocked | agent-3 | \`tools/baz.js\` | GitHub #9997 / PR #9997 |
| T-STEAL-TEST-4 | No PR yet | in_progress | agent-1 | \`tools/qux.js\` | no github |

## 2. File Ownership Map

stuff...
`;

const fixturePath = path.join('/tmp', 'fixture-plan-test.md');
fs.writeFileSync(fixturePath, fixturePlan);

{
  const { tasks, error } = parsePlan(fixturePath);
  assert.equal(error, null, 'should parse without error');
  assert.equal(tasks.length, 4, 'should find all 4 tasks');

  const t1 = tasks.find((t) => t.id === 'T-STEAL-TEST-1');
  assert.equal(t1.status, 'in_progress');
  assert.equal(t1.prNumber, 9999);
  assert.equal(t1.isReleased, false);

  const t2 = tasks.find((t) => t.id === 'T-STEAL-TEST-2');
  assert.equal(t2.status, 'released');
  assert.equal(t2.isReleased, true);

  const t3 = tasks.find((t) => t.id === 'T-STEAL-TEST-3');
  assert.equal(t3.status, 'blocked');
  assert.equal(t3.isBlocked, true);

  const t4 = tasks.find((t) => t.id === 'T-STEAL-TEST-4');
  assert.equal(t4.prNumber, null, 'task without PR # should have null');
  assert.equal(t4.isReleased, false);

  ok('parsePlan correctly parses task rows, extracts PR numbers, and detects released/blocked');
}

fs.unlinkSync(fixturePath);

// ─── 2. crossReference ───────────────────────────────────────────────

{
  const tasks = parsePlan; // reuse — but we need task objects, not the function
  // Build synthetic task objects matching plan.md parse output
  const syntheticTasks = [
    { id: 'T-A', title: 'task with blocked PR', status: 'in_progress', agent: 'a', files: 'f', evidence: 'PR #1001', prNumber: 1001, isReleased: false },
    { id: 'T-B', title: 'task with CI failure', status: 'in_progress', agent: 'a', files: 'f', evidence: 'PR #1002', prNumber: 1002, isReleased: false },
    { id: 'T-C', title: 'released task', status: 'released', agent: 'a', files: 'f', evidence: 'merged', prNumber: 1003, isReleased: true },
    { id: 'T-D', title: 'no PR', status: 'in_progress', agent: 'a', files: 'f', evidence: 'no github', prNumber: null, isReleased: false },
  ];

  const prs = [
    { number: 1001, title: 'fix thread', mergeable: true, mergeStateStatus: 'CLEAN', checkState: 'SUCCESS', failedChecks: [], pendingChecks: [] },
    { number: 1002, title: 'fix ci', mergeable: true, mergeStateStatus: 'CLEAN', checkState: 'FAILURE', failedChecks: ['verify'], pendingChecks: [] },
  ];

  const threads = new Map([
    [1001, { count: 2, threads: [{ path: 'x.ts', author: 'reviewer', severity: 'P1', summary: 'fix this' }, { path: 'y.ts', author: 'reviewer', severity: 'P2', summary: 'also fix' }] }],
  ]);

  const synthesis = crossReference(syntheticTasks, prs, threads);

  assert.equal(synthesis.length, 3, 'released tasks should be filtered out');

  const taskA = synthesis.find((s) => s.task === 'T-A');
  assert.equal(taskA.blockers.length, 1, 'T-A should have 1 blocker (review threads)');
  assert.equal(taskA.unresolvedThreads, 2);
  assert.equal(taskA.blockerType, 'review');

  const taskB = synthesis.find((s) => s.task === 'T-B');
  assert.equal(taskB.blockers.length, 1, 'T-B should have 1 blocker (CI)');
  assert.equal(taskB.blockerType, 'ci');

  const taskD = synthesis.find((s) => s.task === 'T-D');
  assert.equal(taskD.blockers.length, 1, 'T-D should have 1 blocker (no PR)');
  assert.equal(taskD.blockerType, 'noPr');

  ok('crossReference correctly maps PRs, threads, and CI failures to blockers');
}

// ─── 3. generateReport ──────────────────────────────────────────────

{
  const synthesis = [
    { task: 'T-A', title: 'ci fail', status: 'in_progress', prNumber: 1002, checkState: 'FAILURE', mergeStateStatus: 'CLEAN', mergeable: true, unresolvedThreads: 0, blockers: ['CI failing: verify'], blockerType: 'ci' },
    { task: 'T-B', title: 'review blocked', status: 'in_progress', prNumber: 1001, checkState: 'SUCCESS', mergeStateStatus: 'CLEAN', mergeable: true, unresolvedThreads: 2, blockers: ['Unresolved review threads: 2 (P1, P2)'], blockerType: 'review' },
    { task: 'T-C', title: 'no PR', status: 'in_progress', prNumber: null, checkState: null, mergeStateStatus: null, mergeable: null, unresolvedThreads: 0, blockers: ['No associated GitHub PR found — task is in_progress without a PR'], blockerType: 'noPr' },
    { task: 'T-D', title: 'unblocked', status: 'in_progress', prNumber: 1003, checkState: 'SUCCESS', mergeStateStatus: 'CLEAN', mergeable: true, unresolvedThreads: 0, blockers: [], blockerType: 'unblocked' },
  ];

  const report = generateReport(synthesis);

  assert.equal(report.summary.totalTasks, 4);
  assert.equal(report.summary.inProgress, 4);
  assert.equal(report.summary.blocked, 3);
  assert.equal(report.summary.unblockedInProgress, 1);
  assert.equal(report.summary.blockerBreakdown.ci, 1);
  assert.equal(report.summary.blockerBreakdown.review, 1);
  assert.equal(report.summary.blockerBreakdown.merge, 0);
  assert.equal(report.summary.blockerBreakdown.noPr, 1);

  ok('generateReport correctly summarizes blocker types and counts');
}

// ─── 4. summarize + extractSeverity ─────────────────────────────────

{
  const badge = '**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange)</sub></sub>  Remove the inactive workaround**  Details follow.';
  assert.equal(extractSeverity(badge), 'P1');
  assert.equal(extractSeverity('no badge here'), 'none');
  assert.equal(summarize(badge).length > 0, true);
  assert.equal(summarize(badge).includes('P1 Badge'), false, 'should strip markdown images');
  ok('summarize and extractSeverity work correctly');
}

// ─── 5. Plan.md parsing handles the "blocked" status in real plan.md style ──

{
  const fixture2 = `# Title

## 1. Task Board

| T-REAL-1 | Fix the verify check | in_progress | poolside | \`tools/security.js\` | PR #2206 open, CI pending: verify |
| T-REAL-2 | Steal GitHub ideas | in_progress | poolside | \`docs/steal.md\` | No PR yet |
`;
  const p = path.join('/tmp', 'fixture-plan-test2.md');
  fs.writeFileSync(p, fixture2);

  const { tasks } = parsePlan(p);
  assert.equal(tasks.length, 2);

  const t1 = tasks[0];
  assert.equal(t1.prNumber, 2206);
  assert.equal(t1.status, 'in_progress');

  const t2 = tasks[1];
  assert.equal(t2.prNumber, null);

  fs.unlinkSync(p);
  ok('parsePlan handles real-world plan.md task rows');
}

console.log(`\n${passed}/${passed} tests passed`);
process.exit(0);
