'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveEmeansScalingLaws,
  cosineStepSchedule,
  emeansCluster,
  evaluateCodebookQuantizationTier,
} = require('../tools/emeans-quant-router');

const {
  PRODUCT_ID,
  INSTINCT_PHONE,
  INSTINCT_JID,
  INSTINCT_SESSION_PK,
  assertInstinctTargetOnly,
  validateInstinctPrompt,
  isMacYoloSafeguardsMessage,
  extractStructuredIntelFromMessages,
  classifyEmpiricalFreezeSignature,
} = require('../tools/whatsapp-instinct-driver');

const {
  ALLOW_UNATTENDED_OUTREACH,
  assertNoUnattendedOutreach,
} = require('../tools/happenstance-bridge-network-engine');

const {
  GEMINI_DECISION_MODEL,
  scoreOrderedRubric,
  buildGeminiDecisionsRequest,
  estimateDecisionPassEconomics,
  evaluatePreActionDecisionPack,
  evaluateCommercialOpportunityBatch,
} = require('../tools/gemini-decisions-engine');

test('deriveEmeansScalingLaws computes automatic batch size B and alpha0 including n > 2M rule', () => {
  const defLaw = deriveEmeansScalingLaws({ n: 100000, k: 256, epochs: 5, mode: 'default' });
  const qualLaw = deriveEmeansScalingLaws({ n: 100000, k: 256, epochs: 5, mode: 'quality' });
  const largeNDef = deriveEmeansScalingLaws({ n: 3000000, k: 16384, epochs: 5, mode: 'default' });
  const largeNQual = deriveEmeansScalingLaws({ n: 3000000, k: 16384, epochs: 5, mode: 'quality' });

  assert.equal(defLaw.n, 100000);
  assert.equal(defLaw.k, 256);
  assert.ok(defLaw.batchSize > qualLaw.batchSize, 'quality law uses smaller batch than default law');
  // At n > 2,000,000, default mode divides c_B (0.035) by 8 (= 0.004375), matching quality scale (~0.0044)
  assert.ok(Math.abs(largeNDef.batchSize - largeNQual.batchSize) / largeNQual.batchSize < 0.02);
  assert.ok(defLaw.alpha0 > 0 && defLaw.alpha0 <= 1.0);
  assert.equal(Number((defLaw.alpha0 * 0.1).toFixed(6)), defLaw.alphaFinal);
});

test('cosineStepSchedule anneals smoothly from alpha0 to 0.1 * alpha0', () => {
  const alpha0 = 0.8;
  assert.ok(Math.abs(cosineStepSchedule(alpha0, 0) - 0.8) < 1e-9);
  assert.ok(Math.abs(cosineStepSchedule(alpha0, 1) - 0.08) < 1e-9);
  const mid = cosineStepSchedule(alpha0, 0.5);
  assert.ok(mid < 0.8 && mid > 0.08);
});

test('emeansCluster validates input vectors, recalculates step on batchSize override, revives at batchSize=1, and preserves MSE precision', () => {
  assert.throws(() => emeansCluster([[0, 0], [1]], 1), /inconsistent dimension/);
  assert.throws(() => emeansCluster([[0, NaN]], 1), /finite number/);

  // Precision preservation on tiny MSE: [[0], [0.001]] with k=1 has exact centroid [0.0005] and MSE 0.00000025
  const tiny = emeansCluster([[0], [0.001]], 1, { epochs: 2 });
  assert.ok(Math.abs(tiny.mse - 0.00000025) < 1e-12);
  assert.equal(tiny.mseRounded, 0);

  // Batch size override recalculates alpha0 and revives dead clusters even at batchSize=1
  const revived = emeansCluster([[10], [10.1], [9.9], [10.05]], 2, {
    batchSize: 1,
    epochs: 4,
    initialCentroids: [[-100], [-100]],
    seed: 11,
  });
  assert.ok(revived.revivalsTriggered >= 1, 'Expected dead-cluster revival at batchSize=1');

  const centers = [
    [0, 0],
    [10, 10],
    [-10, 10],
    [10, -10],
  ];
  const vectors = [];
  for (let c = 0; c < centers.length; c++) {
    const count = c === 0 ? 120 : c === 3 ? 20 : 40;
    for (let i = 0; i < count; i++) {
      const offset = ((i % 7) - 3) * 0.1;
      vectors.push([centers[c][0] + offset, centers[c][1] - offset]);
    }
  }

  const res = emeansCluster(vectors, 4, { epochs: 4, seed: 7 });
  assert.equal(res.centroids.length, 4);
  assert.equal(res.labels.length, vectors.length);
  assert.equal(res.deadClusters, 0);
  assert.ok(res.mse < 0.25, `Expected low MSE, got ${res.mse}`);
});

