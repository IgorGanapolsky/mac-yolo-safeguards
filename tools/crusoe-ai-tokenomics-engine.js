#!/usr/bin/env node
'use strict';

/**
 * tools/crusoe-ai-tokenomics-engine.js
 *
 * Architectural steals from Crusoe Cloud (Nov 2026):
 *   1. 4-Metric Agentic AI Tokenomics (`crusoe.ai/ai-tokenomics`):
 *      - `costPerTokenUsd` (with Intelligence Foundry KV-cache pricing, e.g. DeepSeek V4.1 Flash $0.007/1M cached vs $0.29/1M uncached — 97.6% KV-cache discount)
 *      - `goodputRatio` (tokens advancing verified task completion vs retry/thrash tokens)
 *      - `costPerCompletedTaskUsd` (`totalSpendUsd / completedTasks`)
 *      - `tokensPerWattTier` (Apple Silicon local ANE/GPU $0 tier vs Crusoe stranded-energy Foundry burst tier)
 *   2. Zero-Outbound-Spend Intelligence Foundry Router (`outboundCashSpendUsd === 0`):
 *      Routes burst open-weight inference (`https://api.inference.crusoecloud.com/v1/`) ONLY on non-card free/partner credits (`freeCreditsRemainingUsd > 0 && paymentMethodAttached === false`), failing closed to $0 local Apple Silicon MLX/Ollama otherwise.
 *   3. Pre-Restore Snapshot Contract & Last-Fatal-Error Diagnostics (`ai-dynamo/snapshot#532`, Nov 10, 2026):
 *      Verifies external mount/path contracts BEFORE restoring/starting a worker and reports the last fatal error in `restore.log` rather than misleading early warnings (`binfmt_misc: Operation not permitted`).
 *   4. zstd + Parallel Unpack Cold-Pull Estimator (Crusoe CMK benchmark, Nov 6, 2026):
 *      Quantifies cold-start pull & CPU decompression savings (`7.2x` raw decompression, `4.43x` cold pull with `max_concurrent_unpacks=8`, `~4x` less CPU).
 */

const CRUSOE_FOUNDRY_BASE_URL = 'https://api.inference.crusoecloud.com/v1/';

const CRUSOE_FOUNDRY_MODELS = Object.freeze({
  'deepseek-ai/DeepSeek-V4.1-Flash': {
    id: 'deepseek-ai/DeepSeek-V4.1-Flash',
    contextWindowTokens: 1_000_000,
    modality: 'multimodal',
    inputPer1MUsd: 0.29,
    cachedInputPer1MUsd: 0.007,
    outputPer1MUsd: 1.2,
  },
  'zai-org/GLM-5.3-Flash': {
    id: 'zai-org/GLM-5.3-Flash',
    contextWindowTokens: 1_000_000,
    modality: 'text',
    inputPer1MUsd: 0.14,
    cachedInputPer1MUsd: 0.014,
    outputPer1MUsd: 0.56,
  },
  'zai-org/GLM-5.3': {
    id: 'zai-org/GLM-5.3',
    contextWindowTokens: 1_000_000,
    modality: 'text',
    inputPer1MUsd: 0.55,
    cachedInputPer1MUsd: 0.055,
    outputPer1MUsd: 2.19,
  },
  'Qwen/Qwen3.8-27B': {
    id: 'Qwen/Qwen3.8-27B',
    contextWindowTokens: 131_072,
    modality: 'text',
    inputPer1MUsd: 0.12,
    cachedInputPer1MUsd: 0.012,
    outputPer1MUsd: 0.36,
  },
  'local/apple-silicon-mlx': {
    id: 'local/apple-silicon-mlx',
    contextWindowTokens: 131_072,
    modality: 'text',
    inputPer1MUsd: 0,
    cachedInputPer1MUsd: 0,
    outputPer1MUsd: 0,
  },
});

function finiteNonNeg(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function round6(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 1_000_000) / 1_000_000 : 0;
}

