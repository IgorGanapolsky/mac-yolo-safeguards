#!/usr/bin/env node
'use strict';

/**
 * Deterministic IR + generation quality metrics — no LLM judge, no invented scores.
 *
 * Retrieval (binary or graded labels):
 *   recall@k, precision@k, MRR (mean reciprocal rank of first relevant), nDCG@k
 *
 * Generation (answer vs query vs sources):
 *   answerRelevance  — token F1(query, answer)
 *   faithfulness     — fraction of claim sentences supported by sources
 *   groundedness     — fraction of answer content tokens that appear in sources
 *
 * All functions are pure and unit-testable. Callers attach measured:true + source.
 */

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_./+-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[./_+-]+|[./_+-]+$/g, ''))
    .filter((t) => t.length >= 2);
}

function contentTokens(value) {
  // Drop ultra-common glue so faithfulness/groundedness are not inflated by "the/and".
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
    'are', 'was', 'were', 'been', 'have', 'has', 'had', 'not', 'but', 'you', 'your',
    'our', 'all', 'any', 'can', 'may', 'will', 'when', 'what', 'how', 'why',
    'is', 'on', 'in', 'to', 'of', 'it', 'as', 'or', 'an', 'be', 'do', 'if', 'so',
    'no', 'we', 'me', 'my', 'at', 'by', 'up', 'out', 'off', 'via', 'per',
  ]);
  return tokenize(value).filter((t) => !stop.has(t) && !/^\d+(\.\d+)?$/.test(t));
}

