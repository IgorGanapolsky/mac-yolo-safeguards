#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  buildSow,
  claimFiles,
  expertTier,
  grade,
  judgeMayScore,
} = require('../tools/swarm-coordination-grade');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

const perfect = {
  github: { openIssues: 0, securityHeld: 0, openPrs: 1, behindOrDirty: 0, requiredRed: false },
  plan: { inProgressRows: 1, sharedDirty: false },
  worktrees: { count: 2, sharedDirty: false },
  vault: { exists: true, snapshotAgeDays: 0, handoff: true },
  linear: { reachable: true, startedCount: 1, limitHit: false, fresh: true },
  gitbutler: { installed: true, targetSet: true, forcePushRequired: false },
  herdr: { serverRunning: true, lanesMatchRepo: 'full', sowFile: true, judgeClaimed: true },
  gemini: { cli: true, notebookWired: true, judgeRun: true },
  judge: { hardcodedTen: false, seatDistinct: true, commandResult: true },
};

check('a missing GitButler target keeps the swarm off A+', () => {
  const report = grade({
    ...perfect,
    gitbutler: { installed: true, targetSet: false },
  });
  const gitbutler = report.surfaces.find((item) => item.id === 'gitbutler');
  assert.equal(gitbutler.score, 3);
  assert.equal(report.aPlus, false);
  assert.equal(report.overall.score <= 3, true);
});

check('a constant 10/10 caps the judge and the overall score', () => {
  const report = grade({ ...perfect, judge: { hardcodedTen: true, seatDistinct: true } });
  const judge = report.surfaces.find((item) => item.id === 'judge');
  assert.equal(judge.score, 2);
  assert.equal(report.overall.score <= 2, true);
  assert.equal(report.aPlus, false);
});

check('ten on every measured surface is the only A+', () => {
  const report = grade(perfect);
  assert.equal(report.surfaces.every((item) => item.score === 10), true);
  assert.equal(report.aPlus, true);
  assert.equal(report.overall.letter, 'A+');
  const partial = grade({ ...perfect, judge: { hardcodedTen: false, seatDistinct: true, commandResult: false } });
  assert.equal(partial.aPlus, false);
});

check('a held security issue is not scored as an empty public board failure', () => {
  const report = grade({ ...perfect, github: { openIssues: 1, securityHeld: 1, openPrs: 1, behindOrDirty: 0 } });
  const issues = report.surfaces.find((item) => item.id === 'githubIssues');
  assert.equal(issues.score, 8);
});

check('the second agent cannot take a claimed file', () => {
  const first = claimFiles({}, 'grok', ['tools/swarm-coordination-grade.js']);
  assert.equal(first.ok, true);
  const second = claimFiles(first.board, 'poolside', ['tools/swarm-coordination-grade.js']);
  assert.equal(second.ok, false);
  assert.equal(second.conflicts[0].owner, 'grok');
});

check('the judge does not edit the worker files', () => {
  const allowed = judgeMayScore(['tools/shared-vault-memory.js'], []);
  assert.equal(allowed.ok, true);
  const blocked = judgeMayScore(['tools/shared-vault-memory.js'], ['tools/shared-vault-memory.js']);
  assert.equal(blocked.ok, false);
});

check('security paths go to the frontier seat and docs stay cheap', () => {
  assert.equal(expertTier('tools/lib/safe-url-host.js'), 'frontier');
  assert.equal(expertTier('.github/workflows/ci.yml'), 'frontier');
  assert.equal(expertTier('tools/revenue-autonomous-loop.js'), 'frontier');
  assert.equal(expertTier('README.md'), 'cheap');
  assert.equal(expertTier('plan.md'), 'cheap');
});

check('one prompt hash is shared by every seat', () => {
  const sow = buildSow('steal their ideas, improve our system');
  assert.equal(sow.samePrompt, true);
  assert.equal(sow.lanes.map((lane) => lane.seat).join(','), 'planner,worker,judge');
  assert.equal(sow.lanes[2].does.includes('Reject a 10'), true);
  assert.equal(sow.id, `SOW-${sow.promptHash}`);
});

console.log(`swarm-coordination-grade: ${passed} checks passed`);