function evaluateAgenticTokenomics(input = {}) {
  const modelId = input.modelId && CRUSOE_FOUNDRY_MODELS[input.modelId]
    ? input.modelId
    : 'deepseek-ai/DeepSeek-V4.1-Flash';
  const spec = CRUSOE_FOUNDRY_MODELS[modelId];

  const uncachedInputTokens = finiteNonNeg(input.uncachedInputTokens, 0);
  const cachedInputTokens = finiteNonNeg(input.cachedInputTokens, 0);
  const outputTokens = finiteNonNeg(input.outputTokens, 0);
  const retryOrThrashTokens = finiteNonNeg(input.retryOrThrashTokens, 0);
  const completedTasks = Math.floor(finiteNonNeg(input.completedTasks, 0));
  const avgWatts = Math.max(1, finiteNonNeg(input.avgWatts, modelId.startsWith('local/') ? 28 : 450));
  const wallSeconds = Math.max(0.001, finiteNonNeg(input.wallSeconds, 10));
  const totalInputTokens = uncachedInputTokens + cachedInputTokens;
  const totalTokens = totalInputTokens + outputTokens;
  const productiveTokens = Math.max(0, totalTokens - Math.min(totalTokens, retryOrThrashTokens));

  const uncachedBaselineUsd =
    (totalInputTokens / 1_000_000) * spec.inputPer1MUsd +
    (outputTokens / 1_000_000) * spec.outputPer1MUsd;

  const actualComputeUsd =
    (uncachedInputTokens / 1_000_000) * spec.inputPer1MUsd +
    (cachedInputTokens / 1_000_000) * spec.cachedInputPer1MUsd +
    (outputTokens / 1_000_000) * spec.outputPer1MUsd;

  const kvCacheSavingsUsd = Math.max(0, uncachedBaselineUsd - actualComputeUsd);
  const kvCacheHitRatio = totalInputTokens > 0 ? round6(cachedInputTokens / totalInputTokens) : 0;
  const goodputRatio = totalTokens > 0 ? round6(productiveTokens / totalTokens) : 1;
  const costPerTokenUsd = totalTokens > 0 ? Number((actualComputeUsd / totalTokens).toExponential(4)) : 0;

  const joules = avgWatts * wallSeconds;
  const wattHours = joules / 3600;
  const tokensPerWattSecond = round6(productiveTokens / joules);
  const tokensPerWattHour = Math.round(wattHours > 0 ? productiveTokens / wattHours : 0);

  const costPerCompletedTaskUsd = completedTasks > 0 ? round6(actualComputeUsd / completedTasks) : null;

  return {
    ok: true,
    modelId,
    metrics: {
      totalTokens,
      productiveTokens,
      retryOrThrashTokens,
      kvCacheHitRatio,
      goodputRatio,
      actualComputeUsd: round6(actualComputeUsd),
      kvCacheSavingsUsd: round6(kvCacheSavingsUsd),
      costPerTokenUsd,
      costPerCompletedTaskUsd,
      tokensPerWattSecond,
      tokensPerWattHour,
    },
    zeroCompletedTaskBurnWarning: completedTasks === 0 && totalTokens > 0,
    lowGoodputWarning: totalTokens > 0 && goodputRatio < 0.7,
  };
}

