#!/usr/bin/env node
'use strict';
/**
 * rag-eval-harness.js — Model evaluation harness for Agentic RAG / retrieval systems.
 *
 * Computes retrieval-quality metrics from a JSON dataset of Q&A pairs, each
 * with a list of retrieved passages ranked by score:
 *
 * {
 *   "queries": [
 *     {
 *       "question": "How does CAS consensus work?",
 *       "goldDocs": ["doc-1", "doc-7"],          // ground-truth document IDs
 *       "retrievedDocs": [                       // ranked by retrieval score desc
 *         { "docId": "doc-3", "score": 0.91 },
 *         { "docId": "doc-1", "score": 0.74 },
 *         { "docId": "doc-7", "score": 0.42 },
 *         { "docId": "doc-9", "score": 0.18 }
 *       ]
 *     }
 *   ]
 * }
 *
 * Metrics computed:
 * - recall@k    : fraction of gold docs found in top-k
 * - MRR@k       : mean reciprocal rank of the first relevant doc in top-k
 * - nDCG@k      : normalized discounted cumulative gain at k
 *
 * Usage:
 *   node tools/rag-eval-harness.js dataset.json --k 1,5,10 --json
 *   node tools/rag-eval-harness.js dataset.json --out metrics.json
 *
 * T-AB-TESTING-DS-20260819 / T-RAG-EVAL-ML-20260819
 */

const fs = require('fs');
const path = require('path');

// --- Metric implementations ---

/**
 * Check if a doc is relevant given a set of gold doc IDs.
 */
function isRelevant(docId, goldDocs) {
  return goldDocs.includes(docId);
}

/**
 * Precision at k: fraction of top-k retrieved docs that are relevant.
 */
function precisionAtK(retrieved, goldDocs, k) {
  const topK = retrieved.slice(0, k);
  const relevant = topK.filter(d => isRelevant(d.docId, goldDocs)).length;
  // Use min(k, retrievedCount) so systems returning fewer than k docs
  // aren't penalised for the empty tail — standard for RAG eval.
  const divisor = Math.min(k, retrieved.length);
  return divisor > 0 ? relevant / divisor : 0;
}

/**
 * Recall at k: fraction of gold docs found in top-k.
 */
function recallAtK(retrieved, goldDocs, k) {
  if (goldDocs.length === 0) return 0;
  const topK = retrieved.slice(0, k);
  const found = new Set(topK.map(d => d.docId));
  const relevantFound = goldDocs.filter(id => found.has(id)).length;
  return relevantFound / goldDocs.length;
}

/**
 * Mean Reciprocal Rank at k: average of 1/rank of first relevant doc.
 * Returns 0 for queries where no relevant doc appears in top-k.
 */
