#!/usr/bin/env node
'use strict';

/**
 * emeans-quant-router.js — e-means Clustering & Codebook Quantization Compiler Router
 *
 * Implements the two core breakthroughs from:
 *   1. Swann Bessa et al. (Meta FAIR / Ponts, arXiv:2611.09501, https://e-means.github.io/,
 *      `faiss.contrib.e_means`):
 *      - Exponential Moving Average (EMA) mini-batch centroid updates:
 *          S_j <- (1 - alpha) * S_j + alpha * s_j
 *          N_j <- (1 - alpha) * N_j + alpha * n_j
 *          c_j = S_j / N_j
 *        Keeps centroids inside the convex hull of assigned vectors (avoiding SGD overshoot)
 *        and reaches Lloyd's 25-epoch MSE in 1.6-2.4 epochs (~10x fewer epochs).
 *      - Zero-Hyperparameter Scaling Laws from (n, k, T):
 *          Default batch law: B = clamp(round(0.035 * k^0.13 * n^0.88 * T^0.81), 1, n)
 *          Quality batch law: B = clamp(round(0.0044 * k^0.13 * n^0.88 * T^0.81), 1, n)
 *          Step size law:     alpha_0 = min(0.824 * k^-0.46 * B^0.90 * n^-0.45 * T^-0.11, 1.0)
 *      - Cosine step annealing from alpha_0 -> 0.1 * alpha_0 + exact last-epoch mean finalization.
 *      - Proportional-Split Dead-Cluster Revival: revives clusters below threshold by sampling
 *        an active donor cluster proportional to N_j and splitting it into two.
 *
 *   2. @shinboson (https://x.com/shinboson/status/2120499242342985821):
 *      - Replacing k-means with e-means in quantization compiler codebook generation compresses
 *        Qwen3.5-4B from 8.41 GB -> 1.23 GB (~2.44 bits/weight effective, 6.84x compression)
 *        while retaining 91.9% of original performance.
 *      - At 1.23 GB, decode is no longer memory-bandwidth bound on consumer unified memory
 *        (Apple Silicon SLC / unified RAM), preventing macOS WindowServer swap freezes while
 *        keeping local agent inference fast and $0/token.
 */

function clamp(val, minVal, maxVal) {
  return Math.max(minVal, Math.min(maxVal, val));
}

/**
 * Derive automatic batch size B and initial EMA step size alpha_0 from (n, k, T)
 * using the e-means scaling laws (Table 1 of https://e-means.github.io/).
 */
function deriveEmeansScalingLaws({ n, k, epochs = 5, mode = 'default' }) {
  const numPoints = Math.max(1, Number(n) || 1);
  const numClusters = Math.max(1, Math.min(numPoints, Number(k) || 1));
  const T = Math.max(1, Number(epochs) || 5);

  const cB = mode === 'quality' ? 0.0044 : 0.035;
  const rawB =
    cB *
    Math.pow(numClusters, 0.13) *
    Math.pow(numPoints, 0.88) *
    Math.pow(T, 0.81);
  const batchSize = clamp(Math.round(rawB), 1, numPoints);

  const rawAlpha0 =
    0.824 *
    Math.pow(numClusters, -0.46) *
    Math.pow(batchSize, 0.90) *
    Math.pow(numPoints, -0.45) *
    Math.pow(T, -0.11);
  const alpha0 = clamp(rawAlpha0, 1e-4, 1.0);

  return {
    n: numPoints,
    k: numClusters,
    epochs: T,
    mode,
    batchSize,
    alpha0: Number(alpha0.toFixed(6)),
    alphaFinal: Number((0.1 * alpha0).toFixed(6)),
  };
}

/**
 * Cosine step schedule annealing alpha from alpha_0 to 0.1 * alpha_0 over [0, 1].
 */
function cosineStepSchedule(alpha0, progress) {
  const p = clamp(Number(progress) || 0, 0, 1);
  const cosineFactor = 0.5 * (1 + Math.cos(Math.PI * p));
  return 0.1 * alpha0 + 0.9 * alpha0 * cosineFactor;
}

function squaredEuclidean(a, b) {
  let sum = 0;
  for (let d = 0; d < a.length; d++) {
    const diff = a[d] - b[d];
    sum += diff * diff;
  }
  return sum;
}

function nearestCentroid(vec, centroids) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const dist = squaredEuclidean(vec, centroids[j]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = j;
    }
  }
  return { index: bestIdx, distanceSq: bestDist };
}

/**
 * Deterministic PRNG (Mulberry32) so clustering benchmarks and codebook generation are reproducible.
 */