function routeZeroSpendCrusoeOrLocal(request = {}) {
  const modelId =
    request.preferredModel && CRUSOE_FOUNDRY_MODELS[request.preferredModel]
      ? request.preferredModel
      : 'deepseek-ai/DeepSeek-V4.1-Flash';
  const estInputTokens = finiteNonNeg(request.estimatedInputTokens, 20_000);
  const estCachedRatio = Math.min(1, finiteNonNeg(request.estimatedCacheHitRatio, 0.8));
  const estOutputTokens = finiteNonNeg(request.estimatedOutputTokens, 2_000);
  const econ = evaluateAgenticTokenomics({
    modelId,
    uncachedInputTokens: Math.round(estInputTokens * (1 - estCachedRatio)),
    cachedInputTokens: Math.round(estInputTokens * estCachedRatio),
    outputTokens: estOutputTokens,
    completedTasks: 1,
  });

  const apiKeyPresent = Boolean(request.apiKeyPresent);
  const quotaAvailable = request.quotaAvailable !== false;
  const paymentMethodAttached = Boolean(request.paymentMethodAttached);
  const freeCreditsRemainingUsd = finiteNonNeg(request.freeCreditsRemainingUsd, 0);
  const neededCreditsUsd = econ.metrics.actualComputeUsd;

  // Hard $0 Outbound Cash Spend Invariant: NEVER route to external cloud if a payment card could be billed
  // or if free/partner credits cannot cover the request.
  if (
    apiKeyPresent &&
    quotaAvailable &&
    !paymentMethodAttached &&
    freeCreditsRemainingUsd > 0 &&
    freeCreditsRemainingUsd >= neededCreditsUsd
  ) {
    return {
      ok: true,
      route: 'crusoe_intelligence_foundry_free_credits',
      baseUrl: CRUSOE_FOUNDRY_BASE_URL,
      modelId,
      outboundCashSpendUsd: 0,
      creditBurnEstimateUsd: neededCreditsUsd,
      freeCreditsAfterUsd: round6(freeCreditsRemainingUsd - neededCreditsUsd),
      fallbackReason: null,
    };
  }

  let fallbackReason = 'no_free_credits_remaining';
  if (paymentMethodAttached) fallbackReason = 'payment_method_attached_blocked_by_zero_spend_policy';
  else if (!quotaAvailable) fallbackReason = 'crusoe_quota_absent';
  else if (!apiKeyPresent) fallbackReason = 'crusoe_api_key_absent';

  return {
    ok: true,
    route: 'local_apple_silicon_zero_spend',
    baseUrl: 'http://127.0.0.1:11434/v1/',
    modelId: 'local/apple-silicon-mlx',
    outboundCashSpendUsd: 0,
    creditBurnEstimateUsd: 0,
    freeCreditsAfterUsd: round6(freeCreditsRemainingUsd),
    fallbackReason,
  };
}

