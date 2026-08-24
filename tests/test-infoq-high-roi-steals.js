#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runInfoQStealsSuite,
  auditMcpToolPruning,
  evaluateLocalFirstRouting,
  evaluateHybridRrfRetrieval,
} = require('../tools/infoq-high-roi-steals');

function measuredEvidence() {
  return {
    mcp: {
      registeredTools: 80,
      activeTools: 12,
      beforePromptTokens: 10_000,
      afterPromptTokens: 4_200,
    },
    workloads: [
      { id: 'lead-triage', baseline: { costUsd: 0.10, passed: true }, candidate: { costUsd: 0.01, passed: true, route: 'local' } },
      { id: 'support-label', baseline: { costUsd: 0.12, passed: true }, candidate: { costUsd: 0.02, passed: true, route: 'private' } },
      { id: 'contract-check', baseline: { costUsd: 0.08, passed: false }, candidate: { costUsd: 0.03, passed: true, route: 'hosted' } },
    ],
    retrieval: [
      {
        id: 'multi-hop',
        expectedEvidence: ['service-a', 'service-b'],
        expectedPaths: ['service-a->calls->service-b'],
        searchOnly: ['service-a'],
        fusedEvidence: ['service-a', 'service-b'],
        fusedPaths: ['service-a->calls->service-b'],
      },
      {
        id: 'semantic',
        expectedEvidence: ['runbook'],
        expectedPaths: [],
        searchOnly: ['runbook'],
        fusedEvidence: ['runbook'],
        fusedPaths: [],
      },
    ],
  };
}

{
  const suite = runInfoQStealsSuite();
  assert.strictEqual(suite.ready, false);
  assert.strictEqual(suite.overallStatus, 'INSUFFICIENT_OR_FAILED');
  assert.strictEqual(suite.mcpAudit.measuredTokenSavingsPercent, null);
  assert.strictEqual(suite.localRouting.measuredCostReductionPercent, null);
  assert.strictEqual(suite.hybridRag.fusedRecallPercent, null);
}

{
  const audit = auditMcpToolPruning(measuredEvidence().mcp);
  assert.strictEqual(audit.status, 'MEASURED');
  assert.strictEqual(audit.prunedToolCount, 68);
  assert.strictEqual(audit.measuredTokenSavingsPercent, 58);
}

{
  const routing = evaluateLocalFirstRouting(measuredEvidence().workloads);
  assert.strictEqual(routing.status, 'MEASURED');
  assert.strictEqual(routing.localRatioPercent, 66.67);
  assert.strictEqual(routing.measuredCostReductionPercent, 80);
  assert.strictEqual(routing.recommendation, 'promote_candidate_canary');
}

{
  const routing = evaluateLocalFirstRouting(measuredEvidence().workloads.slice(0, 2));
  assert.strictEqual(routing.status, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(routing.recommendation, 'collect_labeled_canary_evidence');
}

{
  const retrieval = evaluateHybridRrfRetrieval(measuredEvidence().retrieval);
  assert.strictEqual(retrieval.status, 'PASS');
  assert.strictEqual(retrieval.searchRecallPercent, 75);
  assert.strictEqual(retrieval.fusedRecallPercent, 100);
  assert.strictEqual(retrieval.relationalPathRecallPercent, 100);
  assert.strictEqual(retrieval.recallLiftPoints, 25);
}

{
  const noLift = evaluateHybridRrfRetrieval([{
    id: 'no-lift',
    expectedEvidence: ['a'],
    expectedPaths: [],
    searchOnly: ['a'],
    fusedEvidence: ['a'],
    fusedPaths: [],
  }]);
  assert.strictEqual(noLift.status, 'FAIL');
  assert.strictEqual(noLift.recommendation, 'fix_resolution_or_remove_graph_stage');
}

{
  const suite = runInfoQStealsSuite(measuredEvidence());
  assert.strictEqual(suite.ready, true);
  assert.strictEqual(suite.overallStatus, 'MEASURED_PASS');
}

{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roi-evidence-'));
  const evidenceFile = path.join(tempDir, 'evidence.json');
  fs.writeFileSync(evidenceFile, JSON.stringify(measuredEvidence()));
  const measured = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'tools', 'infoq-high-roi-steals.js'),
    '--evidence', evidenceFile, '--validate', '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(measured.status, 0, measured.stderr);
  assert.strictEqual(JSON.parse(measured.stdout).ready, true);

  const missing = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'tools', 'infoq-high-roi-steals.js'),
    '--validate', '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(missing.status, 1);
  assert.strictEqual(JSON.parse(missing.stdout).ready, false);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('ok tests/test-infoq-high-roi-steals.js');
