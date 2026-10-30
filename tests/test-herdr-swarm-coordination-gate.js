#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewCoordination } = require('../tools/herdr-swarm-coordination-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function ready() {
  return {
    task: 'ship the herdr swarm coordination gate',
    promptHash: '0123456789abcdef',
    seat: 'worker@workshop',
    branch: 'agent/herdr-swarm-coordination-gate-20261030',
    writerCount: 1,
    isolation: 'worktree',
    linearKey: 'AGENT-1',
    notePath: 'Documents/AI-Agent-Sync/Swarm-SOWs/herdr-swarm-coordination.md',
    notebookDoc: 'docs/HERDR-SWARM-COORDINATION-SOW.md',
    pullRequestUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2228',
    judgeModel: 'codex',
    workerModel: 'grok',
    verdict: 'accept',
    verdictEvidence: 'node tests/test-herdr-swarm-coordination-gate.js printed PASS',
    workerClaim: 'the swarm lease is held by one writer',
    experts: ['fast', 'judge'],
    chosenExpert: 'fast',
  };
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/herdr-swarm-coordination-gate.js'), 'utf8');
  assert.ok(!source.includes('overallGrade'));
  assert.ok(!source.includes('-78'));
  assert.ok(!source.includes('$0.13'));
  assert.ok(!/writeFile|appendFile|mkdirSync/.test(source));

  const blank = reviewCoordination({});
  assert.strictEqual(blank.overall, 0);
  assert.strictEqual(blank.awardedGrade, null);
  assert.strictEqual(blank.measuredSavings, null);
  assert.strictEqual(blank.calledModel, false);
  assert.ok(blank.planes.every((plane) => plane.score === 0));

  const top = reviewCoordination(ready());
  assert.strictEqual(top.ok, true);
  assert.strictEqual(top.overall, 10);
  assert.strictEqual(top.awardedGrade, 'A+');
  assert.ok(top.planes.every((plane) => plane.score === 10));

  const claimed = reviewCoordination({ task: 'this swarm is 10/10 and A+' });
  assert.strictEqual(claimed.awardedGrade, null);
  assert.ok(ids(claimed).includes('grade_claimed_without_proof'));

  const vendor = reviewCoordination({ ...ready(), workerClaim: 'the capsule saved 78% of tokens' });
  assert.strictEqual(vendor.overall, 0);
  assert.strictEqual(vendor.measuredSavings, null);
  assert.ok(ids(vendor).includes('vendor_metric'));

  const sameJudge = reviewCoordination({ ...ready(), judgeModel: 'grok' });
  assert.ok(ids(sameJudge).includes('judge_same_model'));
  assert.strictEqual(sameJudge.awardedGrade, null);

  const copied = reviewCoordination({
    ...ready(),
    verdictEvidence: 'the swarm lease is held by one writer',
  });
  assert.ok(ids(copied).includes('judge_copied_worker'));

  const privateIssue = reviewCoordination({
    ...ready(),
    pullRequestUrl: '',
    issueNumber: '15',
    task: 'coordinate the herdr swarm',
  });
  assert.ok(ids(privateIssue).includes('github_issue_is_private_board'));

  const sharedMain = reviewCoordination({ ...ready(), branch: 'main', isolation: 'gitbutler' });
  assert.ok(ids(sharedMain).includes('isolation_missing'));
  assert.ok(ids(sharedMain).includes('herdr_lease_missing'));

  const cli = spawnSync(process.execPath, ['tools/herdr-swarm-coordination-gate.js', '--json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.strictEqual(cli.status, 0);
  const host = JSON.parse(cli.stdout);
  assert.strictEqual(host.awardedGrade, null);
  assert.strictEqual(host.calledModel, false);
  assert.ok(!cli.stdout.includes('10/10'));
  assert.ok(!cli.stdout.includes('A+'));

  console.log('test-herdr-swarm-coordination-gate: PASS');
}

main();
