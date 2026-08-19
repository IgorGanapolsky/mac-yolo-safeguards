'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyPrs,
  generateTriagePlan,
} = require('../tools/pr-hygiene-engine.js');

test('classifyPrs accurately categorizes PRs by status, branch, and author', () => {
  const mockPrs = [
    {
      number: 101,
      title: 'feat(core): clean feature',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      headRefName: 'feat/clean',
      author: { login: 'developer' },
    },
    {
      number: 102,
      title: 'feat(old): conflicting branch',
      isDraft: false,
      mergeable: 'CONFLICTING',
      mergeStateStatus: 'DIRTY',
      headRefName: 'feat/old',
      author: { login: 'developer' },
    },
    {
      number: 103,
      title: 'content: 2026-08-19 morning run',
      isDraft: true,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      headRefName: 'content/daily',
      author: { login: 'bot' },
    },
    {
      number: 104,
      title: 'chore(deps): bump lodash',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      headRefName: 'dependabot/npm/lodash',
      author: { login: 'app/dependabot' },
    },
  ];

  const classified = classifyPrs(mockPrs);
  assert.equal(classified.total, 4);
  assert.equal(classified.mergeable.length, 1);
  assert.equal(classified.mergeable[0].number, 101);
  assert.equal(classified.conflicting.length, 1);
  assert.equal(classified.conflicting[0].number, 102);
  assert.equal(classified.draftLogs.length, 1);
  assert.equal(classified.draftLogs[0].number, 103);
  assert.equal(classified.dependabot.length, 1);
  assert.equal(classified.dependabot[0].number, 104);

  const plan = generateTriagePlan(classified);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].phase, '1_AUTO_MERGE_GREEN');
  assert.equal(plan[1].phase, '2_RETIRE_SUPERSEDED_DRAFTS');
  assert.equal(plan[2].phase, '3_SEQUENTIAL_REBASE');
});