function createRng(seed = 42) {
  let t = seed >>> 0;
  return function nextRand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run e-means clustering on a dataset of D-dimensional vectors.
 * Includes:
 *   - Scaling-law batch B & step alpha_0
 *   - Cosine decay from alpha_0 -> 0.1 * alpha_0
 *   - EMA sufficient statistics S_j, N_j with c_j = S_j / N_j
 *   - Proportional-split dead-cluster revival
 *   - Exact last-epoch mean finalization pass
 */
function emeansCluster(vectors, k, options = {}) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw new Error('emeansCluster requires a non-empty array of vectors');
  }
  const n = vectors.length;
  const dim = vectors[0].length;
  const numClusters = clamp(Math.round(Number(k) || 1), 1, n);
  const epochs = Math.max(1, Number(options.epochs) || 5);
  const mode = options.mode === 'quality' ? 'quality' : 'default';
  const reviveDead = options.reviveDead !== false;
  const finalizeExactMean = options.finalizeExactMean !== false;
  const rng = createRng(Number(options.seed) || 42);

  const law = deriveEmeansScalingLaws({ n, k: numClusters, epochs, mode });
  const batchSize = options.batchSize
    ? clamp(Math.round(Number(options.batchSize)), 1, n)
    : law.batchSize;
  const alpha0 = options.alpha0
    ? clamp(Number(options.alpha0), 1e-4, 1.0)
    : law.alpha0;

  // Initialize centroids from distinct random vectors (or provided initialCentroids)
  const centroids = [];
  if (Array.isArray(options.initialCentroids) && options.initialCentroids.length === numClusters) {
    for (let j = 0; j < numClusters; j++) {
      centroids.push(options.initialCentroids[j].slice());
    }
  } else {
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const swapIdx = Math.floor(rng() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[swapIdx];
      indices[swapIdx] = tmp;
    }
    for (let j = 0; j < numClusters; j++) {
      centroids.push(vectors[indices[j]].slice());
    }
  }

  const S = centroids.map((c) => c.slice());
  const N = new Array(numClusters).fill(1.0);

  const stepsPerEpoch = Math.max(1, Math.ceil(n / batchSize));
  const totalSteps = epochs * stepsPerEpoch;
  // Dead cluster threshold: max(1e-3 * (n / k), 0.5)
  const deadThreshold = Math.max(0.5, (n / numClusters) * 1e-3);
  let revivalsTriggered = 0;

  const order = Array.from({ length: n }, (_, i) => i);

  for (let step = 0; step < totalSteps; step++) {
    const progress = totalSteps > 1 ? step / (totalSteps - 1) : 1;
    const alpha = cosineStepSchedule(alpha0, progress);

    // Shuffle at the start of each epoch
    if (step % stepsPerEpoch === 0) {
      for (let i = order.length - 1; i > 0; i--) {
        const swapIdx = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[swapIdx];
        order[swapIdx] = tmp;
      }
    }

    const start = (step % stepsPerEpoch) * batchSize;
    const end = Math.min(n, start + batchSize);
    const batchSums = Array.from({ length: numClusters }, () => new Array(dim).fill(0));
    const batchCounts = new Array(numClusters).fill(0);

    for (let idx = start; idx < end; idx++) {
      const vec = vectors[order[idx]];
      const { index: cIdx } = nearestCentroid(vec, centroids);
      batchCounts[cIdx] += 1;
      const sumRow = batchSums[cIdx];
      for (let d = 0; d < dim; d++) {
        sumRow[d] += vec[d];
      }
    }

    // EMA update of S_j and N_j, then c_j = S_j / N_j
    for (let j = 0; j < numClusters; j++) {
      N[j] = (1 - alpha) * N[j] + alpha * batchCounts[j];
      for (let d = 0; d < dim; d++) {
        S[j][d] = (1 - alpha) * S[j][d] + alpha * batchSums[j][d];
      }
      if (N[j] > 1e-9) {
        for (let d = 0; d < dim; d++) {
          centroids[j][d] = S[j][d] / N[j];
        }
      }
    }

    // Proportional-split dead-cluster revival
    if (reviveDead && numClusters > 1) {
      for (let j = 0; j < numClusters; j++) {
        if (N[j] < deadThreshold && batchCounts[j] === 0) {
          // Sample an active donor cluster with probability proportional to N_d
          let totalWeight = 0;
          for (let dIdx = 0; dIdx < numClusters; dIdx++) {
            if (dIdx !== j && N[dIdx] > deadThreshold * 2) {
              totalWeight += N[dIdx];
            }
          }
          if (totalWeight <= 0) continue;
          let pick = rng() * totalWeight;
          let donor = -1;
          for (let dIdx = 0; dIdx < numClusters; dIdx++) {
            if (dIdx !== j && N[dIdx] > deadThreshold * 2) {
              pick -= N[dIdx];
              if (pick <= 0) {
                donor = dIdx;
                break;
              }
            }
          }
          if (donor < 0) donor = 0;
          const halfN = Math.max(deadThreshold * 1.5, N[donor] * 0.5);
          N[donor] = halfN;
          N[j] = halfN;
          for (let d = 0; d < dim; d++) {
            const eps = (rng() - 0.5) * 1e-3;
            const baseVal = centroids[donor][d];
            centroids[donor][d] = baseVal + eps;
            centroids[j][d] = baseVal - eps;
            S[donor][d] = centroids[donor][d] * halfN;
            S[j][d] = centroids[j][d] * halfN;
          }
          revivalsTriggered++;
        }
      }
    }
  }

  // Finalization stage: exact last-epoch mean on full dataset
  const finalCounts = new Array(numClusters).fill(0);
  const finalSums = Array.from({ length: numClusters }, () => new Array(dim).fill(0));
  const labels = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const { index: cIdx } = nearestCentroid(vectors[i], centroids);
    labels[i] = cIdx;
    finalCounts[cIdx] += 1;
    for (let d = 0; d < dim; d++) {
      finalSums[cIdx][d] += vectors[i][d];
    }
  }

  if (finalizeExactMean) {
    for (let j = 0; j < numClusters; j++) {
      if (finalCounts[j] > 0) {
        for (let d = 0; d < dim; d++) {
          centroids[j][d] = finalSums[j][d] / finalCounts[j];
        }
      }
    }
  }

  // Compute final MSE, dead cluster count, and cluster size imbalance
  let totalSqError = 0;
  const postCounts = new Array(numClusters).fill(0);
  for (let i = 0; i < n; i++) {
    const { index: cIdx, distanceSq } = nearestCentroid(vectors[i], centroids);
    labels[i] = cIdx;
    postCounts[cIdx] += 1;
    totalSqError += distanceSq;
  }

  const mse = totalSqError / n;
  const deadClusters = postCounts.filter((c) => c === 0).length;
  const meanClusterSize = n / numClusters;
  const imbalance =
    meanClusterSize > 0
      ? postCounts.reduce((acc, c) => acc + Math.pow(c / meanClusterSize, 2), 0) / numClusters
      : 1;

  return {
    centroids,
    labels,
    counts: postCounts,
    mse: Number(mse.toFixed(6)),
    deadClusters,
    imbalance: Number(imbalance.toFixed(4)),
    revivalsTriggered,
    scalingLaw: {
      ...law,
      batchSize,
      alpha0,
    },
  };
}

