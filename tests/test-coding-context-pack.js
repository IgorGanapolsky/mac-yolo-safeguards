#!/usr/bin/env node
'use strict';

/**
 * Pure unit tests for tools/coding-context-pack.js (no live gh/Linear).
 */

const assert = require('assert');
const {
  scoreIssue,
  rankIssues,
  prTouchesIssue,
  routeSkills,
  shipClaimGate,
  extractAcceptanceHints,
  parseArgs,
} = require('../tools/coding-context-pack.js');

function testParseArgs() {
  const a = parseArgs(['--json', '--issue', '132', '--write']);
  assert.strictEqual(a.json, true);
  assert.strictEqual(a.issue, 132);
  assert.strictEqual(a.write, true);
  const b = parseArgs(['--issue=141', '--minimal']);
  assert.strictEqual(b.issue, 141);
  assert.strictEqual(b.minimal, true);
}

function testPrTouches() {
  assert.ok(prTouchesIssue({ title: 'fix #132 identity', body: '' }, 132));
  assert.ok(prTouchesIssue({ title: 'chore', body: 'Closes GH-#242' }, 242));
  assert.ok(!prTouchesIssue({ title: 'unrelated', body: 'see #13 only' }, 132));
}

function testScoreRanking() {
  const prs = [
    {
      number: 1418,
      title: 'fix connection identity for #132',
      body: '',
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup: [],
    },
  ];
  const e2e = { unit: 'pass', e2e: 'skipped' };
  const issues = [
    {
      number: 242,
      title: 'Public: Hermes Mobile is live',
      labels: [{ name: 'status:blocked' }, { name: 'area:hermes-mobile' }],
    },
    {
      number: 141,
      title: 'Split notifications',
      labels: [{ name: 'priority:p1' }, { name: 'status:ready' }, { name: 'area:hermes-mobile' }],
    },
    {
      number: 132,
      title: 'P0: make connection identity release-blocking',
      labels: [
        { name: 'priority:p0' },
        { name: 'status:ready' },
        { name: 'bug' },
        { name: 'area:hermes-mobile' },
      ],
    },
  ];
  const ranked = rankIssues(issues, prs, e2e);
  assert.strictEqual(ranked[0].number, 132, 'p0 + ready + open PR should win');
  assert.ok(ranked[0]._score > ranked[1]._score);
  assert.ok(ranked.find((i) => i.number === 242)._score < ranked.find((i) => i.number === 141)._score);

  const blocked = scoreIssue(issues[0], [], e2e);
  assert.ok(blocked.reasons.includes('blocked'));
}

function testSkills() {
  const iss = {
    number: 132,
    title: 'P0: connection identity + auth',
    labels: [{ name: 'area:hermes-mobile' }],
  };
  const skills = routeSkills(iss);
  const ids = skills.map((s) => s.id);
  assert.ok(ids.includes('three-bus-ship-cycle'));
  assert.ok(ids.includes('troubleshoot-hermes-mobile-connectivity'));
  assert.ok(ids.includes('verify-hermes-mobile-ship'));
}

function testShipGate() {
  assert.strictEqual(shipClaimGate(null).ok, false);
  assert.strictEqual(shipClaimGate({ unit: 'pass', e2e: 'pass' }).ok, true);
  assert.strictEqual(shipClaimGate({ unit: 'fail', e2e: 'pass' }).ok, false);
  const mobile = shipClaimGate({ unit: 'pass', e2e: 'skipped' }, { requireE2ePass: true });
  assert.strictEqual(mobile.ok, false);
  assert.ok(mobile.blockers.some((b) => /e2e=/.test(b)));
}

function testAcHints() {
  const body = `## Acceptance\n\n- [ ] unit tests green\n- [x] PR open\n\nSome prose.`;
  const hints = extractAcceptanceHints(body);
  assert.ok(hints.length >= 2);
  assert.ok(hints.some((h) => /unit tests/.test(h)));
}

function main() {
  testParseArgs();
  testPrTouches();
  testScoreRanking();
  testSkills();
  testShipGate();
  testAcHints();
  console.log('test-coding-context-pack: ok');
}

main();
