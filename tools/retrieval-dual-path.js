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
const { rewriteQuery, multiQueryVariants } = require('./retrieval-query-rewrite');
const { rerankCrossEncoderLite } = require('./rag-metrics');

const REPO = path.resolve(__dirname, '..');
const RRF_K = 60;

function parseArgs(argv) {
  const args = {
    query: '',
    limit: 10,
    json: false,
    rewrite: true,
    multiQuery: true,
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
    else if (a === '--no-multi-query') args.multiQuery = false;
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
      const prev = meta.get(key) || { path: key, sources: [], snippets: [] };
      prev.sources.push(item.source);
      if (item.snippet) prev.snippets.push(String(item.snippet).slice(0, 200));
      if (item.start_line) prev.start_line = item.start_line;
      if (item.end_line) prev.end_line = item.end_line;
      meta.set(key, prev);
    }
  }
  return [...scores.entries()]
    .map(([p, score]) => ({
      path: p,
      rrfScore: Number(score.toFixed(6)),
      sources: [...new Set(meta.get(p).sources)],
      snippet: meta.get(p).snippets[0] || '',
      start_line: meta.get(p).start_line,
      end_line: meta.get(p).end_line,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore || a.path.localeCompare(b.path));
}

function dualPathRetrieve(options = {}) {
  const queryIn = String(options.query || '').trim();
  if (!queryIn) throw new Error('--query required');
  const useMulti = options.multiQuery !== false;
  const useRewrite = options.rewrite !== false;
  const mq = useMulti
    ? multiQueryVariants(queryIn)
    : {
        ...rewriteQuery(queryIn),
        variants: useRewrite
          ? [{ query: rewriteQuery(queryIn).rewritten, kind: 'rewrite' }]
          : [{ query: queryIn, kind: 'original' }],
      };
  if (!useRewrite && useMulti) {
    // Keep multi-query structural variants but strip synonym expansions that
    // only appear via rewrite path... multiQueryVariants always rewrites;
    // for --no-rewrite force single original.
    mq.variants = [{ query: queryIn, kind: 'original' }];
    mq.rewritten = queryIn;
    mq.expansions = [];
    mq.rulesFired = [];
  }
  const limit = options.limit || 10;
  const include = options.pathInclude || [];
  const exclude = options.pathExclude || [];
  const pool = Math.max(limit, 15);

  const lists = [];
  const pathStatus = { harness: [], grepai: [] };
  const variantsUsed = [];

  let grepaeDone = false;
  for (const variant of mq.variants) {
    variantsUsed.push(variant);
    if (!options.grepaeOnly) {
      const harness = runHarness(variant.query, pool, options.repo || REPO);
      pathStatus.harness.push(harness.ok ? 'ok' : harness.error);
      if (harness.ok) {
        lists.push(
          harness.matches
            .filter((m) => pathAllowed(m.path, include, exclude))
            .map((m, i) => ({ ...m, rank: i + 1, source: `harness:${variant.kind}` })),
        );
      }
    }
    // Dense path once on the primary (rewrite preferred) — grepae is slower.
    if (
      !options.harnessOnly &&
      !grepaeDone &&
      (variant.kind === 'rewrite' || variant.kind === 'original' || mq.variants.length === 1)
    ) {
      const grepae = runGrepai(variant.query, pool, options.repo || REPO);
      pathStatus.grepai.push(grepae.ok ? 'ok' : grepae.error);
      grepaeDone = true;
      if (grepae.ok) {
        lists.push(
          grepae.matches
            .filter((m) => pathAllowed(m.path, include, exclude))
            .map((m, i) => ({ ...m, rank: i + 1, source: `grepai:${variant.kind}` })),
        );
      }
    }
  }

  let fused = rrfFuse(lists).slice(0, Math.max(limit * 2, limit));
  let rerankApplied = false;
  if (options.rerank !== false) {
    fused = rerankCrossEncoderLite(queryIn, fused).slice(0, limit);
    rerankApplied = true;
  } else {
    fused = fused.slice(0, limit);
  }

  return {
    query: queryIn,
    rewritten: mq.rewritten,
    rewriteRules: mq.rulesFired,
    expansions: mq.expansions,
    multiQuery: variantsUsed,
    filters: { pathInclude: include, pathExclude: exclude },
    pathStatus: {
      harness: pathStatus.harness[0] || 'skipped',
      grepai: pathStatus.grepai[0] || 'skipped',
      harnessLegs: pathStatus.harness,
      grepaiLegs: pathStatus.grepai,
    },
    fusion: 'rrf+multi_query',
    rrfK: RRF_K,
    rerank: rerankApplied ? 'cross_encoder_lite' : 'none',
    matches: fused,
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

module.exports = {
  dualPathRetrieve,
  rrfFuse,
  pathAllowed,
  runHarness,
  runGrepai,
  multiQueryVariants,
};
