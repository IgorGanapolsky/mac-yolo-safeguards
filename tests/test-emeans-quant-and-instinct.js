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

test('deriveEmeansScalingLaws computes automatic batch size B and alpha0 without manual tuning', () => {
  const defLaw = deriveEmeansScalingLaws({ n: 100000, k: 256, epochs: 5, mode: 'default' });
  const qualLaw = deriveEmeansScalingLaws({ n: 100000, k: 256, epochs: 5, mode: 'quality' });

  assert.equal(defLaw.n, 100000);
  assert.equal(defLaw.k, 256);
  assert.ok(defLaw.batchSize > qualLaw.batchSize, 'quality law uses smaller batch than default law');
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

test('emeansCluster converges accurately on synthetic blobs and eliminates dead clusters via proportional split', () => {
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

test('evaluateCodebookQuantizationTier models @shinboson Qwen3.5-4B 8.41GB -> 1.23GB e-means codebook regime', () => {
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
  assert.equal(report.macFreezeSafe, true);
  assert.equal(report.sotaComparable, true);
  assert.equal(report.recommendedLane, 'local_apple_silicon_zero_cost');
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

test('whatsapp-instinct-driver enforces mac-yolo-safeguards product boundary and blocks outreach or cross-product mixing', () => {
  const validPrompt = validateInstinctPrompt(
    'Never send emails, texts, or invites. Find 5 public GitHub issues where Claude Code or Cursor freezes macOS.',
  );
  assert.ok(validPrompt.startsWith(`[PRODUCT: ${PRODUCT_ID}]`));

  assert.throws(
    () => validateInstinctPrompt('Please send an email to my contacts about ThumbGate'),
    /ERR_EXTERNAL_OUTREACH_FORBIDDEN/,
  );

  assert.throws(
    () => validateInstinctPrompt('Find foreclosure and tax-deed buyers in Miami-Dade and Broward'),
    /ERR_CROSS_PRODUCT_MIX_FORBIDDEN/,
  );
});

test('extractStructuredIntelFromMessages keeps mac-yolo-safeguards replies and ignores concurrent products in Instinct thread', () => {
  assert.equal(isMacYoloSafeguardsMessage('Mac freeze from 309 orphaned git processes in claude-code'), true);
  assert.equal(isMacYoloSafeguardsMessage('Foreclosure and tax-deed auction properties in Broward'), false);

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
      text: 'Claude Code issue for mac-yolo-safeguards: https://github.com/anthropics/claude-code/issues/108551.',
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