test('evaluateCodebookQuantizationTier models @shinboson Qwen3.5-4B 8.41GB -> 1.23GB e-means codebook regime and checks available memory', () => {
  const report = evaluateCodebookQuantizationTier({
    modelName: 'Qwen3.5-4B',
    paramsBillions: 4.0,
    baseBytesGb: 8.41,
    quantizedBytesGb: 1.23,
    retainedQualityPct: 91.9,
    availableUnifiedMemoryGb: 16.0,
  });

  assert.equal(report.compressionRatio, 6.84);
  assert.equal(report.effectiveBitsPerWeight, 2.46);
  assert.equal(report.bandwidthBottleneckEliminated, true);
  assert.equal(report.fitsInAvailableMemory, true);
  assert.equal(report.macFreezeSafe, true);
  assert.equal(report.sotaComparable, true);
  assert.equal(report.recommendedLane, 'local_apple_silicon_zero_cost');

  const lowMem = evaluateCodebookQuantizationTier({
    quantizedBytesGb: 1.23,
    availableUnifiedMemoryGb: 0.5,
  });
  assert.equal(lowMem.fitsInAvailableMemory, false);
  assert.equal(lowMem.macFreezeSafe, false);
  assert.equal(lowMem.recommendedLane, 'hybrid_workhorse_fallback');
});

test('whatsapp-instinct-driver strictly locks to Instinct JID/phone and blocks any other WhatsApp contact', () => {
  const okTarget = assertInstinctTargetOnly({
    phone: INSTINCT_PHONE,
    jid: INSTINCT_JID,
    sessionPk: INSTINCT_SESSION_PK,
  });
  assert.equal(okTarget.phone, '16508702892');

  assert.throws(
    () => assertInstinctTargetOnly({ phone: '13055550199', jid: INSTINCT_JID, sessionPk: 3 }),
    /ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN/,
  );
  assert.throws(
    () => assertInstinctTargetOnly({ phone: INSTINCT_PHONE, jid: '15320282624233@lid', sessionPk: 8 }),
    /ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN/,
  );
});

test('whatsapp-instinct-driver enforces mac-yolo-safeguards product boundary and blocks direct or compound outreach', () => {
  const validPrompt = validateInstinctPrompt(
    'Never send emails, texts, or invites. Find 5 public GitHub issues where Claude Code or Cursor freezes macOS.',
  );
  assert.ok(validPrompt.startsWith(`[PRODUCT: ${PRODUCT_ID}]`));

  assert.throws(
    () => validateInstinctPrompt('Please send an email to my contacts about ThumbGate'),
    /ERR_EXTERNAL_OUTREACH_FORBIDDEN/,
  );
  assert.throws(
    () => validateInstinctPrompt('Email Alice the mac-yolo-safeguards report'),
    /ERR_EXTERNAL_OUTREACH_FORBIDDEN/,
  );
  assert.throws(
    () => validateInstinctPrompt('Never send an email to Bob; send an email to Alice about ThumbGate'),
    /ERR_EXTERNAL_OUTREACH_FORBIDDEN/,
  );
  assert.throws(
    () => validateInstinctPrompt('Summarize the latest meeting notes'),
    /ERR_CROSS_PRODUCT_MIX_FORBIDDEN/,
  );
  assert.throws(
    () => validateInstinctPrompt('Find foreclosure and tax-deed buyers in Miami-Dade and Broward'),
    /ERR_CROSS_PRODUCT_MIX_FORBIDDEN/,
  );
});

test('extractStructuredIntelFromMessages uses turn provenance and rejects unrelated replies even if they mention the product', () => {
  assert.equal(isMacYoloSafeguardsMessage('Mac freeze from 309 orphaned git processes in claude-code'), true);
  assert.equal(
    isMacYoloSafeguardsMessage('Foreclosure project: mac-yolo-safeguards is not involved; see https://example.test'),
    false,
  );

  const intel = extractStructuredIntelFromMessages([
    {
      pk: 170,
      isFromMe: true,
      timestamp: '2026-11-11T18:56:43Z',
      text: '[PRODUCT: mac-yolo-safeguards] Check https://thumbgate.app',
    },
    {
      pk: 171,
      isFromMe: false,
      timestamp: '2026-11-11T18:56:53Z',
      text: 'Done; I will investigate https://github.com/anthropics/claude-code/issues/108551.',
    },
    {
      pk: 195,
      isFromMe: true,
      timestamp: '2026-11-11T19:02:00Z',
      text: 'Check Broward foreclosure filings',
    },
    {
      pk: 196,
      isFromMe: false,
      timestamp: '2026-11-11T19:02:16Z',
      text: 'Foreclosure and tax-deed auction properties in Miami-Dade and Broward: https://monceaurealty.com/',
    },
  ]);
  assert.equal(intel.productId, 'mac-yolo-safeguards');
  assert.equal(intel.assistantReplyCount, 1);
  assert.equal(intel.ignoredOtherProductCount, 1);
  assert.deepEqual(intel.extractedUrls, [
    'https://thumbgate.app',
    'https://github.com/anthropics/claude-code/issues/108551',
  ]);
});

