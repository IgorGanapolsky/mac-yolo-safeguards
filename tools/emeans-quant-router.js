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
 *          Default batch law: B = clamp(round(c_B * k^0.13 * n^0.88 * T^0.81), 1, n)
 *                             where c_B = 0.035 (or 0.035 / 8 when n > 2,000,000)
 *          Quality batch law: B = clamp(round(0.0044 * k^0.13 * n^0.88 * T^0.81), 1, n)
 *          Step size law:     alpha_0 = min(0.824 * k^-0.46 * B^0.90 * n^-0.45 * T^-0.11, 1.0)
 *      - Cosine step annealing from alpha_0 -> 0.1 * alpha_0 + exact last-epoch mean finalization.
 *      - Proportional-Split Dead-Cluster Revival: revives clusters below a batch-relative
 *        fraction of the mean running count by sampling an active donor cluster proportional
 *        to N_j and splitting it into two.
 *
 *   2. @shinboson (https://x.com/shinboson/status/2120499242342985821):
 *      - Replacing k-means with e-means in quantization compiler codebook generation compresses
 *        Qwen3.5-4B from 8.41 GB -> 1.23 GB (~2.44 bits/weight effective, 6.84x compression)
 *        while retaining an estimated 91.9% of original benchmark performance.
 *      - At 1.23 GB, decode is estimated to fit within consumer unified memory / SLC cache
 *        headroom without triggering macOS WindowServer swap freezes.
 */

function clamp(val, minVal, maxVal) {
  return Math.max(minVal, Math.min(maxVal, val));
}

function computeStepSizeFromLaw({ n, k, batchSize, epochs }) {
  const rawAlpha0 =
    0.824 *
    Math.pow(k, -0.46) *
    Math.pow(batchSize, 0.90) *
    Math.pow(n, -0.45) *
    Math.pow(epochs, -0.11);
  return clamp(rawAlpha0, 1e-4, 1.0);
}

/**
 * Derive automatic batch size B and initial EMA step size alpha_0 from (n, k, T)
 * using the e-means scaling laws (Table 1 of https://e-means.github.io/).
 */
function deriveEmeansScalingLaws({ n, k, epochs = 5, mode = 'default' }) {
  const numPoints = Math.max(1, Number(n) || 1);
  const numClusters = Math.max(1, Math.min(numPoints, Number(k) || 1));
  const T = Math.max(1, Number(epochs) || 5);

  const cB =
    mode === 'quality'
      ? 0.0044
      : numPoints > 2_000_000
        ? 0.035 / 8
        : 0.035;
  const rawB =
    cB *
    Math.pow(numClusters, 0.13) *
    Math.pow(numPoints, 0.88) *
    Math.pow(T, 0.81);
  const batchSize = clamp(Math.round(rawB), 1, numPoints);
  const alpha0 = computeStepSizeFromLaw({
    n: numPoints,
    k: numClusters,
    batchSize,
    epochs: T,
  });

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

function validateVectorDataset(vectors, label = 'vectors') {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw new Error(`emeansCluster requires a non-empty array of ${label}`);
  }
  const first = vectors[0];
  if (!Array.isArray(first) || first.length === 0) {
    throw new Error(`emeansCluster requires non-empty numeric vectors in ${label}`);
  }
  const dim = first.length;
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v) || v.length !== dim) {
      throw new Error(
        `emeansCluster ${label}[${i}] has inconsistent dimension (expected ${dim}, got ${Array.isArray(v) ? v.length : typeof v})`,
      );
    }
    for (let d = 0; d < dim; d++) {
      if (!Number.isFinite(v[d])) {
        throw new Error(`emeansCluster ${label}[${i}][${d}] must be a finite number`);
      }
    }
  }
  return dim;
}

/**
 * Fast nearest-centroid lookup using precomputed squared norms:
 * ||x - c||^2 = max(0, ||x||^2 + ||c||^2 - 2 * <x, c>)
 */
function nearestCentroidFast(vec, vecNormSq, flatCentroids, centroidNormsSq, numClusters, dim) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let j = 0; j < numClusters; j++) {
    const offset = j * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) {
      dot += vec[d] * flatCentroids[offset + d];
    }
    const dist = Math.max(0, vecNormSq + centroidNormsSq[j] - 2 * dot);
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
 *   - Scaling-law batch B & step alpha_0 (recalculated if batchSize is overridden)
 *   - Cosine decay from alpha_0 -> 0.1 * alpha_0
 *   - EMA sufficient statistics S_j, N_j with c_j = S_j / N_j
 *   - Batch-relative proportional-split dead-cluster revival
 *   - Exact last-epoch mean finalization accumulated during the final epoch
 */
