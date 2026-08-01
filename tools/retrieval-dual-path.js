#!/usr/bin/env node
'use strict';

/**
 * Dual-path retrieval: hermes-retrieval-harness (sparse) + grepae (hybrid BM25+dense)
 * fused with Reciprocal Rank Fusion (RRF), then second-stage rerank
 * (cross-encoder / ColBERT-lite / ensemble / optional LLM).
 *
 * Usage:
 *   node tools/retrieval-dual-path.js --query "session not found" --json
 *   node tools/retrieval-dual-path.js --query "..." --limit 10 --path-include "tools/,hermes-mobile/src/"
 *   node tools/retrieval-dual-path.js --query "..." --no-rewrite --harness-only
 *   node tools/retrieval-dual-path.js --query "..." --rerank ensemble --json
 *   node tools/retrieval-dual-path.js --query "..." --no-rerank --json
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { rewriteQuery } = require('./retrieval-query-rewrite');
const { rerank } = require('./retrieval-rerank');
const { rrfFuse, DEFAULT_K: RRF_K } = require('./retrieval-rrf');
// multi-query is optional heavy path — lazy require in dualPathRetrieve

const REPO = path.resolve(__dirname, '..');
const DEFAULT_RERANK = process.env.HERMES_RERANK_STRATEGY || 'ensemble';

function parseArgs(argv) {
  const args = {
    query: '',
    limit: 10,
    json: false,
    rewrite: true,
    harnessOnly: false,
    grepaeOnly: false,
    pathInclude: [],
    pathExclude: [],
    repo: REPO,
    rerank: DEFAULT_RERANK,
    llmRerank: process.env.HERMES_LLM_RERANK === '1',
    candidatePool: 30,
    multiQuery: process.env.HERMES_MULTI_QUERY === '1',
    principal: process.env.HERMES_RETRIEVE_PRINCIPAL || '',
    acl: process.env.HERMES_DOCUMENT_ACL || '',
    trace: process.env.HERMES_TURN_TRACE === '1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 10);
    else if (a === '--json') args.json = true;
    else if (a === '--no-rewrite') args.rewrite = false;
    else if (a === '--harness-only') args.harnessOnly = true;
    else if (a === '--grepai-only' || a === '--grepae-only') args.grepaeOnly = true;
    else if (a === '--path-include') args.pathInclude = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--path-exclude') args.pathExclude = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--repo') args.repo = path.resolve(argv[++i] || REPO);
    else if (a === '--rerank') args.rerank = argv[++i] || DEFAULT_RERANK;
    else if (a === '--no-rerank') args.rerank = 'none';
    else if (a === '--llm-rerank') args.llmRerank = true;
    else if (a === '--multi-query') args.multiQuery = true;
    else if (a === '--no-multi-query') args.multiQuery = false;
    else if (a === '--candidate-pool') args.candidatePool = Number(argv[++i] || 30);
    else if (a === '--principal') args.principal = argv[++i] || '';
    else if (a === '--acl') args.acl = argv[++i] || '';
    else if (a === '--trace') args.trace = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

/**
 * Apply document ACL + optional turn-trace write (production observability).
 */
