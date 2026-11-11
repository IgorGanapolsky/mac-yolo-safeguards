#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildNightShiftKanbanPlan,
  computeWcagContrastRatio,
  emitOtelSpan,
  evaluateMiniPodStructure,
  evaluateProgressiveAutonomy,
  getGoldenExamplesAndTribalKnowledge,
  loadConfig,
  runDoctor,
  runSidewaysGuardrailsGate,
  scoreTaskTokenRoi,
  validateStandardPrd,
} = require('../tools/mckinsey-ai-coding-steal');

test('Pillar 1A: validateStandardPrd accepts golden PRD and rejects fragmented specs', () => {
  const cfg = loadConfig();
  const goldenPrd = cfg.contextAndSkills.goldenExamples.prd_spec;
  const passRes = validateStandardPrd(goldenPrd, cfg);
  assert.equal(passRes.status, 'PASS');
  assert.equal(passRes.passed, true);
  assert.deepEqual(passRes.missingFields, []);
  assert.deepEqual(passRes.qualityIssues, []);
  assert.match(passRes.receiptHash, /^[0-9a-f]{16}$/);

  const fragmentedRes = validateStandardPrd({
    id: 'PRD-BAD',
    title: 'Quick fix',
    problemStatement: 'too short',
    acceptanceCriteria: ['short'],
    verificationCommand: 'manual check in browser',
  });
  assert.equal(fragmentedRes.status, 'BLOCK');
  assert.equal(fragmentedRes.passed, false);
  assert.ok(fragmentedRes.missingFields.includes('targetUser'));
  assert.ok(fragmentedRes.missingFields.includes('rollbackPlan'));
  assert.ok(fragmentedRes.qualityIssues.length >= 2);
});

test('Pillar 1B: evaluateProgressiveAutonomy scales trust with consecutive green runs and blocks irreversible actions', () => {
  const tier0 = evaluateProgressiveAutonomy({
    consecutiveGreenRuns: 0,
    defectRate: 0,
    actionClass: 'open_pr',
  });
  assert.equal(tier0.status, 'HOLD_FOR_HUMAN');
  assert.equal(tier0.tier, 'tier0_unproven');
  assert.equal(tier0.humanSignOffRequired, true);

  const tier1 = evaluateProgressiveAutonomy({
    consecutiveGreenRuns: 4,
    defectRate: 0.02,
    actionClass: 'open_pr',
  });
  assert.equal(tier1.status, 'AUTONOMOUS_ALLOW');
  assert.equal(tier1.tier, 'tier1_validated');
  assert.equal(tier1.humanSignOffRequired, false);

  const tier2 = evaluateProgressiveAutonomy({
    consecutiveGreenRuns: 12,
    defectRate: 0.01,
    actionClass: 'auto_merge_when_required_checks_green',
  });
  assert.equal(tier2.status, 'AUTONOMOUS_ALLOW');
  assert.equal(tier2.tier, 'tier2_trusted_night_shift');

  const irreversible = evaluateProgressiveAutonomy({
    consecutiveGreenRuns: 100,
    defectRate: 0.0,
    actionClass: 'spend_money_or_upgrade_plan',
  });
  assert.equal(irreversible.status, 'HOLD_FOR_HUMAN');
  assert.equal(irreversible.tier, 'irreversible_guard');
  assert.equal(irreversible.allowed, false);
});

test('Pillar 2: evaluateMiniPodStructure enforces 2-4 pod bounds, role collapse, and review-first parity', () => {
  const validPod = evaluateMiniPodStructure({
    podSize: 3,
    concurrentAgents: 2,
    rolesPresent: ['definer', 'builder', 'reviewer'],
    generatedPrCount: 3,
    reviewedPrCount: 3,
    hasReviewReceipt: true,
  });
  assert.equal(validPod.status, 'PASS');
  assert.equal(validPod.passed, true);
  assert.deepEqual(validPod.violations, []);

  const bloatedUnreviewedPod = evaluateMiniPodStructure({
    podSize: 8,
    concurrentAgents: 5,
    rolesPresent: ['builder'],
    generatedPrCount: 5,
    reviewedPrCount: 1,
    hasReviewReceipt: false,
  });
  assert.equal(bloatedUnreviewedPod.status, 'BLOCK');
  assert.equal(bloatedUnreviewedPod.passed, false);
  assert.ok(bloatedUnreviewedPod.missingRoles.includes('definer'));
  assert.ok(bloatedUnreviewedPod.missingRoles.includes('reviewer'));
  assert.ok(bloatedUnreviewedPod.violations.length >= 3);
});

