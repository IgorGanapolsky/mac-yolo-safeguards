#!/usr/bin/env node
'use strict';

/**
 * Dual-path retrieval: hermes-retrieval-harness (sparse) + grepae (hybrid BM25+dense)
 * fused with Reciprocal Rank Fusion (RRF). Optional deterministic query rewrite
 * and path metadata filters.
 *
 * Usage:
 *   node tools/retrieval-dual-path.js --query "session not found" --json
 *   node tools/retrieval-dual-path.js --query "..." --limit 10 --path-include "tools/,hermes-mobile/src/"
 *   node tools/retrieval-dual-path.js --query "..." --no-rewrite --harness-only
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { rewriteQuery } = require('./retrieval-query-rewrite');

const REPO = path.resolve(__dirname, '..');
const RRF_K = 60;

function parseArgs(argv) {
  const args = {
    query: '',
    limit: 10,
    json: false,
    rewrite: true,
    rerank: true,
    harnessOnly: false,
    grepaeOnly: false,
    pathInclude: [],
    pathExclude: [],
    repo: REPO,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 10);
    else if (a === '--json') args.json = true;
    else if (a === '--no-rewrite') args.rewrite = false;
    else if (a === '--no-rerank') args.rerank = false;
    else if (a === '--harness-only') args.harnessOnly = true;
    else if (a === '--grepai-only' || a === '--grepae-only') args.grepaeOnly = true;
    else if (a === '--path-include') args.pathInclude = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--path-exclude') args.pathExclude = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--repo') args.repo = path.resolve(argv[++i] || REPO);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function pathAllowed(p, include, exclude) {
  const norm = String(p || '').replace(/\\/g, '/');
  if (exclude.some((ex) => norm.includes(ex))) return false;
  if (!include.length) return true;
  return include.some((inc) => norm.includes(inc));
}

function runHarness(query, limit, repo) {
  const script = path.join(REPO, 'tools', 'hermes-retrieval-harness.js');
  const r = spawnSync(
    process.execPath,
    [script, 'retrieve', '--query', query, '--limit', String(limit), '--json', '--repo', repo],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || '').slice(0, 300), matches: [] };
  }
  try {
    const body = JSON.parse(r.stdout);
    const matches = (body.matches || []).map((m, i) => ({
      path: m.path,
      rank: i + 1,
      score: m.score,
      snippet: m.snippet,
      source: 'harness',
    }));
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, error: error.message, matches: [] };
  }
}

function runGrepai(query, limit, repo = REPO) {
  const r = spawnSync(
    'grepai',
    ['search', query, '--json', '--compact'],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000, cwd: repo },
  );
  if (r.error && r.error.code === 'ENOENT') {
    return { ok: false, error: 'grepai CLI not found', matches: [] };
  }
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || '').slice(0, 300), matches: [] };
  }
  try {
    const body = JSON.parse(r.stdout);
    const list = Array.isArray(body) ? body : body.results || body.matches || [];
    const matches = list.slice(0, limit).map((m, i) => ({
      path: m.file_path || m.path || m.file,
      rank: i + 1,
      score: m.score,
      snippet: m.content || m.preview || m.snippet || '',
      start_line: m.start_line,
      end_line: m.end_line,
      source: 'grepai',
    })).filter((m) => m.path);
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, error: error.message, matches: [] };
  }
}

/**
 * Reciprocal Rank Fusion across ranked lists.
 * score(d) = Σ 1 / (k + rank_i(d))
 */