function finalizeRetrieveResult(result, options = {}) {
  const started = options._startedAt || Date.now();
  let matches = result.matches || [];
  let aclMeta = { aclApplied: false };
  if (options.acl || options.principal) {
    try {
      const { loadAcl, filterMatchesByAcl } = require('./production-ops');
      const acl = options.acl ? loadAcl(options.acl) : null;
      const filtered = filterMatchesByAcl(matches, options.principal || '', acl);
      matches = filtered.matches;
      aclMeta = {
        aclApplied: filtered.aclApplied,
        principal: options.principal || null,
        filtered: filtered.filtered,
        reason: filtered.reason,
      };
    } catch (error) {
      aclMeta = {
        aclApplied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const out = {
    ...result,
    matches,
    acl: aclMeta,
    latencyMs: Date.now() - started,
  };
  if (options.trace || process.env.HERMES_TURN_TRACE === '1') {
    try {
      const { buildTurnTrace, writeTurnTrace } = require('./production-ops');
      const trace = buildTurnTrace({
        query: out.query,
        route: options.route || { id: 'dual-path' },
        principal: options.principal || null,
        tenant: options.tenant || null,
        retrieval: {
          backend: out.fusion,
          rewritten: out.rewritten,
          multiQuery: out.multiQuery,
          rerank: out.rerank,
          matches: out.matches,
          latencyMs: out.latencyMs,
        },
        acl: aclMeta,
        latencyMs: out.latencyMs,
      });
      out.tracePath = writeTurnTrace(trace, { dir: options.traceDir });
      out.traceId = trace.id;
    } catch (error) {
      out.traceError = error instanceof Error ? error.message : String(error);
    }
  }
  return out;
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

async function dualPathRetrieve(options = {}) {
  const _startedAt = Date.now();
  const queryIn = String(options.query || '').trim();
  if (!queryIn) throw new Error('--query required');
  const rewrite = options.rewrite !== false ? rewriteQuery(queryIn) : { original: queryIn, rewritten: queryIn, expansions: [], rulesFired: [] };
  const q = rewrite.rewritten;
  const limit = options.limit || 10;
  const include = options.pathInclude || [];
  const exclude = options.pathExclude || [];
  const pool = Math.max(limit, options.candidatePool || 30);
  const rerankStrategy = options.rerank === undefined ? DEFAULT_RERANK : options.rerank;

  // Optional multi-query fan-out (deterministic variants → dual-path each → RRF).
  // Uses multi-query module which itself calls dual-path without multi-query recursion.
  let multiQueryMeta = { applied: false };
  if (options.multiQuery) {
    const { multiQueryRetrieve } = require('./retrieval-multi-query');
    const mq = await multiQueryRetrieve({
      query: queryIn,
      limit: pool,
      maxVariants: options.maxVariants || 5,
      llm: Boolean(options.llmMultiQuery),
      pathInclude: include,
      pathExclude: exclude,
      repo: options.repo || REPO,
    });
    multiQueryMeta = {
      applied: true,
      variantCount: mq.variantCount,
      variants: mq.variants,
      llm: mq.llm,
    };
    // Honor path filters after multi-query fuse (CLI children may not inherit filters).
    let matches = (mq.matches || [])
      .filter((m) => pathAllowed(m.path, include, exclude))
      .slice(0, limit);
    let rerankMeta = { applied: false, strategy: 'none' };
    if (rerankStrategy && rerankStrategy !== 'none' && mq.matches?.length > 1) {
      try {
        const rr = await rerank({
          query: q,
          candidates: mq.matches,
          strategy: rerankStrategy,
          limit,
          llm: Boolean(options.llmRerank),
          embedder: options.embedder,
          chat: options.chat,
        });
        matches = (rr.matches || []).map((m) => ({
          path: m.path,
          rrfScore: m.rrfScore,
          rerankScore: m.rerankScore,
          sources: m.sources || [],
          snippet: m.snippet || '',
          method: m.method,
        }));
        rerankMeta = {
          applied: true,
          strategy: rr.strategy,
          llmApplied: rr.llmApplied,
          elapsedMs: rr.elapsedMs,
        };
      } catch (error) {
        rerankMeta = {
          applied: false,
          strategy: rerankStrategy,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return finalizeRetrieveResult(
      {
        query: queryIn,
        rewritten: rewrite.rewritten,
        rewriteRules: rewrite.rulesFired,
        expansions: rewrite.expansions,
        filters: { pathInclude: include, pathExclude: exclude },
        pathStatus: { harness: 'via-multi-query', grepai: 'via-multi-query' },
        fusion: 'rrf-multi-query',
        rrfK: RRF_K,
        multiQuery: multiQueryMeta,
        rerank: rerankMeta,
        matches,
      },
      { ...options, _startedAt },
    );
  }

  const lists = [];
  const paths = { harness: null, grepai: null };

  if (!options.grepaeOnly) {
    paths.harness = runHarness(q, Math.max(pool, 15), options.repo || REPO);
    if (paths.harness.ok) {
      lists.push(
        paths.harness.matches
          .filter((m) => pathAllowed(m.path, include, exclude))
          .map((m, i) => ({ ...m, rank: i + 1 })),
      );
    }
  }
  if (!options.harnessOnly) {
    paths.grepai = runGrepai(q, Math.max(pool, 15), options.repo || REPO);
    if (paths.grepai.ok) {
      lists.push(
        paths.grepai.matches
          .filter((m) => pathAllowed(m.path, include, exclude))
          .map((m, i) => ({ ...m, rank: i + 1 })),
      );
    }
  }

  // Weighted RRF: harness prioritized for identifier-heavy code ranking quality
  // (measured 2026-08-01: plain RRF buried agent-swarm-harness at dual@6).
  const fused = rrfFuse(lists, { k: RRF_K, query: q }).slice(0, pool);
  let matches = fused.slice(0, limit);
  let rerankMeta = { applied: false, strategy: 'none' };

  if (rerankStrategy && rerankStrategy !== 'none' && fused.length > 1) {
    try {
      const rr = await rerank({
        query: q,
        candidates: fused,
        strategy: rerankStrategy,
        limit,
        llm: Boolean(options.llmRerank),
        embedder: options.embedder,
        chat: options.chat,
      });
      matches = (rr.matches || []).map((m) => ({
        path: m.path,
        rrfScore: m.rrfScore,
        rerankScore: m.rerankScore,
        sources: m.sources || [],
        snippet: m.snippet || '',
        start_line: m.start_line,
        end_line: m.end_line,
        priorRank: m.priorRank,
        method: m.method,
        components: m.components,
      }));
      rerankMeta = {
        applied: true,
        strategy: rr.strategy,
        llmApplied: rr.llmApplied,
        llmError: rr.llmError,
        elapsedMs: rr.elapsedMs,
        capabilities: rr.capabilities,
      };
    } catch (error) {
      rerankMeta = {
        applied: false,
        strategy: rerankStrategy,
        error: error instanceof Error ? error.message : String(error),
      };
      matches = fused.slice(0, limit);
    }
  }

  return finalizeRetrieveResult(
    {
      query: queryIn,
      rewritten: rewrite.rewritten,
      rewriteRules: rewrite.rulesFired,
      expansions: rewrite.expansions,
      filters: { pathInclude: include, pathExclude: exclude },
      pathStatus: {
        harness: paths.harness ? (paths.harness.ok ? 'ok' : paths.harness.error) : 'skipped',
        grepai: paths.grepai ? (paths.grepai.ok ? 'ok' : paths.grepai.error) : 'skipped',
      },
      fusion: 'weighted-rrf',
      rrfK: RRF_K,
      multiQuery: multiQueryMeta,
      rerank: rerankMeta,
      matches,
    },
    { ...options, _startedAt },
  );
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (args.help || !args.query) {
        console.log(
          `Usage: node tools/retrieval-dual-path.js --query "..." [--json] [--rerank ensemble|cross_encoder|colbert_lite|none] [--llm-rerank]`,
        );
        process.exit(args.help ? 0 : 2);
      }
      const out = await dualPathRetrieve(args);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(`query: ${out.query}`);
        if (out.rewritten !== out.query) console.log(`rewritten: ${out.rewritten}`);
        console.log(
          `paths: harness=${out.pathStatus.harness} grepai=${out.pathStatus.grepai} rerank=${out.rerank?.strategy || 'none'} applied=${Boolean(out.rerank?.applied)}`,
        );
        out.matches.forEach((m, i) => {
          const score = m.rerankScore != null ? m.rerankScore : m.rrfScore;
          const src = (m.sources || []).join('+') || '-';
          console.log(`${i + 1}. ${Number(score).toFixed(4)}  [${src}]  ${m.path}`);
        });
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    }
  })();
}

module.exports = { dualPathRetrieve, rrfFuse, pathAllowed, runHarness, runGrepai, finalizeRetrieveResult };