function validateWorkerRestoreContract(snapshotSpec = {}, restoreSpec = {}, restoreLogText = '') {
  const srcMounts = Array.isArray(snapshotSpec.mounts) ? snapshotSpec.mounts.map(String) : [];
  const dstMounts = new Set(Array.isArray(restoreSpec.mounts) ? restoreSpec.mounts.map(String) : []);
  const missingMounts = srcMounts.filter((m) => !dstMounts.has(m));

  const srcEnvKeys = Array.isArray(snapshotSpec.requiredEnvKeys) ? snapshotSpec.requiredEnvKeys.map(String) : [];
  const dstEnvKeys = new Set(Array.isArray(restoreSpec.presentEnvKeys) ? restoreSpec.presentEnvKeys.map(String) : []);
  const missingEnvKeys = srcEnvKeys.filter((k) => !dstEnvKeys.has(k));

  // Stolen from Crusoe PR ai-dynamo/snapshot#532: read from the end of restore.log to surface the
  // last fatal error (e.g. missing /cache/vllm mount) rather than earlier non-fatal warnings like binfmt_misc.
  const lines = String(restoreLogText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let lastFatalError = null;
  let ignoredEarlyWarning = null;
  for (const ln of lines) {
    if (/binfmt_misc:\s*Operation not permitted/i.test(ln)) {
      ignoredEarlyWarning = ln;
    }
  }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const ln = lines[i];
    if (/binfmt_misc:\s*Operation not permitted/i.test(ln)) continue;
    if (/\b(Error|FATAL|panic|Can't stat mountpoint|No such file or directory|failed to restore)\b/i.test(ln)) {
      lastFatalError = ln;
      break;
    }
  }

  const ready = missingMounts.length === 0 && missingEnvKeys.length === 0 && !lastFatalError;
  const diagnostic = !ready
    ? missingMounts.length > 0
      ? `Restore target is missing mount(s): ${missingMounts.join(', ')}`
      : missingEnvKeys.length > 0
        ? `Restore target is missing required env key(s): ${missingEnvKeys.join(', ')}`
        : lastFatalError
    : 'Restore contract satisfied';

  return {
    ok: ready,
    missingMounts,
    missingEnvKeys,
    lastFatalError,
    ignoredEarlyWarning,
    diagnostic,
  };
}

function estimateArtifactPullAndUnpack(options = {}) {
  const imageSizeGb = Math.max(0.1, finiteNonNeg(options.imageSizeGb, 7.0));
  const currentFormat = options.currentFormat === 'zstd' ? 'zstd' : 'gzip';
  const parallelUnpacks = Math.max(1, Math.min(16, Math.floor(finiteNonNeg(options.parallelUnpacks, 8))));
  // Grounded in Crusoe Nov 6, 2026 CMK benchmark (gzip 95 MB/s vs zstd 681 MB/s, 18% size reduction, 4x less CPU)
  const uncompressedMb = imageSizeGb * 1024;
  const gzipPullSeconds = round6((imageSizeGb / 7.0) * 112.7);
  const zstdDefaultPullSeconds = round6((imageSizeGb / 7.0) * 38.3);
  const parallelFactor = parallelUnpacks >= 8 ? 0.62 : parallelUnpacks >= 4 ? 0.76 : 1.0;
  const zstdTunedPullSeconds = round6(zstdDefaultPullSeconds * parallelFactor);

  const gzipCpuSeconds = round6((uncompressedMb / 512) * 5.27);
  const zstdCpuSeconds = round6((uncompressedMb / 512) * 1.31);

  return {
    ok: true,
    imageSizeGb,
    currentFormat,
    parallelUnpacks,
    gzipPullSeconds,
    zstdTunedPullSeconds,
    speedupFactor: round6(gzipPullSeconds / Math.max(0.1, zstdTunedPullSeconds)),
    cpuSecondsSaved: round6(Math.max(0, gzipCpuSeconds - zstdCpuSeconds)),
    compressedSizeReductionPct: 18,
    recommendedBuildxFlags:
      '--output type=image,compression=zstd,compression-level=3,force-compression=true',
    recommendedContainerdConfig:
      "[plugins.'io.containerd.transfer.v1.local'] max_concurrent_downloads = 8, max_concurrent_unpacks = 8",
  };
}

if (require.main === module) {
  const sample = {
    tokenomics: evaluateAgenticTokenomics({
      modelId: 'deepseek-ai/DeepSeek-V4.1-Flash',
      uncachedInputTokens: 50_000,
      cachedInputTokens: 450_000,
      outputTokens: 12_000,
      retryOrThrashTokens: 18_000,
      completedTasks: 3,
    }),
    routingWithFreeCredits: routeZeroSpendCrusoeOrLocal({
      apiKeyPresent: true,
      quotaAvailable: true,
      paymentMethodAttached: false,
      freeCreditsRemainingUsd: 5.0,
    }),
    routingWithoutCredits: routeZeroSpendCrusoeOrLocal({
      apiKeyPresent: true,
      quotaAvailable: false,
      paymentMethodAttached: false,
      freeCreditsRemainingUsd: 0,
    }),
    snapshotCheck: validateWorkerRestoreContract(
      { mounts: ['/cache/vllm', '/models'] },
      { mounts: ['/models'] },
      'WARN binfmt_misc: Operation not permitted\nError: Can\'t stat mountpoint /cache/vllm: No such file or directory',
    ),
    zstdUnpack: estimateArtifactPullAndUnpack({ imageSizeGb: 7.0, parallelUnpacks: 8 }),
  };
  console.log(JSON.stringify(sample, null, 2));
}

module.exports = {
  CRUSOE_FOUNDRY_BASE_URL,
  CRUSOE_FOUNDRY_MODELS,
  evaluateAgenticTokenomics,
  routeZeroSpendCrusoeOrLocal,
  validateWorkerRestoreContract,
  estimateArtifactPullAndUnpack,
};
