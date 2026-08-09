#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  POLICY_START,
  collectContributors,
  durationBucket,
  formatDuration,
  createCloseoutPlan,
  loadPullRequest,
  auditIssues,
  parseArgs,
  findExistingCloseoutComment,
  closeoutCommentAction,
} = require('../tools/linear-closeout-telemetry');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function issue(overrides = {}) {
  return {
    id: 'issue-1',
    identifier: 'AGENT-99',
    title: 'Example',
    url: 'https://linear.app/example/AGENT-99',
    createdAt: '2026-08-09T10:00:00.000Z',
    startedAt: '2026-08-09T10:05:00.000Z',
    completedAt: null,
    team: { id: 'team-1', key: 'AGENT' },
    labels: {
      nodes: [
        { id: 'lock', name: 'agent-lock' },
        { id: 'codex', name: 'agent-codex' },
        { id: 'bug', name: 'Bug' },
        { id: 'old-cycle', name: 'cycle-over-3d' },
        { id: 'old-speed', name: 'speed-next-other' },
      ],
    },
    comments: { nodes: [] },
    ...overrides,
  };
}

function mergedPr(overrides = {}) {
  return {
    number: 123,
    url: 'https://github.com/example/repo/pull/123',
    state: 'MERGED',
    isDraft: false,
    createdAt: '2026-08-09T10:10:00.000Z',
    mergedAt: '2026-08-09T11:10:30.000Z',
    mergeCommit: { oid: 'abc123' },
    ...overrides,
  };
}

test('collectContributors preserves existing agents and adds collaborators', () => {
  assert.deepStrictEqual(
    collectContributors([{ name: 'agent-codex' }, { name: 'agent-lock' }], ['grok', 'Codex']),
    ['codex', 'grok'],
  );
});

test('durationBucket has stable low-cardinality boundaries', () => {
  assert.strictEqual(durationBucket(14 * 60_000), 'cycle-under-15m');
  assert.strictEqual(durationBucket(15 * 60_000), 'cycle-15m-1h');
  assert.strictEqual(durationBucket(60 * 60_000), 'cycle-1h-4h');
  assert.strictEqual(durationBucket(4 * 60 * 60_000), 'cycle-4h-1d');
  assert.strictEqual(durationBucket(24 * 60 * 60_000), 'cycle-1d-3d');
  assert.strictEqual(durationBucket(3 * 24 * 60 * 60_000), 'cycle-over-3d');
});

test('formatDuration reports exact readable elapsed time', () => {
  assert.strictEqual(formatDuration(90_061_000), '1d 1h 1m 1s');
  assert.strictEqual(formatDuration(0), '0s');
});

test('createCloseoutPlan records multi-agent issue and PR telemetry', () => {
  const plan = createCloseoutPlan({
    issue: issue(),
    contributors: ['grok'],
    pr: mergedPr(),
    observedAt: '2026-08-09T11:11:00.000Z',
    bottleneck: 'CI queue wait',
    improvementCategory: 'ci',
    improvement: 'Run focused checks before opening the PR.',
    evidence: 'https://github.com/example/repo/actions/runs/1',
  });
  assert.deepStrictEqual(plan.contributors, ['codex', 'grok']);
  assert.strictEqual(plan.issueCycleMs, 3_930_000);
  assert.strictEqual(plan.prCycleMs, 3_630_000);
  assert.ok(plan.finalLabelNames.includes('agent-codex'));
  assert.ok(plan.finalLabelNames.includes('agent-grok'));
  assert.ok(plan.finalLabelNames.includes('cycle-1h-4h'));
  assert.ok(plan.finalLabelNames.includes('pr-cycle-1h-4h'));
  assert.ok(plan.finalLabelNames.includes('speed-next-ci'));
  assert.ok(plan.finalLabelNames.includes('outcome-pr-merged'));
  assert.ok(plan.finalLabelNames.includes('Bug'));
  assert.ok(!plan.finalLabelNames.includes('agent-lock'));
  assert.ok(!plan.finalLabelNames.includes('cycle-over-3d'));
  assert.match(plan.commentBody, /Contributors: `codex`, `grok`/);
  assert.match(plan.commentBody, /Primary bottleneck: CI queue wait/);
  assert.match(plan.commentBody, /linear-closeout:[a-f0-9]{64}/);
});

test('createCloseoutPlan rejects unmerged PR evidence', () => {
  assert.throws(() => createCloseoutPlan({
    issue: issue(),
    pr: mergedPr({ state: 'OPEN', mergedAt: null }),
    bottleneck: 'review',
    improvementCategory: 'review',
    improvement: 'Request review earlier.',
  }), /state=MERGED/);
});