function emeansCluster(vectors, k, options = {}) {
  const dim = validateVectorDataset(vectors, 'vectors');
  const n = vectors.length;
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
  const derivedAlpha0 = options.batchSize
    ? Number(
        computeStepSizeFromLaw({
          n,
          k: numClusters,
          batchSize,
          epochs,
        }).toFixed(6),
      )
    : law.alpha0;
  const alpha0 = options.alpha0
    ? clamp(Number(options.alpha0), 1e-4, 1.0)
    : derivedAlpha0;

  // Precompute vector squared norms for fast dot-product assignment
  const vecNormsSq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let normSq = 0;
    const v = vectors[i];
    for (let d = 0; d < dim; d++) {
      normSq += v[d] * v[d];
    }
    vecNormsSq[i] = normSq;
  }

  // Initialize centroids in contiguous Float64Array buffers
  const flatCentroids = new Float64Array(numClusters * dim);
  const centroidNormsSq = new Float64Array(numClusters);
  if (Array.isArray(options.initialCentroids) && options.initialCentroids.length === numClusters) {
    const initDim = validateVectorDataset(options.initialCentroids, 'initialCentroids');
    if (initDim !== dim) {
      throw new Error(
        `emeansCluster initialCentroids dimension (${initDim}) does not match vector dimension (${dim})`,
      );
    }
    for (let j = 0; j < numClusters; j++) {
      let normSq = 0;
      for (let d = 0; d < dim; d++) {
        const val = options.initialCentroids[j][d];
        flatCentroids[j * dim + d] = val;
        normSq += val * val;
      }
      centroidNormsSq[j] = normSq;
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
      const src = vectors[indices[j]];
      for (let d = 0; d < dim; d++) {
        flatCentroids[j * dim + d] = src[d];
      }
      centroidNormsSq[j] = vecNormsSq[indices[j]];
    }
  }

  const initN = batchSize / numClusters;
  const S = new Float64Array(numClusters * dim);
  for (let i = 0; i < flatCentroids.length; i++) {
    S[i] = flatCentroids[i] * initN;
  }
  const N = new Float64Array(numClusters).fill(initN);

  const stepsPerEpoch = Math.max(1, Math.ceil(n / batchSize));
  const totalSteps = epochs * stepsPerEpoch;
  const lastEpochStartStep = (epochs - 1) * stepsPerEpoch;
  let revivalsTriggered = 0;

  const order = Array.from({ length: n }, (_, i) => i);
  const lastEpochSums = new Float64Array(numClusters * dim);
  const lastEpochCounts = new Int32Array(numClusters);
  const epochAssignedCounts = new Int32Array(numClusters);

  for (let step = 0; step < totalSteps; step++) {
    const progress = totalSteps > 1 ? step / (totalSteps - 1) : 1;
    const alpha = cosineStepSchedule(alpha0, progress);
    const inLastEpoch = step >= lastEpochStartStep;

    // Shuffle at the start of each epoch
    if (step % stepsPerEpoch === 0) {
      epochAssignedCounts.fill(0);
      for (let i = order.length - 1; i > 0; i--) {
        const swapIdx = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[swapIdx];
        order[swapIdx] = tmp;
      }
      if (step === lastEpochStartStep) {
        lastEpochSums.fill(0);
        lastEpochCounts.fill(0);
      }
    }

    const start = (step % stepsPerEpoch) * batchSize;
    const end = Math.min(n, start + batchSize);
    const batchSums = new Float64Array(numClusters * dim);
    const batchCounts = new Int32Array(numClusters);

    for (let idx = start; idx < end; idx++) {
      const vecIdx = order[idx];
      const vec = vectors[vecIdx];
      const { index: cIdx } = nearestCentroidFast(
        vec,
        vecNormsSq[vecIdx],
        flatCentroids,
        centroidNormsSq,
        numClusters,
        dim,
      );
      batchCounts[cIdx] += 1;
      epochAssignedCounts[cIdx] += 1;
      const offset = cIdx * dim;
      for (let d = 0; d < dim; d++) {
        batchSums[offset + d] += vec[d];
      }
      if (inLastEpoch) {
        lastEpochCounts[cIdx] += 1;
        for (let d = 0; d < dim; d++) {
          lastEpochSums[offset + d] += vec[d];
        }
      }
    }

    // EMA update of S_j and N_j, then c_j = S_j / N_j
    let totalN = 0;
    for (let j = 0; j < numClusters; j++) {
      N[j] = (1 - alpha) * N[j] + alpha * batchCounts[j];
      totalN += N[j];
      const offset = j * dim;
      for (let d = 0; d < dim; d++) {
        S[offset + d] = (1 - alpha) * S[offset + d] + alpha * batchSums[offset + d];
      }
      if (N[j] > 1e-9) {
        let normSq = 0;
        for (let d = 0; d < dim; d++) {
          const val = S[offset + d] / N[j];
          flatCentroids[offset + d] = val;
          normSq += val * val;
        }
        centroidNormsSq[j] = normSq;
      }
    }

    // Batch-relative proportional-split dead-cluster revival (prior to final epoch)
    const isEndOfEpoch = (step + 1) % stepsPerEpoch === 0;
    if (reviveDead && numClusters > 1 && (!inLastEpoch || epochs === 1)) {
      const meanN = totalN / numClusters;
      const deadThreshold = Math.max(1e-6, meanN * 0.05);
      const donorMinN = Math.max(deadThreshold * 2, meanN * 0.5);

      for (let j = 0; j < numClusters; j++) {
        const isDeadByEma = N[j] < deadThreshold && batchCounts[j] === 0;
        const isDeadByFullEpoch = isEndOfEpoch && epochAssignedCounts[j] === 0;
        if (isDeadByEma || isDeadByFullEpoch) {
          let totalWeight = 0;
          for (let dIdx = 0; dIdx < numClusters; dIdx++) {
            if (dIdx !== j && N[dIdx] >= donorMinN) {
              totalWeight += N[dIdx];
            }
          }
          if (totalWeight <= 0) continue;
          let pick = rng() * totalWeight;
          let donor = -1;
          for (let dIdx = 0; dIdx < numClusters; dIdx++) {
            if (dIdx !== j && N[dIdx] >= donorMinN) {
              pick -= N[dIdx];
              if (pick <= 0) {
                donor = dIdx;
                break;
              }
            }
          }
          if (donor < 0) donor = 0;
          const halfN = Math.max(deadThreshold * 1.1, N[donor] * 0.5);
          N[donor] = halfN;
          N[j] = halfN;
          let donorNormSq = 0;
          let revivedNormSq = 0;
          const donorOffset = donor * dim;
          const revivedOffset = j * dim;
          for (let d = 0; d < dim; d++) {
            const eps = (rng() - 0.5) * 1e-3;
            const baseVal = flatCentroids[donorOffset + d];
            const dVal = baseVal + eps;
            const rVal = baseVal - eps;
            flatCentroids[donorOffset + d] = dVal;
            flatCentroids[revivedOffset + d] = rVal;
            S[donorOffset + d] = dVal * halfN;
            S[revivedOffset + d] = rVal * halfN;
            donorNormSq += dVal * dVal;
            revivedNormSq += rVal * rVal;
          }
          centroidNormsSq[donor] = donorNormSq;
          centroidNormsSq[j] = revivedNormSq;
          revivalsTriggered++;
        }
      }
    }
  }

  // Finalization stage: apply exact means accumulated during the last epoch
  if (finalizeExactMean) {
    for (let j = 0; j < numClusters; j++) {
      if (lastEpochCounts[j] > 0) {
        let normSq = 0;
        const offset = j * dim;
        for (let d = 0; d < dim; d++) {
          const val = lastEpochSums[offset + d] / lastEpochCounts[j];
          flatCentroids[offset + d] = val;
          normSq += val * val;
        }
        centroidNormsSq[j] = normSq;
      }
    }
  }

  // Compute final labels, MSE, dead cluster count, and cluster size imbalance
  const labels = new Array(n).fill(0);
  const postCounts = new Array(numClusters).fill(0);
  let totalSqError = 0;
  for (let i = 0; i < n; i++) {
    const { index: cIdx, distanceSq } = nearestCentroidFast(
      vectors[i],
      vecNormsSq[i],
      flatCentroids,
      centroidNormsSq,
      numClusters,
      dim,
    );
    labels[i] = cIdx;
    postCounts[cIdx] += 1;
    totalSqError += distanceSq;
  }

  const centroids = Array.from({ length: numClusters }, (_, j) =>
    Array.from(flatCentroids.subarray(j * dim, (j + 1) * dim)),
  );
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
    mse,
    mseRounded: Number(mse.toFixed(6)),
    deadClusters,
    imbalance: Number(imbalance.toFixed(4)),
    revivalsTriggered,
    scalingLaw: {
      ...law,
      batchSize,
      alpha0,
      alphaFinal: Number((0.1 * alpha0).toFixed(6)),
    },
  };
}

/**
 * Evaluate @shinboson's e-means codebook quantization regime for consumer Apple Silicon / unified memory.
 * Reference benchmark from https://x.com/shinboson/status/2120499242342985821:
 *   - Model: Qwen3.5-4B
 *   - Baseline size: 8.41 GB (bf16)
 *   - e-means quantized size: 1.23 GB (6.837x compression, ~2.44 effective bits/weight)
 *   - Retained performance: 91.9% (estimated benchmark retention, comparable to Bonsai 2)
 *   - Decode regime: small enough that unified-memory bandwidth is no longer the primary bottleneck.
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
  const fitsInAvailableMemory = quantizedBytesGb <= availableUnifiedMemoryGb;
  const macFreezeSafe =
    fitsInAvailableMemory && quantizedBytesGb <= Math.max(1.5, availableUnifiedMemoryGb * 0.25);
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
    fitsInAvailableMemory,
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