function splitClaims(answer) {
  return String(answer || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/**
 * Build grade map: required entries → grade (default 1), optional gradedRelevance overrides.
 * @param {string[]} required
 * @param {Record<string, number>} [gradedRelevance]
 * @param {(item: string, key: string) => boolean} matches
 */
function gradesForList(rankedItems, required, matches, gradedRelevance = {}) {
  const grades = rankedItems.map((item) => {
    let best = 0;
    for (const [key, grade] of Object.entries(gradedRelevance)) {
      if (matches(item, key) && Number(grade) > best) best = Number(grade);
    }
    if (best > 0) return best;
    for (const need of required) {
      if (matches(item, need)) return 1;
    }
    return 0;
  });
  return grades;
}

function isRelevant(item, required, matches, gradedRelevance = {}) {
  if (Object.keys(gradedRelevance).length) {
    for (const [key, grade] of Object.entries(gradedRelevance)) {
      if (Number(grade) > 0 && matches(item, key)) return true;
    }
  }
  return required.some((need) => matches(item, need));
}

/**
 * Score one ranked list against required / graded labels.
 * @returns {{
 *   recallAtK: number,
 *   precisionAtK: number,
 *   reciprocalRank: number,
 *   ndcgAtK: number,
 *   missing: string[],
 *   hitCount: number,
 *   k: number
 * }}
 */
function scoreRanking(rankedItems, required, matches, options = {}) {
  const items = Array.isArray(rankedItems) ? rankedItems : [];
  const needs = Array.isArray(required) ? required : [];
  const graded = options.gradedRelevance || {};
  const k = Number.isInteger(options.k) && options.k > 0 ? options.k : items.length || 1;
  const truncated = items.slice(0, k);

  const missing = needs.filter((need) => !truncated.some((item) => matches(item, need)));
  const hitCount = needs.length - missing.length;
  const recallAtK = needs.length ? hitCount / needs.length : 1;

  const relevantInTop = truncated.filter((item) => isRelevant(item, needs, matches, graded)).length;
  // Standard precision@k: relevant / k (empty slots count as non-relevant).
  const precisionAtK = k ? relevantInTop / k : 0;

  const firstRelevantIndex = truncated.findIndex((item) => isRelevant(item, needs, matches, graded));
  const reciprocalRank = firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);

  const grades = gradesForList(truncated, needs, matches, graded);
  // One required substring can match many paths; ideal must not under-count
  // those hits or nDCG exceeds 1. Use max(|required|, relevant-in-top-k).
  const relevantInGrades = grades.filter((g) => g > 0).length;
  const ndcgAtK = Math.min(1, ndcg(grades, idealGrades(needs, graded, k, relevantInGrades)));

  return {
    recallAtK,
    precisionAtK,
    reciprocalRank,
    ndcgAtK,
    missing,
    hitCount,
    k,
  };
}

function idealGrades(required, gradedRelevance, k, relevantObserved = 0) {
  const grades = [];
  if (Object.keys(gradedRelevance || {}).length) {
    for (const g of Object.values(gradedRelevance)) {
      if (Number(g) > 0) grades.push(Number(g));
    }
  } else {
    const positives = Math.max(required.length, relevantObserved, 0);
    for (let i = 0; i < positives; i += 1) grades.push(1);
  }
  grades.sort((a, b) => b - a);
  while (grades.length < k) grades.push(0);
  return grades.slice(0, k);
}

function dcg(grades) {
  let sum = 0;
  for (let i = 0; i < grades.length; i += 1) {
    const rel = Number(grades[i]) || 0;
    if (rel <= 0) continue;
    // Binary-compatible: rel=1 → gain 1. Graded: 2^rel - 1.
    const gain = rel === 1 ? 1 : 2 ** rel - 1;
    sum += gain / Math.log2(i + 2);
  }
  return sum;
}

function ndcg(grades, ideal) {
  const idcg = dcg(ideal);
  if (idcg <= 0) return grades.some((g) => g > 0) ? 1 : 0;
  return Math.min(1, dcg(grades) / idcg);
}

/**
 * Answer relevance: token F1 between query and answer (higher = more on-topic).
 */
function answerRelevance(query, answer) {
  const q = new Set(contentTokens(query));
  const a = contentTokens(answer);
  if (!q.size || !a.length) return 0;
  const aSet = new Set(a);
  let inter = 0;
  for (const t of q) if (aSet.has(t)) inter += 1;
  const precision = inter / aSet.size;
  const recall = inter / q.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Faithfulness: fraction of claim sentences whose content tokens are supported
 * by the union of source texts (threshold: ≥50% of claim tokens in sources,
 * or ≥2 content tokens for short claims).
 */
function faithfulness(answer, sources) {
  const sourceTok = new Set(contentTokens((sources || []).join('\n')));
  const claims = splitClaims(answer);
  if (!claims.length) {
    // Single short answer — treat whole answer as one claim.
    const toks = contentTokens(answer);
    if (!toks.length) return sourceTok.size ? 1 : 0;
    const hit = toks.filter((t) => sourceTok.has(t)).length;
    return hit / toks.length >= 0.5 || hit >= 2 ? 1 : 0;
  }
  let supported = 0;
  for (const claim of claims) {
    const toks = contentTokens(claim);
    if (!toks.length) {
      supported += 1;
      continue;
    }
    const hit = toks.filter((t) => sourceTok.has(t)).length;
    const ratio = hit / toks.length;
    // Require substantial overlap — a single shared noun must not count as faithful.
    if (ratio >= 0.5 || (hit >= 3 && ratio >= 0.25)) supported += 1;
  }
  return supported / claims.length;
}

/**
 * Groundedness: fraction of answer content tokens that appear in sources
 * (answer is "covered" by evidence).
 */
function groundedness(answer, sources) {
  const sourceTok = new Set(contentTokens((sources || []).join('\n')));
  const aToks = contentTokens(answer);
  if (!aToks.length) return sourceTok.size ? 1 : 0;
  if (!sourceTok.size) return 0;
  const hit = aToks.filter((t) => sourceTok.has(t)).length;
  return hit / aToks.length;
}

/**
 * Composite generation pack for one (query, answer, sources) triple.
 */
function scoreGeneration(query, answer, sources, options = {}) {
  const rel = answerRelevance(query, answer);
  const faith = faithfulness(answer, sources);
  const ground = groundedness(answer, sources);
  const floors = {
    answerRelevance: options.minAnswerRelevance ?? 0,
    faithfulness: options.minFaithfulness ?? 0,
    groundedness: options.minGroundedness ?? 0,
  };
  return {
    answerRelevance: round4(rel),
    faithfulness: round4(faith),
    groundedness: round4(ground),
    pass:
      rel + 1e-12 >= floors.answerRelevance &&
      faith + 1e-12 >= floors.faithfulness &&
      ground + 1e-12 >= floors.groundedness,
  };
}

/**
 * Lexical cross-encoder-style interaction score for second-stage rerank.
 * Not a neural CE — joint features of query × (path + snippet).
 */
function crossEncoderLiteScore(query, path, snippet = '') {
  const qToks = contentTokens(query);
  if (!qToks.length) return 0;
  const doc = contentTokens(`${path} ${snippet}`);
  const docSet = new Set(doc);
  let shared = 0;
  let exactPhrase = 0;
  const qLower = String(query || '').toLowerCase();
  const dLower = `${path} ${snippet}`.toLowerCase();
  for (const t of qToks) {
    if (docSet.has(t)) shared += 1;
  }
  // Bonus if multi-token query fragments appear contiguously in path/snippet.
  const words = qLower.split(/\s+/).filter((w) => w.length >= 3);
  for (let i = 0; i < words.length - 1; i += 1) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (dLower.includes(bigram)) exactPhrase += 1;
  }
  const coverage = shared / qToks.length;
  return shared * 2 + coverage * 5 + exactPhrase * 3 + (path && qToks.some((t) => path.toLowerCase().includes(t)) ? 2 : 0);
}

function rerankCrossEncoderLite(query, matches) {
  return (matches || [])
    .map((m, i) => ({
      ...m,
      preRerankRank: m.rank || i + 1,
      ceScore: crossEncoderLiteScore(query, m.path, m.snippet || m.text || ''),
    }))
    .sort((a, b) => b.ceScore - a.ceScore || (a.path || '').localeCompare(b.path || ''))
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function summarizeRetrievalResults(results) {
  return {
    caseCount: results.length,
    passCount: results.filter((r) => r.pass).length,
    meanRecallAtK: round4(mean(results.map((r) => r.recallAtK))),
    meanMRR: round4(mean(results.map((r) => r.reciprocalRank))),
    meanPrecisionAtK: round4(mean(results.map((r) => r.precisionAtK ?? 0))),
    meanNDCGAtK: round4(mean(results.map((r) => r.ndcgAtK ?? 0))),
    results,
  };
}

module.exports = {
  tokenize,
  contentTokens,
  scoreRanking,
  ndcg,
  dcg,
  answerRelevance,
  faithfulness,
  groundedness,
  scoreGeneration,
  crossEncoderLiteScore,
  rerankCrossEncoderLite,
  mean,
  round4,
  summarizeRetrievalResults,
  gradesForList,
  isRelevant,
};
