#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  verifyDeclarativeSchemaDrift,
  auditDatabasePaperclipping,
  evaluateAgentConfusionPreProduction,
  assignPlsCohort,
  evaluateProductLedSalesTriggers,
  auditCollapsedZeroHitlProcesses,
  runAllChecks,
} = require('../tools/supabase-ibm-agent-guardrails');

const REPO = path.resolve(__dirname, '..');

function main() {
  // 1. Declarative schema drift verifier (pg-delta steal)
  const drift = verifyDeclarativeSchemaDrift();
  assert.strictEqual(drift.ok, true, `Expected zero schema drift, got: ${JSON.stringify(drift.drift)}`);
  assert.ok(drift.tableCount >= 18, `Expected >= 18 tables, got ${drift.tableCount}`);
  assert.strictEqual(drift.tableCount, drift.declarativeTableCount);
  assert.ok(drift.sequentialMigrationsChecked >= 2);

  // 2. Anti-paperclipping database guardrails (Supabase steal)
  const cleanSql = 'SELECT id, organization_id FROM threads WHERE organization_id = ?;';
  assert.strictEqual(auditDatabasePaperclipping(cleanSql).ok, true);

  const rlsDisable = auditDatabasePaperclipping('ALTER TABLE threads DISABLE ROW LEVEL SECURITY;');
  assert.strictEqual(rlsDisable.ok, false);
  assert.ok(rlsDisable.violations.some((v) => v.rule === 'no-rls-disable'));

  const blanketPolicy = auditDatabasePaperclipping('CREATE POLICY allow_all ON threads USING (true);');
  assert.strictEqual(blanketPolicy.ok, false);
  assert.ok(blanketPolicy.violations.some((v) => v.rule === 'no-blanket-rls-bypass'));

  const intentionalPublic = auditDatabasePaperclipping(
    'CREATE POLICY public_docs ON docs USING (true); -- public-read-intentional',
  );
  assert.strictEqual(intentionalPublic.ok, true);

  const binaryBlob = auditDatabasePaperclipping('ALTER TABLE users ADD COLUMN avatar_blob BYTEA;');
  assert.strictEqual(binaryBlob.ok, false);
  assert.ok(binaryBlob.violations.some((v) => v.rule === 'no-binary-blobs-in-oltp'));

  const dockerPg = auditDatabasePaperclipping('docker run -d -p 5432:5432 postgres:16');
  assert.strictEqual(dockerPg.ok, false);
  assert.ok(dockerPg.violations.some((v) => v.rule === 'prefer-zero-docker-local-db'));

  // 3. IBM TechXchange Pre-Production Confusion Gate (3 measurable axes)
  const clearGate = evaluateAgentConfusionPreProduction();
  assert.strictEqual(clearGate.ok, true, JSON.stringify(clearGate.findings));
  assert.strictEqual(clearGate.confused, false);
  assert.strictEqual(clearGate.confusionScore, 0);
  assert.strictEqual(clearGate.productionReady, true);

  const confusedGate = evaluateAgentConfusionPreProduction({
    taskSpec: {
      goal: 'short',
      targetFiles: [],
      acceptanceCriteria: [],
      directives: ['disable RLS', 'never disable RLS'],
    },
  });
  assert.strictEqual(confusedGate.ok, false);
  assert.strictEqual(confusedGate.confused, true);
  assert.ok(confusedGate.confusionScore > 0);
  assert.ok(confusedGate.findings.some((f) => f.axis === 'ambiguous_context'));

  // 4. Trigger-Based Product-Led Sales (PLS) with Control Group Uplift
  const cohortA = assignPlsCohort('acct_deterministic_1');
  const cohortA2 = assignPlsCohort('acct_deterministic_1');
  assert.strictEqual(cohortA, cohortA2, 'Cohort assignment must be deterministic');

  const pls = evaluateProductLedSalesTriggers();
  assert.strictEqual(pls.ok, true);
  assert.strictEqual(pls.incrementalUpliftPct, 100);
  assert.strictEqual(pls.repCompensatedOnIncrementalOnly, true);
  const assistedAction = pls.actions.find((a) => a.cohort === 'assisted_treatment');
  assert.ok(assistedAction && assistedAction.troubleshootingScript.includes('yolo-health'));
  const controlAction = pls.actions.find((a) => a.cohort === 'control_baseline');
  assert.ok(controlAction && controlAction.troubleshootingScript === null);

  // 5. Zero-HITL Collapsed Processes + Artifacts
  const zeroHitl = auditCollapsedZeroHitlProcesses();
  assert.strictEqual(zeroHitl.ok, true);
  assert.strictEqual(zeroHitl.collapseRatio, 1);

  assert.ok(fs.existsSync(path.join(REPO, 'schemas', 'hermes-control-plane.declarative.sql')));
  assert.ok(fs.existsSync(path.join(REPO, '.agents', 'skills', 'supabase-declarative-db-guardrails', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(REPO, 'docs', 'aeo', 'AGENT-RELIABILITY-FAQ-DISCUSSIONS.md')));

  const full = runAllChecks();
  assert.strictEqual(full.ok, true);

  console.log('test-supabase-ibm-steals: PASS (all 5 pillars verified)');
}

main();