test('createCloseoutPlan requires a concrete bottleneck and improvement', () => {
  assert.throws(() => createCloseoutPlan({
    issue: issue(),
    bottleneck: '',
    improvementCategory: 'tests',
    improvement: 'Add a focused test.',
  }), /bottleneck is required/);
  assert.throws(() => createCloseoutPlan({
    issue: issue(),
    bottleneck: 'slow reproduction',
    improvementCategory: 'guess',
    improvement: 'Do something.',
  }), /improvement category must be one of/);
});

test('createCloseoutPlan keeps current telemetry labels on retry', () => {
  const plan = createCloseoutPlan({
    issue: issue({
      startedAt: '2026-08-09T10:00:00.000Z',
      completedAt: '2026-08-09T10:05:00.000Z',
      labels: { nodes: [
        { id: 'agent', name: 'agent-codex' },
        { id: 'cycle', name: 'cycle-under-15m' },
        { id: 'speed', name: 'speed-next-tooling' },
        { id: 'outcome', name: 'outcome-issue-closed' },
      ] },
    }),
    bottleneck: 'manual bookkeeping',
    improvementCategory: 'tooling',
    improvement: 'Use the closeout command.',
  });
  assert.deepStrictEqual(plan.removedLabelNames, []);
});

test('loadPullRequest uses gh with the requested PR target', () => {
  let observed;
  const pr = loadPullRequest('https://github.com/example/repo/pull/123', (command, args) => {
    observed = { command, args };
    return JSON.stringify(mergedPr());
  });
  assert.strictEqual(observed.command, 'gh');
  assert.deepStrictEqual(observed.args.slice(0, 3), [
    'pr',
    'view',
    'https://github.com/example/repo/pull/123',
  ]);
  assert.strictEqual(pr.state, 'MERGED');
});

test('findExistingCloseoutComment makes changed retry timestamps idempotent', () => {
  const prior = {
    id: 'comment-1',
    url: 'https://linear/comment-1',
    body: 'proof\n<!-- linear-closeout:old-digest -->',
  };
  const withPrior = issue({ comments: { nodes: [prior] } });
  assert.strictEqual(findExistingCloseoutComment(withPrior, '<!-- linear-closeout:new-digest -->'), prior);
  assert.strictEqual(findExistingCloseoutComment(issue(), '<!-- linear-closeout:new-digest -->'), null);
});

test('closeoutCommentAction updates stale timing once and then reuses it', () => {
  const prior = {
    id: 'comment-1',
    url: 'https://linear/comment-1',
    body: 'old timing\n<!-- linear-closeout:old-digest -->',
  };
  const withPrior = issue({ comments: { nodes: [prior] } });
  assert.strictEqual(
    closeoutCommentAction(withPrior, '<!-- linear-closeout:new-digest -->', 'new timing').action,
    'update',
  );
  const currentBody = 'new timing\n<!-- linear-closeout:new-digest -->';
  const current = issue({ comments: { nodes: [{ ...prior, body: currentBody }] } });
  assert.strictEqual(
    closeoutCommentAction(current, '<!-- linear-closeout:new-digest -->', currentBody).action,
    'reuse',
  );
  assert.strictEqual(
    closeoutCommentAction(issue(), '<!-- linear-closeout:new-digest -->', 'new timing').action,
    'create',
  );
});

test('auditIssues flags missing closeout dimensions after policy start', () => {
  const audit = auditIssues([
    {
      identifier: 'AGENT-1',
      url: 'https://linear/1',
      completedAt: '2026-08-09T15:12:00.000Z',
      labels: { nodes: [{ name: 'agent-codex' }] },
    },
    {
      identifier: 'AGENT-2',
      url: 'https://linear/2',
      completedAt: '2026-08-09T15:13:00.000Z',
      labels: { nodes: [
        { name: 'agent-codex' },
        { name: 'cycle-under-15m' },
        { name: 'speed-next-tests' },
        { name: 'outcome-issue-closed' },
      ] },
    },
    {
      identifier: 'OLD-1',
      completedAt: '2026-08-08T23:59:00.000Z',
      labels: { nodes: [] },
    },
  ], POLICY_START);
  assert.strictEqual(audit.completedIssueCount, 2);
  assert.strictEqual(audit.compliantCount, 1);
  assert.deepStrictEqual(audit.noncompliant[0].missing, ['cycle-*', 'speed-next-*', 'outcome-*']);
});

test('parseArgs defaults to read-only preview and supports audit strict mode', () => {
  const close = parseArgs(['--issue', 'AGENT-1', '--agents', 'codex,grok']);
  assert.strictEqual(close.apply, false);
  assert.deepStrictEqual(close.agents, ['codex', 'grok']);
  const audit = parseArgs(['--audit', '--strict', '--team', 'IGO']);
  assert.strictEqual(audit.audit, true);
  assert.strictEqual(audit.strict, true);
  assert.strictEqual(audit.team, 'IGO');
});

if (!process.exitCode) console.log('test-linear-closeout-telemetry: all assertions ran');
