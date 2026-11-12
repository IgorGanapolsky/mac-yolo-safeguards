#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { reviewReceipt, SOURCE } = require('../tools/egm-fresh-review-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function fresh(overrides) {
  return {
    isolation: 'fresh',
    reviewerAgentId: 'HudClaimGoldfish',
    parentSessionId: 'omp-parent',
    mode: 'claim',
    stages: [9],
    reauditCount: 0,
    findings: [],
    ...overrides,
  };
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/egm-fresh-review-gate.js'), 'utf8');
  assert.strictEqual(SOURCE, 'https://github.com/google/elephant-goldfish-model');
  assert.ok(!/fetch\(|https\.request|child_process/.test(source));
  assert.ok(source.includes('calledModel: false'));

  const clear = reviewReceipt(fresh());
  assert.strictEqual(clear.ok, true);
  assert.strictEqual(clear.calledModel, false);
  assert.deepStrictEqual(clear.findings, []);

  const sameContext = reviewReceipt(fresh({ isolation: 'same', reviewerAgentId: 'omp-parent', parentSessionId: 'omp-parent' }));
  assert.strictEqual(sameContext.ok, false);
  assert.ok(ids(sameContext).includes('same_context'));

  const selfGrade = reviewReceipt(fresh({ reviewerAgentId: 'omp-parent' }));
  assert.ok(ids(selfGrade).includes('same_context'));

  const missingReviewer = reviewReceipt(fresh({ reviewerAgentId: '' }));
  assert.ok(ids(missingReviewer).includes('same_context'));

  const openBlocker = reviewReceipt(fresh({
    findings: [{ rank: 'blocker', status: 'open', evidence: 'smartCleanDisk still returns when isPro is false, line 3367' }],
  }));
  assert.ok(ids(openBlocker).includes('open_blocker'));
  assert.strictEqual(openBlocker.ok, false);

  const acceptedMajor = reviewReceipt(fresh({
    findings: [{ rank: 'major', status: 'accepted', evidence: 'UI copy still says telemetry; no network post' }],
  }));
  assert.strictEqual(acceptedMajor.ok, true);

  const openMajor = reviewReceipt(fresh({
    findings: [{ rank: 'major', status: 'open', evidence: 'checkout still uses from=app_paywall' }],
  }));
  assert.ok(ids(openMajor).includes('open_major'));

  const openNit = reviewReceipt(fresh({
    findings: [{ rank: 'nit', status: 'open', evidence: 'paywall copy says Manual cleanup stays free' }],
  }));
  assert.strictEqual(openNit.ok, true);

  const secondAudit = reviewReceipt(fresh({ reauditCount: 2 }));
  assert.ok(ids(secondAudit).includes('reaudit_cap'));

  const missingStage = reviewReceipt(fresh({ mode: 'full', stages: [5, 6] }));
  assert.ok(ids(missingStage).includes('stages_incomplete'));

  const full = reviewReceipt(fresh({ mode: 'full', stages: [5, 6, 7, 8, 9] }));
  assert.strictEqual(full.ok, true);

  const badFinding = reviewReceipt(fresh({ findings: [{ rank: 'blocker', status: 'open', evidence: '' }] }));
  assert.ok(ids(badFinding).includes('finding_malformed'));

  const empty = reviewReceipt(null);
  assert.ok(ids(empty).includes('same_context'));
  assert.ok(ids(empty).includes('mode_missing'));
  assert.ok(ids(empty).includes('findings_missing'));

  console.log('test-egm-fresh-review-gate: PASS');
}

main();