/**
 * Evaluate @shinboson's e-means codebook quantization regime for consumer Apple Silicon / unified memory.
 * Reference benchmark from https://x.com/shinboson/status/2120499242342985821:
 *   - Model: Qwen3.5-4B
 *   - Baseline size: 8.41 GB (bf16)
 *   - e-means quantized size: 1.23 GB (6.837x compression, ~2.44 effective bits/weight)
 *   - Retained performance: 91.9% (comparable to Bonsai 2)
 *   - Decode regime: small enough that unified-memory bandwidth is no longer the bottleneck.
 */
function evaluateCodebookQuantizationTier(spec = {}) {
  const modelName = String(spec.modelName || 'Qwen3.5-4B-emeans-VQ');
  const paramsBillions = Number(spec.paramsBillions) || 4.0;
  const baseBytesGb = Number(spec.baseBytesGb) || 8.41;
  const quantizedBytesGb = Number(spec.quantizedBytesGb) || 1.23;
  const retainedQualityPct = Number(spec.retainedQualityPct) || 91.9;
  const availableUnifiedMemoryGb = Number(spec.availableUnifiedMemoryGb) || 16.0;
  const slcCacheThresholdGb = Number(spec.slcCacheThresholdGb) || 2.0;

  const compressionRatio = Number((baseBytesGb / quantizedBytesGb).toFixed(2));
  const effectiveBitsPerWeight = Number(((quantizedBytesGb * 8) / paramsBillions).toFixed(2));
  const memorySavedGb = Number((baseBytesGb - quantizedBytesGb).toFixed(2));
  const bandwidthBottleneckEliminated = quantizedBytesGb <= slcCacheThresholdGb;
  const macFreezeSafe = quantizedBytesGb <= Math.max(1.5, availableUnifiedMemoryGb * 0.25);
  const sotaComparable = retainedQualityPct >= 90.0 && compressionRatio >= 5.0;

  return {
    modelName,
    quantizer: 'e-means-codebook',
    paramsBillions,
    baseBytesGb,
    quantizedBytesGb,
    memorySavedGb,
    compressionRatio,
    effectiveBitsPerWeight,
    retainedQualityPct,
    bandwidthBottleneckEliminated,
    macFreezeSafe,
    sotaComparable,
    recommendedLane:
      bandwidthBottleneckEliminated && macFreezeSafe && retainedQualityPct >= 90.0
        ? 'local_apple_silicon_zero_cost'
        : 'hybrid_workhorse_fallback',
  };
}

if (require.main === module) {
  const lawDemo = deriveEmeansScalingLaws({ n: 1000000, k: 16384, epochs: 5, mode: 'default' });
  const quantDemo = evaluateCodebookQuantizationTier();
  process.stdout.write(
    `${JSON.stringify({ ok: true, emeansScalingLawDemo: lawDemo, shinbosonQuantDemo: quantDemo }, null, 2)}\n`,
  );
}

module.exports = {
  deriveEmeansScalingLaws,
  cosineStepSchedule,
  emeansCluster,
  evaluateCodebookQuantizationTier,
};