test('Pillar 3: getGoldenExamplesAndTribalKnowledge returns SME semantic layer, golden exemplars, and vetted skills', () => {
  const res = getGoldenExamplesAndTribalKnowledge();
  assert.equal(res.status, 'READY');
  assert.ok(res.tribalKnowledgeCount >= 5);
  assert.ok(res.goldenExampleKeys.includes('prd_spec'));
  assert.ok(res.goldenExampleKeys.includes('mcp_tool'));
  assert.ok(res.goldenExampleKeys.includes('fail_closed_gate'));
  assert.ok(res.goldenExampleKeys.includes('behavior_test'));
  assert.equal(res.vettedSkillsAudit.missingFromRegistry.length, 0);
});

test('Pillar 4: runSidewaysGuardrailsGate enforces WCAG AA contrast, colorblind safety, tap targets, focus ring, budget, and DLP', () => {
  const highContrast = computeWcagContrastRatio('#0f172a', '#ffffff');
  assert.ok(highContrast >= 15.0);

  const passGate = runSidewaysGuardrailsGate({
    textContent: 'Public SaaS release note',
    htmlOrCssContent: '.btn:focus-visible { outline: 2px solid #0284c7; }',
    fgHex: '#0f172a',
    bgHex: '#ffffff',
    tapTargetPx: 48,
    usesRedGreenOnlyStatus: false,
    estimatedMonthlySpendUsd: 2.5,
  });
  assert.equal(passGate.status, 'PASS');
  assert.equal(passGate.passed, true);

  const failGate = runSidewaysGuardrailsGate({
    textContent: 'Leaked token ghp_1234567890abcdefghij1234567890',
    htmlOrCssContent: '.btn { outline: none; }',
    fgHex: '#94a3b8',
    bgHex: '#ffffff',
    tapTargetPx: 32,
    usesRedGreenOnlyStatus: true,
    estimatedMonthlySpendUsd: 25.0,
  });
  assert.equal(failGate.status, 'BLOCK');
  assert.equal(failGate.passed, false);
  assert.ok(failGate.violations.some((v) => v.startsWith('security_dlp:')));
  assert.ok(failGate.violations.some((v) => v.startsWith('compliance_budget:')));
  assert.ok(failGate.violations.some((v) => v.startsWith('accessibility_contrast:')));
  assert.ok(failGate.violations.some((v) => v.startsWith('accessibility_colorblind:')));
  assert.ok(failGate.violations.some((v) => v.startsWith('accessibility_tap_target:')));
  assert.ok(failGate.violations.some((v) => v.startsWith('accessibility_focus:')));
});

test('Pillar 5: scoreTaskTokenRoi, buildNightShiftKanbanPlan, and emitOtelSpan enforce $10 budget and air-gap diode', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mckinsey-otel-'));
  const otelPath = path.join(tmpDir, 'otel_spans.jsonl');

  const highRoi = scoreTaskTokenRoi({
    taskId: 'TASK-REV-001',
    taskTitle: 'Publish Claude & Cursor Marketplace connectors',
    category: 'direct_revenue',
    estimatedTokens: 20000,
    costPerMillionTokensUsd: 0.0,
    expectedValueUsd: 99.0,
    confidence: 0.9,
    otelPath,
    emitTelemetry: true,
  });
  assert.equal(highRoi.decision, 'SCHEDULE_IMMEDIATE');
  assert.ok(highRoi.roiMultiplier >= 100);
  assert.equal(highRoi.otel.emitted, true);
  assert.ok(fs.existsSync(otelPath));

  const cfg = loadConfig();
  const plan = buildNightShiftKanbanPlan(
    [
      {
        taskId: 'TASK-GOOD',
        taskTitle: 'Ship verified connector bundle',
        category: 'direct_revenue',
        expectedValueUsd: 49,
        confidence: 0.9,
        prd: cfg.contextAndSkills.goldenExamples.prd_spec,
      },
      {
        taskId: 'TASK-SPECULATIVE',
        taskTitle: 'Speculative cosmetic rewrite',
        category: 'speculative_refactor',
        expectedValueUsd: 1,
        confidence: 0.2,
      },
      {
        taskId: 'TASK-BAD-PRD',
        taskTitle: 'Fragmented PRD task',
        prd: { id: 'BAD', title: 'Incomplete' },
      },
    ],
    cfg,
    { emitTelemetry: false, otelPath },
  );
  assert.equal(plan.scheduledCount, 1);
  assert.equal(plan.heldCount, 2);
  assert.equal(plan.scheduled[0].taskId, 'TASK-GOOD');

  assert.throws(
    () => emitOtelSpan('gen_ai.test', { host: 'internal.ecinexus.com' }, otelPath),
    /CORP_AIRGAP_RE/,
  );

  const doc = runDoctor({ emitTelemetry: false, otelPath });
  assert.equal(doc.status, 'READY');
});
