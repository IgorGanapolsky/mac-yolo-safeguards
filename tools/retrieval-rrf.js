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
  grepai: 1.0,
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
  // Prefer basenames that share multiple query tokens (agent-swarm-harness ↔ agent swarm harness)
  const multi = partHits >= 2 ? 0.02 : partHits === 1 ? 0.008 : 0;
  return Math.min(0.045, hits * 0.008 + multi);
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

  return [...scores.entries()]
    .map(([p, score]) => {
      const m = meta.get(p);
      const sources = [...new Set(m.sources)];
      const agreement =
        sources.some((s) => String(s).startsWith('harness')) &&
        sources.some((s) => String(s).includes('grepai') || s === 'grepai')
          ? 0.012
          : sources.length > 1
            ? 0.006
            : 0;
      const pathBoost = pathTokenBoost(p, queryTokens);
      // Respect strong sparse ranker: harness@1 should not be buried by grepae agreement noise
      // (2026-08-01: agent-swarm-harness harness@1 dual@6 under equal RRF;
      //  re-proof: still dual@2 under 0.03 prior — raise to clear multi-source docs).
      const harnessPrior =
        m.harnessRank === 1 ? 0.055 : m.harnessRank === 2 ? 0.022 : m.harnessRank === 3 ? 0.01 : 0;
      const rrfScore = Number((score + agreement + pathBoost + harnessPrior).toFixed(6));
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
