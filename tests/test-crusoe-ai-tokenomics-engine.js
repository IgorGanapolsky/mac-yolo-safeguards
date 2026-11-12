#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  evaluateAgenticTokenomics,
  routeZeroSpendCrusoeOrLocal,
  validateWorkerRestoreContract,
  estimateArtifactPullAndUnpack,
} = require('../tools/crusoe-ai-tokenomics-engine');

function main() {
  // 1. 4-metric Agentic Tokenomics: KV-cache 97.6% input discount + goodput + cost per completed task
  const econ = evaluateAgenticTokenomics({
    modelId: 'deepseek-ai/DeepSeek-V4.1-Flash',
    uncachedInputTokens: 100_000,
    cachedInputTokens: 900_000,
    outputTokens: 50_000,
    retryOrThrashTokens: 210_000,
    completedTasks: 2,
    avgWatts: 400,
    wallSeconds: 12,
  });
  assert.strictEqual(econ.ok, true);
  assert.strictEqual(econ.metrics.kvCacheHitRatio, 0.9);
  // Uncached baseline = 1M * $0.29 + 0.05M * $1.20 = $0.35; actual = 0.1M*$0.29 + 0.9M*$0.007 + 0.05M*$1.20 = 0.029 + 0.0063 + 0.06 = $0.0953
  assert.strictEqual(econ.metrics.actualComputeUsd, 0.0953);
  assert.strictEqual(econ.metrics.kvCacheSavingsUsd, 0.2547);
  assert.strictEqual(econ.metrics.costPerCompletedTaskUsd, 0.04765);
  assert.strictEqual(econ.metrics.goodputRatio, 0.8);
  assert.strictEqual(econ.lowGoodputWarning, false);

  // Zero completed tasks triggers burn warning and null costPerCompletedTaskUsd
  const zeroDone = evaluateAgenticTokenomics({
    modelId: 'zai-org/GLM-5.3',
    uncachedInputTokens: 200_000,
    cachedInputTokens: 0,
    outputTokens: 20_000,
    retryOrThrashTokens: 150_000,
    completedTasks: 0,
  });
  assert.strictEqual(zeroDone.metrics.costPerCompletedTaskUsd, null);
  assert.strictEqual(zeroDone.zeroCompletedTaskBurnWarning, true);
  assert.strictEqual(zeroDone.lowGoodputWarning, true);

  // 2. Strict $0 Outbound Cash Spend Router
  const burstFree = routeZeroSpendCrusoeOrLocal({
    preferredModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    apiKeyPresent: true,
    quotaAvailable: true,
    paymentMethodAttached: false,
    freeCreditsRemainingUsd: 5.0,
    estimatedInputTokens: 100_000,
    estimatedCacheHitRatio: 0.8,
    estimatedOutputTokens: 4_000,
  });
  assert.strictEqual(burstFree.route, 'crusoe_intelligence_foundry_free_credits');
  assert.strictEqual(burstFree.outboundCashSpendUsd, 0);
  assert.ok(burstFree.creditBurnEstimateUsd > 0 && burstFree.freeCreditsAfterUsd < 5.0);

  // Hard block if a payment card is attached (could incur real cash spend!)
  const cardAttached = routeZeroSpendCrusoeOrLocal({
    apiKeyPresent: true,
    quotaAvailable: true,
    paymentMethodAttached: true,
    freeCreditsRemainingUsd: 5.0,
  });
  assert.strictEqual(cardAttached.route, 'local_apple_silicon_zero_spend');
  assert.strictEqual(cardAttached.outboundCashSpendUsd, 0);
  assert.strictEqual(cardAttached.fallbackReason, 'payment_method_attached_blocked_by_zero_spend_policy');

  // Hard fallback when quota is absent ("No Infrastructure Cloud quota")
  const noQuota = routeZeroSpendCrusoeOrLocal({
    apiKeyPresent: true,
    quotaAvailable: false,
    paymentMethodAttached: false,
    freeCreditsRemainingUsd: 5.0,
  });
  assert.strictEqual(noQuota.route, 'local_apple_silicon_zero_spend');
  assert.strictEqual(noQuota.fallbackReason, 'crusoe_quota_absent');

  // 3. Snapshot Pre-Restore Contract & Last-Fatal-Error extraction (ai-dynamo/snapshot#532)
  const snapFail = validateWorkerRestoreContract(
    { mounts: ['/cache/vllm', '/mnt/nvme'], requiredEnvKeys: ['CRUSOE_API_KEY'] },
    { mounts: ['/mnt/nvme'], presentEnvKeys: ['CRUSOE_API_KEY'] },
    '00:01 WARN binfmt_misc: Operation not permitted\n00:02 Error: Can\'t stat mountpoint /cache/vllm: No such file or directory\n',
  );
  assert.strictEqual(snapFail.ok, false);
  assert.deepStrictEqual(snapFail.missingMounts, ['/cache/vllm']);
  assert.ok(snapFail.ignoredEarlyWarning.includes('binfmt_misc'));
  assert.ok(snapFail.lastFatalError.includes('/cache/vllm'));

  const snapOk = validateWorkerRestoreContract(
    { mounts: ['/cache/vllm'], requiredEnvKeys: ['CRUSOE_API_KEY'] },
    { mounts: ['/cache/vllm', '/tmp'], presentEnvKeys: ['CRUSOE_API_KEY'] },
    '00:01 INFO restore completed in 15.0s at 40 GB/s\n',
  );
  assert.strictEqual(snapOk.ok, true);

  // 4. zstd + containerd 2.2 parallel unpack estimator
  const zstd = estimateArtifactPullAndUnpack({ imageSizeGb: 13.0, parallelUnpacks: 8 });
  assert.strictEqual(zstd.ok, true);
  assert.ok(zstd.speedupFactor > 4.0);
  assert.ok(zstd.cpuSecondsSaved > 80);

  // 5. Prototype-key, local-model, insufficient-credit, overflow & null-payload resilience + MCP & HTTP verification
  const malformed = evaluateAgenticTokenomics({
    modelId: 'constructor',
    uncachedInputTokens: 'not-a-number',
    cachedInputTokens: NaN,
    outputTokens: -999,
    avgWatts: 'bad',
    wallSeconds: Infinity,
  });
  assert.strictEqual(malformed.modelId, 'deepseek-ai/DeepSeek-V4.1-Flash');
  assert.strictEqual(malformed.metrics.totalTokens, 0);
  assert.strictEqual(Number.isFinite(malformed.metrics.actualComputeUsd), true);

  const arrayModel = evaluateAgenticTokenomics({ modelId: ['toString'], uncachedInputTokens: 1e308, cachedInputTokens: 1e308, avgWatts: 1e200, wallSeconds: 1e200 });
  assert.strictEqual(Number.isFinite(arrayModel.metrics.tokensPerWattHour), true);
  assert.strictEqual(Number.isFinite(arrayModel.metrics.actualComputeUsd), true);

  const insufficientCredits = routeZeroSpendCrusoeOrLocal({
    preferredModel: 'constructor',
    estimatedInputTokens: null,
    estimatedOutputTokens: '',
    apiKeyPresent: true,
    quotaAvailable: true,
    paymentMethodAttached: false,
    freeCreditsRemainingUsd: 0.0001,
  });
  assert.strictEqual(insufficientCredits.route, 'local_apple_silicon_zero_spend');
  assert.strictEqual(insufficientCredits.fallbackReason, 'insufficient_free_credits_for_request');

  const localExplicit = routeZeroSpendCrusoeOrLocal({
    preferredModel: 'local/apple-silicon-mlx',
    apiKeyPresent: true,
    quotaAvailable: true,
    paymentMethodAttached: false,
    freeCreditsRemainingUsd: 10,
  });
  assert.strictEqual(localExplicit.route, 'local_apple_silicon_zero_spend');
  assert.strictEqual(localExplicit.baseUrl, 'http://127.0.0.1:11434/v1/');

  const { callTool } = require('../tools/mac-yolo-mcp-server');
  const { routeRequest } = require('../tools/mac-yolo-service');
  const mcpOut = callTool('yolo_crusoe_tokenomics', { mode: 'zstd_unpack', payload: { imageSizeGb: 7 } });
  assert.strictEqual(mcpOut.ok, true);
  const nullSnap = routeRequest('POST', '/api/tokenomics/crusoe', {
    mode: 'snapshot_contract',
    payload: { snapshotSpec: null, restoreSpec: null },
  });
  assert.strictEqual(nullSnap.status, 200);
  assert.strictEqual(nullSnap.body.ok, true);
  const httpOut = routeRequest('GET', '/api/tokenomics/crusoe?mode=route');
  assert.strictEqual(httpOut.status, 200);
  assert.strictEqual(httpOut.body.outboundCashSpendUsd, 0);

  console.log('test-crusoe-ai-tokenomics-engine: PASS (6/6)');
}

main();