function rrfFuse(lists, k = RRF_K) {
  const scores = new Map();
  const meta = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!item.path) continue;
      const key = item.path;
      const add = 1 / (k + item.rank);
      scores.set(key, (scores.get(key) || 0) + add);
      const prev = meta.get(key) || { path: key, sources: [], snippets: [], score: null };
      prev.sources.push(item.source);
      if (item.snippet) prev.snippets.push(String(item.snippet).slice(0, 200));
      if (typeof item.score === 'number') {
        prev.score = prev.score == null ? item.score : Math.max(prev.score, item.score);
      }
      if (item.start_line) prev.start_line = item.start_line;
      if (item.end_line) prev.end_line = item.end_line;
      meta.set(key, prev);
    }
  }
  return [...scores.entries()]
    .map(([p, score]) => ({
      path: p,
      rrfScore: Number(score.toFixed(6)),
      score: meta.get(p).score,
      sources: [...new Set(meta.get(p).sources)],
      snippet: meta.get(p).snippets[0] || '',
      start_line: meta.get(p).start_line,
      end_line: meta.get(p).end_line,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore || a.path.localeCompare(b.path));
}

/**
 * Deterministic relevance rerank over an RRF-fused list.
 *
 * Pure function (no subprocess): blends a normalized RRF rank score, the raw
 * grepai/harness score, query-term coverage in the snippet+path, and a small
 * path-signal penalty for docs/tests corpora. Replaces rank-blind RRF with a
 * relevance-ordered list. `--no-rerank` restores the pure RRF order.
 */
function rerankByRelevance(matches, query, opts = {}) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const terms = String(query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const rrf = matches.map((m) => Number(m.rrfScore) || 0);
  const maxRrf = Math.max(0, ...rrf);
  const raw = matches.map((m) => (typeof m.score === 'number' ? m.score : 0));
  const maxRaw = Math.max(0, ...raw);
  const wRrf = opts.wRrf != null ? opts.wRrf : 0.45;
  const wRaw = opts.wRaw != null ? opts.wRaw : 0.25;
  const wCov = opts.wCov != null ? opts.wCov : 0.25;
  const wPath = opts.wPath != null ? opts.wPath : 0.05;
  const pathBonus = (p) => {
    const n = String(p || '').toLowerCase();
    if (n.includes('/docs/') || n.endsWith('.md')) return -0.15;
    if (n.includes('/tests/') || n.endsWith('.test.') || n.endsWith('.spec.')) return -0.10;
    return 0; // code / tooling roots stay neutral
  };
  return matches
    .map((m, i) => {
      const rrfNorm = maxRrf > 0 ? rrf[i] / maxRrf : 0;
      const rawNorm = maxRaw > 0 ? raw[i] / maxRaw : 0;
      const blob = `${m.snippet || ''} ${m.path || ''}`.toLowerCase();
      const matchCount = terms.length ? terms.filter((t) => blob.includes(t)).length : 0;
      const coverage = terms.length ? matchCount / terms.length : 0;
      const rerankScore = Math.min(
        1,
        Math.max(0, wRrf * rrfNorm + wRaw * rawNorm + wCov * coverage + wPath * pathBonus(m.path)),
      );
      return { ...m, rerankScore: Number(rerankScore.toFixed(4)), rerankRank: 0 };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore || a.path.localeCompare(b.path))
    .map((m, i) => ({ ...m, rerankRank: i + 1 }));
}

function dualPathRetrieve(options = {}) {
  const queryIn = String(options.query || '').trim();
  if (!queryIn) throw new Error('--query required');
  const rewrite = options.rewrite !== false ? rewriteQuery(queryIn) : { original: queryIn, rewritten: queryIn, expansions: [], rulesFired: [] };
  const q = rewrite.rewritten;
  const limit = options.limit || 10;
  const include = options.pathInclude || [];
  const exclude = options.pathExclude || [];

  const lists = [];
  const paths = { harness: null, grepai: null };

  if (!options.grepaeOnly) {
    paths.harness = runHarness(q, Math.max(limit, 15), options.repo || REPO);
    if (paths.harness.ok) {
      lists.push(
        paths.harness.matches
          .filter((m) => pathAllowed(m.path, include, exclude))
          .map((m, i) => ({ ...m, rank: i + 1 })),
      );
    }
  }
  if (!options.harnessOnly) {
    paths.grepai = runGrepai(q, Math.max(limit, 15), options.repo || REPO);
    if (paths.grepai.ok) {
      lists.push(
        paths.grepai.matches
          .filter((m) => pathAllowed(m.path, include, exclude))
          .map((m, i) => ({ ...m, rank: i + 1 })),
      );
    }
  }

  const fused = rrfFuse(lists).slice(0, limit);
  const rerankEnabled = options.rerank !== false;
  const matches = rerankEnabled ? rerankByRelevance(fused, q) : fused;
  return {
    query: queryIn,
    rewritten: rewrite.rewritten,
    rewriteRules: rewrite.rulesFired,
    expansions: rewrite.expansions,
    filters: { pathInclude: include, pathExclude: exclude },
    pathStatus: {
      harness: paths.harness ? (paths.harness.ok ? 'ok' : paths.harness.error) : 'skipped',
      grepai: paths.grepai ? (paths.grepai.ok ? 'ok' : paths.grepai.error) : 'skipped',
    },
    fusion: 'rrf',
    rrfK: RRF_K,
    rerankApplied: rerankEnabled,
    matches,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.query) {
      console.log(`Usage: node tools/retrieval-dual-path.js --query "..." [--json] [--path-include a,b] [--path-exclude c]`);
      process.exit(args.help ? 0 : 2);
    }
    const out = dualPathRetrieve(args);
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`query: ${out.query}`);
      if (out.rewritten !== out.query) console.log(`rewritten: ${out.rewritten}`);
      console.log(`paths: harness=${out.pathStatus.harness} grepai=${out.pathStatus.grepai}`);
      out.matches.forEach((m, i) => {
        console.log(`${i + 1}. ${m.rrfScore.toFixed(4)}  [${m.sources.join('+')}]  ${m.path}`);
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { dualPathRetrieve, rrfFuse, rerankByRelevance, pathAllowed, runHarness, runGrepai };
