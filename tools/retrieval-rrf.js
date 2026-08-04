#!/usr/bin/env node
'use strict';

/**
 * Reciprocal Rank Fusion (+ weights) for dual-path / multi-query retrieval.
 *
 * Extracted so multi-query can fuse without requiring the full dual-path module
 * (avoids load-order / circular require issues with CLI entrypoints).
 *
 * score(d) = Σ weight_i / (k + rank_i(d))
 *            + agreementBonus if ≥2 sources
 *            + light path-token alignment with the query
 */

const DEFAULT_K = 60;
const DEFAULT_WEIGHTS = Object.freeze({
  harness: 2.2, // sparse path/token scorer — best for identifier-heavy code queries
  // grepae complementary; slightly below 1.0 so dual agreement still beats
  // mid-pack harness-only (unit tests) without burying harness@1 (swarm goldens).
  grepai: 0.9,
  default: 1.0,
});

function tokenizeQuery(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./+-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function pathTokenBoost(filePath, queryTokens) {
  if (!queryTokens.length) return 0;
  const base = String(filePath || '')
    .replace(/\\/g, '/')
    .toLowerCase();
  const leaf = base.split('/').pop() || base;
  const stem = leaf.replace(/\.[a-z0-9]+$/i, '');
  const parts = new Set(stem.split(/[-_.]+/).filter((p) => p.length >= 3));
  let hits = 0;
  let partHits = 0;
  for (const t of queryTokens) {
    if (leaf.includes(t) || base.includes(t)) hits += 1;
    if (parts.has(t)) partHits += 1;
  }
  // Prefer basenames that share multiple query tokens (agent-swarm-harness ↔ agent swarm harness).
  // Cap is intentionally modest: boosts ≥0.04 can bury harness@8 production paths under
  // test-* filename hits (measured 2026-08-04 lessons-feedback dual-path IR miss).
  const multi = partHits >= 2 ? 0.01 : partHits === 1 ? 0.004 : 0;
  return Math.min(0.018, hits * 0.004 + multi);
}

function pathQualityPenalty(filePath) {
  const base = String(filePath || '')
    .replace(/\\/g, '/')
    .toLowerCase();
  // Align with grepae search.boost.penalties — tests are valid but secondary to product code.
  if (
    /\/tests?\//.test(base) ||
    /__tests__/.test(base) ||
    /\.(test|spec)\.[a-z]+$/.test(base) ||
    /\/fixtures?\//.test(base) ||
    /\/mocks?\//.test(base)
  ) {
    return 0.012;
  }
  return 0;
}

/**
 * @param {Array<Array|{items:Array, weight?:number, source?:string}>} lists
 * @param {object} [options]
 * @param {number} [options.k=60]
 * @param {object} [options.weights] source → weight
 * @param {string} [options.query] for path-token boost
 */
function rrfFuse(lists, options = {}) {
  // Back-compat: rrfFuse(lists, kNumber)
  if (typeof options === 'number') {
    options = { k: options };
  }
  const k = options.k == null ? DEFAULT_K : options.k;
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const queryTokens = tokenizeQuery(options.query || '');

  const scores = new Map();
  const meta = new Map();

  for (const entry of lists || []) {
    const list = Array.isArray(entry) ? entry : entry?.items || [];
    const listWeight =
      (Array.isArray(entry) ? null : entry?.weight) != null
        ? Number(entry.weight)
        : null;

    for (const item of list) {
      if (!item?.path) continue;
      const key = item.path;
      const source = item.source || entry?.source || 'default';
      const baseSource = String(source).split(':')[0]; // mq:… → mq
      const w =
        listWeight != null
          ? listWeight
          : weights[source] != null
            ? weights[source]
            : weights[baseSource] != null
              ? weights[baseSource]
              : weights.default;
      const rank = Number(item.rank) > 0 ? Number(item.rank) : 1;
      const add = w / (k + rank);
      scores.set(key, (scores.get(key) || 0) + add);

      const prev = meta.get(key) || {
        path: key,
        sources: [],
        snippets: [],
        harnessRank: null,
        grepaiRank: null,
        harnessScore: null,
      };
      prev.sources.push(source);
      if (item.snippet) prev.snippets.push(String(item.snippet).slice(0, 200));
      if (item.start_line) prev.start_line = item.start_line;
      if (item.end_line) prev.end_line = item.end_line;
      if (source === 'harness' || baseSource === 'harness') {
        prev.harnessRank = rank;
        if (item.score != null) prev.harnessScore = item.score;
      }
      if (source === 'grepai' || baseSource === 'grepai') {
        prev.grepaiRank = rank;
      }
      meta.set(key, prev);
    }
  }

  // Count non-empty rank lists — single-list fuse should nearly preserve input order
  // (path boosts alone were enough to drop apps/.../lessons out of top-10, 2026-08-04).
  const activeLists = (lists || []).filter((entry) => {
    const list = Array.isArray(entry) ? entry : entry?.items || [];
    return list.length > 0;
  }).length;

  return [...scores.entries()]
    .map(([p, score]) => {
      const m = meta.get(p);
      const sources = [...new Set(m.sources)];
      const agreement =
        sources.some((s) => String(s).startsWith('harness')) &&
        sources.some((s) => String(s).includes('grepai') || s === 'grepai')
          ? 0.015
          : sources.length > 1
            ? 0.006
            : 0;
      // Only apply path-token boost when fusing ≥2 lists; single-path is already ranked.
      const pathBoost = activeLists >= 2 ? pathTokenBoost(p, queryTokens) : 0;
      const qualityPenalty = pathQualityPenalty(p);
      // Strong prior only for top-3 sparse hits (keeps harness@1 goldens first).
      // Ranks 4–12 get a light nudge so apps/.../lessons@8-9 stay near top-k without
      // letting harness@4 solo beat dual-listed mid-pack agreement (CI unit tests
      // 2026-08-04: a.js@4 solo was wrongly beating b.js dual after prior over-tune).
      let harnessPrior = 0;
      if (m.harnessRank != null && m.harnessRank > 0 && m.harnessRank <= 12) {
        harnessPrior =
          m.harnessRank === 1
            ? 0.055
            : m.harnessRank === 2
              ? 0.025
              : m.harnessRank === 3
                ? 0.012
                : 0.0015 * (13 - m.harnessRank);
      }
      const rrfScore = Number(
        (score + agreement + pathBoost + harnessPrior - qualityPenalty).toFixed(6),
      );
      return {
        path: p,
        rrfScore,
        sources,
        snippet: m.snippets[0] || '',
        start_line: m.start_line,
        end_line: m.end_line,
        harnessRank: m.harnessRank,
        grepaiRank: m.grepaiRank,
        harnessScore: m.harnessScore,
      };
    })
    .sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
      // Prefer stronger harness placement when RRF ties
      const ha = a.harnessRank == null ? 999 : a.harnessRank;
      const hb = b.harnessRank == null ? 999 : b.harnessRank;
      if (ha !== hb) return ha - hb;
      return a.path.localeCompare(b.path);
    });
}

module.exports = {
  rrfFuse,
  pathTokenBoost,
  tokenizeQuery,
  DEFAULT_K,
  DEFAULT_WEIGHTS,
};
