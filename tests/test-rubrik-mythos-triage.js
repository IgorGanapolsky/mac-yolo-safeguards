#!/usr/bin/env node
'use strict';

/**
 * Fixture-only proof of Rubrik Mythos high-ROI steal:
 * checkpoints, trust-boundary prune, two-track "what not to automate",
 * cross-file taint chains, deduped engineer queue. No ~/.hermes, no live repo scan.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  RubrikMythosTriageHarness,
  SAFE_AUTOMATED_REMEDIATION_CLASSES,
  classifyTrustBoundary,
} = require('../tools/rubrik-mythos-triage-harness');

const FIXTURES = path.join(__dirname, 'fixtures', 'rubrik-mythos');
const REPO_ROOT = path.resolve(__dirname, '..');

function harness(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return new RubrikMythosTriageHarness({
    stateDir: dir,
    checkpointPath: path.join(dir, 'checkpoint.json'),
    queuePath: path.join(dir, 'queue.json'),
  });
}

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rubrik-mythos-'));

  assert.strictEqual(classifyTrustBoundary('execSync("x " + req.query.repo)'), 'UNTRUSTED_ENTRY');
  assert.strictEqual(classifyTrustBoundary('execSync("git status")'), 'INTERNAL');
  console.log('PASS 1 trust-boundary classifier');

  const h = harness(tmp);
  const report = h.runTriagePipeline(FIXTURES, { force: true });
  assert.ok(report.pass1_BroadScan.filesScanned >= 7, 'scan fixture files');
  assert.ok(report.pass1_BroadScan.rawCandidatesFound >= 6, 'raw findings');
  console.log(`PASS 2 pass1 raw=${report.pass1_BroadScan.rawCandidatesFound} files=${report.pass1_BroadScan.filesScanned}`);

  const second = h.runTriagePipeline(FIXTURES);
  assert.strictEqual(second.pass1_BroadScan.filesScanned, 0, 'checkpoint must skip unchanged files');
  assert.ok(second.pass1_BroadScan.skippedUnchanged >= 7);
  console.log(`PASS 3 checkpoint skipped ${second.pass1_BroadScan.skippedUnchanged} unchanged files`);

  const trackAIds = report.trackA_Patches.map((item) => item.finding.id).sort();
  const trackBIds = report.trackB_Escalations.map((item) => item.finding.id).sort();
  assert.ok(trackAIds.includes('CYBER-001-CMD-INJECTION'), 'single-file cmd injection is Track A');
  assert.ok(trackAIds.includes('CYBER-002-SQL-INJECTION'), 'sql injection is Track A');
  assert.ok(trackAIds.includes('CYBER-006-INSECURE-CORS'), 'cors wildcard is Track A');
  assert.ok(trackBIds.includes('CYBER-003-HARDCODED-SECRET'), 'secrets never auto-fixed');
  assert.ok(trackBIds.includes('CYBER-004-DANGEROUS-EVAL'), 'eval never auto-fixed');
  assert.ok(trackBIds.includes('CYBER-005-PATH-TRAVERSAL'), 'path traversal never auto-fixed');
  assert.ok(!SAFE_AUTOMATED_REMEDIATION_CLASSES.has('CYBER-003-HARDCODED-SECRET'));
  console.log(`PASS 4 two-track A=${trackAIds.join(',')} B=${[...new Set(trackBIds)].join(',')}`);

  const fixtureFinding = report.trackA_Patches.concat(report.trackB_Escalations)
    .some((item) => /mock\.test\.js$/.test(item.finding.file));
  assert.strictEqual(fixtureFinding, false, 'test fixture must be pruned');
  assert.ok(report.pass2_ReachabilityFilter.noiseFiltered >= 1);
  console.log(`PASS 5 fixture noise pruned (${report.pass2_ReachabilityFilter.noiseReductionPercent})`);

  assert.ok(report.crossComponentChains.length >= 1, 'userInput chain across chain-a/b');
  const chained = report.trackB_Escalations.filter((item) => item.reason === 'cross-component-taint-chain');
  assert.ok(chained.length >= 2, 'both chain files escalate');
  assert.ok(!report.trackA_Patches.some((item) => /chain-[ab]\.js$/.test(item.finding.file)));
  console.log(`PASS 6 cross-file chain escalated (${report.crossComponentChains[0].token})`);

  const queued = h.loadEscalationQueue();
  assert.ok(queued.length >= 3);
  const again = h.twoTrackDispatch({
    actionableFindingsCount: report.pass2_ReachabilityFilter.actionableCount,
    reachableFindings: report.trackB_Escalations.map((item) => item.finding).concat(
      report.trackA_Patches.map((item) => item.finding),
    ),
  });
  const after = h.loadEscalationQueue();
  assert.ok(after.length <= queued.length + again.trackB_EngineerEscalationCount);
  const keys = after.map((item) => item.dedupeKey);
  assert.strictEqual(keys.length, new Set(keys).size, 'queue deduped by file:line:id');
  console.log(`PASS 7 queue persisted+deduped (${after.length})`);

  const doc = h.runDoctor();
  assert.strictEqual(doc.tokenBudgetGuard.monthlyCapUsd, 10);
  assert.strictEqual(doc.tokenBudgetGuard.allowPaid, false);
  assert.strictEqual(doc.status, 'OPERATIONAL');
  assert.ok(doc.checkpointedFiles >= 7);
  console.log('PASS 8 doctor $10 fail-closed local');

  const cli = path.join(REPO_ROOT, 'bin', 'rubrik-triage');
  const doctorCli = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(doctorCli.status, 0, doctorCli.stderr);
  const doctorJson = JSON.parse(doctorCli.stdout);
  assert.strictEqual(doctorJson.tokenBudgetGuard.monthlyCapUsd, 10);

  const scanCli = spawnSync(cli, ['scan', FIXTURES, '--json', '--force'], {
    encoding: 'utf8',
    env: { ...process.env, RUBRIK_MYTHOS_STATE_DIR: path.join(tmp, 'cli-state') },
  });
  assert.strictEqual(scanCli.status, 0, scanCli.stderr);
  const scanJson = JSON.parse(scanCli.stdout);
  assert.ok(scanJson.pass3_TwoTrackTriage.trackB_EngineerEscalated >= 3);
  console.log('PASS 9 CLI doctor+scan');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nALL RUBRIK MYTHOS HIGH-ROI TESTS PASSED (9/9)');
}

run();