test('happenstance-bridge-network-engine permanently forbids unattended outreach', () => {
  assert.equal(ALLOW_UNATTENDED_OUTREACH, false);
  assert.throws(() => assertNoUnattendedOutreach('auto-send'), /ERR_UNATTENDED_NETWORK_OUTREACH_FORBIDDEN/);
});

test('classifyEmpiricalFreezeSignature detects all 5 real-world macOS coding-agent freeze modes', () => {
  const nominal = classifyEmpiricalFreezeSignature({ orphanedGitCount: 2, swapUsedGb: 1.5 });
  assert.equal(nominal.freezeRisk, 'nominal');
  assert.equal(nominal.matchedCount, 0);

  const storm = classifyEmpiricalFreezeSignature({
    orphanedGitCount: 309,
    nodeReplOrHelperCount: 85,
    maxIdleCliRssGb: 8.7,
    maxIdleCliCpuPct: 95,
    swapUsedGb: 16.0,
    claudeVmDiskGb: 100.0,
  });
  assert.equal(storm.freezeRisk, 'critical');
  assert.equal(storm.matchedCount, 5);
});

test('gemini-decisions-engine builds valid noul/choice/score payloads, escalates low-confidence tool calls, and scores commercial batches', () => {
  const req = buildGeminiDecisionsRequest({
    input: [{ type: 'text', text: 'Check tool call safety' }],
    questions: {
      is_safe: { type: 'bool', instructions: 'Is this command read-only?' },
      lane: {
        type: 'choice',
        instructions: 'Which lane fits?',
        criteria: { local: 'Local lane', cloud: 'Cloud lane' },
      },
      risk: {
        type: 'score',
        instructions: 'Rate risk',
        criteria: ['Low', 'Medium', 'High'],
      },
    },
  });
  assert.equal(req.model, GEMINI_DECISION_MODEL);
  assert.equal(req.questions.is_safe.type, 'noul');

  const rubric = scoreOrderedRubric([0.1, 0.2, 0.7]);
  assert.ok(rubric.weightedScore > 1.5);
  assert.ok(rubric.confidence > 0 && rubric.confidence <= 1);

  const econ = estimateDecisionPassEconomics({ sharedInputTokens: 2000, questionCount: 20 });
  assert.equal(econ.totalOutputTokensBilled, 0);
  assert.ok(econ.costReductionRatio >= 3.0);

  const blockedOutreach = evaluatePreActionDecisionPack({
    toolName: 'bash',
    command: 'python3 google_api.py gmail send --to test@example.com',
  });
  assert.equal(blockedOutreach.decisions.interdiction_action.choice, 'hard_block_fail_closed');
  assert.equal(blockedOutreach.decisions.is_destructive_or_irreversible.answer, true);

  const ambiguousEscalated = evaluatePreActionDecisionPack(
    {
      toolName: 'bash',
      command: 'launchctl bootout gui/501/com.example.service',
    },
    { confidenceThreshold: 0.8 },
  );
  assert.equal(ambiguousEscalated.decisions.interdiction_action.choice, 'require_thumbgate_phone_approval');
  assert.equal(ambiguousEscalated.decisions.interdiction_action.escalatedDueToLowConfidence, true);

  const batch = evaluateCommercialOpportunityBatch([
    {
      id: 'claude-108551',
      url: 'https://github.com/anthropics/claude-code/issues/108551',
      summary: '309 orphaned git processes causing macOS freeze and swap exhaustion',
    },
    {
      id: 'unrelated-foreclosure',
      url: 'https://example.test/foreclosure',
      summary: 'Broward foreclosure tax-deed auction listing',
    },
  ]);
  assert.equal(batch.totalQuestionsInSinglePass, 6);
  assert.equal(batch.unattendedOutreachAllowed, false);
  assert.equal(batch.rankedOpportunities[0].id, 'claude-108551');
  assert.equal(batch.rankedOpportunities[1].offerLane, 'ignore_out_of_scope');
});