function reciprocalRankAtK(retrieved, goldDocs, k) {
  const topK = retrieved.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    if (isRelevant(topK[i].docId, goldDocs)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * DCG at k (Discounted Cumulative Gain).
 * Uses binary relevance (1 if in goldDocs, 0 otherwise).
 */
function dcgAtK(retrieved, goldDocs, k) {
  const topK = retrieved.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const rel = isRelevant(topK[i].docId, goldDocs) ? 1 : 0;
    if (rel > 0) {
      dcg += rel / Math.log2(i + 2); // rank starts at 1, so i+2
    }
  }
  return dcg;
}

/**
 * Ideal DCG at k: DCG of the best possible ordering
 * (all relevant docs first, ordered by relevance score).
 * Since we use binary relevance, iDCG = sum of 1/log2(i+2) for i=0..min(rel_count,k)-1.
 */
function idealDcgAtK(goldDocs, retrieved, k) {
  const relevantCount = Math.min(goldDocs.length, k);
  let idcg = 0;
  for (let i = 0; i < relevantCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg;
}

/**
 * nDCG at k: normalized DCG.
 */
function ndcgAtK(retrieved, goldDocs, k) {
  const idcg = idealDcgAtK(goldDocs, retrieved, k);
  if (idcg === 0) return 0; // no relevant docs in top-k
  const dcg = dcgAtK(retrieved, goldDocs, k);
  return dcg / idcg;
}

// --- Core evaluation engine ---

/**
 * Evaluate a dataset and return per-k metrics.
 * @param {Object} dataset - { queries: [{ question, goldDocs, retrievedDocs }] }
 * @param {number[]} ks - cutoff values
 * @returns {Object} aggregate metrics
 */
function evaluateDataset(dataset, ks) {
  const queries = dataset.queries || [];
  const numQueries = queries.length;

  if (numQueries === 0) {
    throw new Error('dataset has no queries');
  }

  const results = {};
  const perQuery = [];

  for (const k of ks) {
    let sumPrecision = 0;
    let sumRecall = 0;
    let sumMrr = 0;
    let sumNdcg = 0;
    let queriesWithRelevant = 0; // for MRR recall denominator
    let queriesWithGold = 0; // for nDCG denominator

    for (const q of queries) {
      const goldDocs = q.goldDocs || [];
      const retrieved = (q.retrievedDocs || []).sort((a, b) => b.score - a.score); // ensure ranked

      const prec = precisionAtK(retrieved, goldDocs, k);
      const rec = recallAtK(retrieved, goldDocs, k);
      const mrr = reciprocalRankAtK(retrieved, goldDocs, k);
      const ndcg = ndcgAtK(retrieved, goldDocs, k);

      sumPrecision += prec;
      sumRecall += rec;
      sumMrr += mrr;
      sumNdcg += ndcg;

      if (goldDocs.length > 0) {
        queriesWithGold++;
        if (rec > 0) queriesWithRelevant++;
      }

      perQuery.push({
        question: q.question,
        k,
        precision: prec,
        recall: rec,
        mrr: mrr,
        ndcg: ndcg,
        goldDocs: goldDocs.length,
        retrieved: retrieved.length,
      });
    }

    results[`precision@${k}`] = sumPrecision / numQueries;
    results[`recall@${k}`] = sumRecall / numQueries;
    results[`mrr@${k}`] = sumMrr / numQueries;
    results[`ndcg@${k}`] = sumNdcg / queriesWithGold; // nDCG averaged over queries with gold docs
  }

  return {
    numQueries,
    ks,
    metrics: results,
    perQuery,
    // Summary at the best k
    summary: {
      bestK: ks[ks.length - 1],
      maxRecall: Math.max(...ks.map(k => results[`recall@${k}`])),
      maxMrr: Math.max(...ks.map(k => results[`mrr@${k}`])),
      meanNdcg: ks.reduce((sum, k) => sum + results[`ndcg@${k}`], 0) / ks.length,
    },
  };
}

// --- CLI ---

function parseArgs(argv) {
  const args = { _: [], k: [1, 5, 10], json: false, out: null, pretty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--pretty') args.pretty = true;
    else if (a.startsWith('--k=')) args.k = a.slice(4).split(',').map(Number).filter(n => !isNaN(n));
    else if (a === '--k' && i + 1 < argv.length) args.k = argv[++i].split(',').map(Number).filter(n => !isNaN(n));
    else if (a === '--out' && i + 1 < argv.length) args.out = argv[++i];
    else if (!a.startsWith('-')) args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args._.length === 0) {
    console.error('Usage: node tools/rag-eval-harness.js <dataset.json> [--k 1,5,10] [--json] [--out out.json] [--pretty]');
    process.exit(1);
  }

  const datasetPath = path.resolve(args._[0]);
  if (!fs.existsSync(datasetPath)) {
    console.error(`Error: dataset not found: ${datasetPath}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const results = evaluateDataset(dataset, args.k);

  const output = args.pretty
    ? JSON.stringify(results, null, 2)
    : JSON.stringify(results);

  if (args.out) {
    fs.writeFileSync(args.out, output + '\n');
    console.error(`✓ wrote ${args.out}`);
  }

  if (args.json || args.out) {
    console.log(output);
  } else {
    console.log(`\n=== RAG Evaluation Results ===\n`);
    console.log(`Queries: ${results.numQueries}`);
    console.log(`KS: ${results.ks.join(', ')}\n`);
    for (const k of results.ks) {
      console.log(`  @${k}: precision@${k}=${results.metrics[`precision@${k}`].toFixed(4)}  recall@${k}=${results.metrics[`recall@${k}`].toFixed(4)}  mrr@${k}=${results.metrics[`mrr@${k}`].toFixed(4)}  ndcg@${k}=${results.metrics[`ndcg@${k}`].toFixed(4)}`);
    }
    console.log(`\n  Best recall: ${results.summary.maxRecall.toFixed(4)}  Best MRR: ${results.summary.maxMrr.toFixed(4)}`);
  }
}

// --- Exports for testing ---

module.exports = {
  precisionAtK,
  recallAtK,
  reciprocalRankAtK,
  dcgAtK,
  idealDcgAtK,
  ndcgAtK,
  evaluateDataset,
  parseArgs,
};

if (require.main === module) main();
