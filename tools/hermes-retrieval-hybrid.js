#!/usr/bin/env node
'use strict';

/**
 * Hermes Retrieval Hybrid — layers embedding-based semantic search on top of the
 * keyword-only hermes-retrieval-harness.js using Reciprocal Rank Fusion (RRF),
 * plus query rewriting and metadata-aware path scoring.
 *
 * Design:
 *   The keyword harness is intentionally dependency-free (see
 *   docs/HERMES-RETRIEVAL-HARNESS.md) and does NOT call a provider. This tool
 *   is the optional semantic layer that activates when grepai + nomic-embed-text
 *   are available. It never blocks: if grepai is missing, it degrades to
 *   keyword-only with query-rewritten queries and metadata scoring.
 *
 * Pipeline:
 *   1. Query rewriting  — expand camelCase terms, add synonyms from a static map
 *   2. Keyword search   — hermes-retrieval-harness.js retrieve (BM25-style)
 *   3. Embedding search — grepai search (nomic-embed-text, when available)
 *   4. RRF combine      — Reciprocal Rank Fusion (k=60) over both ranked lists
 *   5. Metadata adjust  — path-role multipliers (source > api > docs > tools > tests)
 *   6. Sort + slice     — return top-k unified results
 *
 * Usage:
 *   node tools/hermes-retrieval-hybrid.js --query "how to fix USB tethering" --json
 *   node tools/hermes-retrieval-hybrid.js --query "..." --limit 10 --metadata
 *   node tools/hermes-retrieval-hybrid.js score "query" "path"              # metadata multiplier
 *
 * Exit 0 always (retrieval is best-effort; callers inspect results, not exit).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Import the keyword harness (claimed file — we only consume its exported API).
const harness = require('./hermes-retrieval-harness.js');
const REPO = path.resolve(__dirname, '..');

// Pinning per docs/agents/decision-stack.md: embedding drift is a silent regression
// vector. The model name is pinned here so CI can assert it hasn't changed.
const PINNED_EMBEDDING_MODEL = 'nomic-embed-text:latest';

// Isolated semantic-index clone (NOT the multi-worktree checkout — worktrees
// have a 384-byte empty-shell .grepai/index.gob). See grepai-index-canary.js.
const SEMANTIC_INDEX_DIR = path.join(
  process.env.HOME || '',
  '.hermes/semantic-index/mac-yolo-safeguards',
);
const GREPAI_BIN = 'grepai';
const RRF_K = 60; // standard RRF constant; balances recall vs rank-position bias

// ─── Query rewriting ──────────────────────────────────────────────

/**
 * Static synonym map for query rewriting. Terms are lowercased.
 * Values are arrays of additional tokens to inject.
 * This is deliberately small and curated — over-expansion regressed recall
 * in the July 2026 RAG audit (ai-regression-controls-july-2026.md §5.3).
 */
const SYNONYM_MAP = {
  leash: ['hermes-hardware-leash', 'usb-watchdog', 'kill-switch', 'reverse-tether'],
  tether: ['reverse-tether', 'usb', 'iphone', 'android'],
  gateway: ['mac-gate', 'pair-code', 'tailscale', 'server', 'macos'],
  pair: ['paircode', 'pair-code', 'connection', 'gateway'],
  chrome: ['browser', 'singleton', 'mcp-bridge', 'cdp'],
  agent: ['swarm', 'planner', 'worker', 'claude', 'cursor'],
  claim: ['ownership', 'lock', 'exclusive', 'barrier', 'barrier-free'],
  publish: ['social', 'linkedin', 'post', 'campaign'],
  freeze: ['mac-freeze', 'rescue', 'sluggish', 'cpu', 'fans'],
  retrieve: ['search', 'find', 'lookup', 'grep', 'semantic'],
  semantic: ['embedding', 'vector', 'meaning', 'nomic'],
  hybrid: ['rrf', 'rank-fusion', 'combination', 'multi-backend'],
  rerank: ['rank', 'score', 'fusion', 'cross-encoder'],
  chunk: ['fragment', 'segment', 'split', 'passage'],
  metadata: ['filter', 'field', 'tag', 'path-role'],
  embedding: ['vector', 'encoding', 'nomic', 'dense'],
  regression: ['anti-regression', 'fail-closed', 'gate', 'integrity'],
  eval: ['evaluation', 'benchmark', 'test', 'accuracy'],
  thumbgate: ['paid-companion', 'continuity', 'usb-leash', 'safeguards'],
  'social': ['linkedin', 'publish', 'campaign', 'gate'],
  'oat': ['apple', 'open', 'automation', 'tether'],
};

/**
 * Expand a query by splitting camelCase words and adding synonyms.
 * Returns the expanded query string (original tokens + expansions).
 */
function rewriteQuery(query) {
  const tokens = String(query || '')
    .split(/[^a-zA-Z0-9_.-]+/)
    .filter((t) => t.length >= 2);

  const expanded = [];
  const seen = new Set();

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      expanded.push(lower);
    }
    // CamelCase expansion: ChatScreen -> chat screen
    // Only split if the token has mixed casing AND each part is >= 3 chars
    // (so "LinkedIn" -> "linked" + "in" is skipped because "in" is 2 chars;
    //  the full token "linkedin" stays intact and its synonyms fire instead).
    if (/[a-z][A-Z]/.test(token)) {
      const parts = token
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 3);
      for (const part of parts) {
        if (!seen.has(part)) {
          seen.add(part);
          expanded.push(part);
        }
      }
    }
    // Synonym injection
    const synonyms = SYNONYM_MAP[lower];
    if (synonyms) {
      for (const syn of synonyms) {
        if (!seen.has(syn)) {
          seen.add(syn);
          expanded.push(syn);
        }
      }
    }
  }

  return expanded.filter((t) => t.length >= 3).join(' '); // filter noise tokens
}

// ─── Metadata-aware path scoring ───────────────────────────────────

/**
 * Compute a path-quality multiplier based on the role a file plays in the
 * codebase. This is applied AFTER RRF combination to bias the final ranking
 * toward production code over test noise.
 *
 * Mirrors the approach in hermes-retrieval-harness.js:pathQualityMultiplier
 * but adds source-role awareness for the hybrid layer.
 */
function metadataMultiplier(relativePath) {
  const p = String(relativePath || '').replace(/\\/g, '/');
  let m = 1.0;

  // Penalize test noise (must come before source boosts so source wins)
  if (
    /(^|\/)(?:__tests__|tests|test|mocks?)[\/]|\.test\.|\.spec\./i.test(p)
  ) {
    m *= 0.30;
  }
  // Generated code is stale by definition
  if (/\/generated\/|\.generated\.|\.gen\./i.test(p)) m *= 0.40;

  // Boost by role
  if (/\/app\/api\//i.test(p) || /\/api\/route\./i.test(p)) {
    m *= 1.25; // API routes are high-value endpoints
  } else if (/\/(src|lib)\//i.test(p) && !/\.test\./i.test(p)) {
    m *= 1.20; // production source
  } else if (/^\/?docs\//i.test(p) && /\.(md|mdx)$/i.test(p)) {
    m *= 1.10; // curated docs
  } else if (/^\/?tools\//i.test(p)) {
    m *= 1.05; // dev tools
  }

  // Config files use various dotfile patterns
  if (
    /(^|\/)(?:package\.json|tsconfig\.json|jest\.config\.)/i.test(p) ||
    /\.prettierrc\./i.test(p) ||
    /\.eslintrc\./i.test(p) ||
    /\.babelrc\./i.test(p) ||
    /\.config\.(?:js|ts|mjs|cjs)$/i.test(p)
  ) {
    m *= 0.80;
  }

  return m;
}

// ─── Grepai (embedding) backend ────────────────────────────────────

/**
 * Deduplicate grepai results by file_path, keeping the highest-scoring chunk
 * per file. grepai returns per-chunk results, so the same file can appear
 * multiple times at different ranks.
 */
function dedupeByPath(matches) {
  const best = new Map();
  for (const m of matches) {
    const p = m.path;
    const existing = best.get(p);
    if (!existing || (m.embeddingScore || m.score || 0) > (existing.embeddingScore || existing.score || 0)) {
      best.set(p, m);
    }
  }
  return [...best.values()];
}

/**
 * Check if grepai is available and its index is healthy.
 * Returns the working directory for grepai, or null if unavailable.
 */
function getGrepaiDir() {
  if (process.env.HYBRID_NO_EMBEDDING === '1') return null;

  // Check if the isolated semantic-index clone has a real index
  const localGob = path.join(REPO, '.grepai', 'index.gob');
  const isolatedGob = path.join(SEMANTIC_INDEX_DIR, '.grepai', 'index.gob');

  let indexDir = REPO;
  try {
    const localSize = fs.existsSync(localGob) ? fs.statSync(localGob).size : 0;
    const isolatedSize = fs.existsSync(isolatedGob) ? fs.statSync(isolatedGob).size : 0;

    // Prefer the isolated clone if the repo's local .grepai is an empty shell
    if (isolatedSize > 1024 && (localSize < 1024 || isolatedSize > localSize)) {
      indexDir = SEMANTIC_INDEX_DIR;
    }
  } catch (e) {
    // fall through — use REPO
  }

  // Verify grepai binary exists and the index dir has .grepai
  const grepaiOnPath = spawnSync('which', [GREPAI_BIN], { encoding: 'utf8' });
  if (grepaiOnPath.status !== 0 || !grepaiOnPath.stdout.trim()) return null;

  const gobPath = path.join(indexDir, '.grepai', 'index.gob');
  if (!fs.existsSync(gobPath) || fs.statSync(gobPath).size < 1024) return null;

  return indexDir;
}

/**
 * Run a grepai embedding search. Returns an array of { path, score, snippet }
 * matching the keyword harness output format, or null if grepai is unavailable.
 */
function grepaiSearch(query, limit, indexDir) {
  const result = spawnSync(
    GREPAI_BIN,
    ['search', query, '--json', '--limit', String(limit * 3)],
    { cwd: indexDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    process.stderr.write(
      `[hermes-retrieval-hybrid] grepai exited ${result.status}: ${(result.stderr || '').trim()}\n`,
    );
    return null;
  }

  let body;
  try {
    body = JSON.parse(result.stdout);
  } catch (error) {
    process.stderr.write(
      `[hermes-retrieval-hybrid] grepai returned invalid JSON: ${error.message}\n`,
    );
    return null;
  }

  const matches = Array.isArray(body) ? body : body.matches || body.results || body.hits || [];
  return matches
    .map((hit) => ({
      path: hit.file_path || hit.path || hit.relativePath || '',
      score: hit.score || 0,
      snippet: hit.content ? String(hit.content).slice(0, 360) : '',
      embeddingScore: hit.score || 0,
    }))
    .filter((m) => m.path);
}

// ─── Hybrid combination (RRF + weighted blend) ──────────────────────

/**
 * RRF-only combination (kept for comparison / --mode rrf).
 * RRF score for a doc = Σ 1/(RRF_K + rank) across all lists where the doc appears.
 * k=60 is the standard constant; it bounds the contribution of any single list
 * and prevents rank-1 spam from dominating.
 */
function rrfCombine(keywordMatches, embeddingMatches) {
  const fused = new Map(); // path -> entry

  // Keyword list (rank 1 = highest score)
  keywordMatches.forEach((match, rank) => {
    const rrf = 1 / (RRF_K + rank + 1);
    fused.set(match.path, {
      path: match.path,
      keywordScore: match.score || 0,
      embeddingScore: 0,
      rrfScore: rrf,
      sources: ['keyword'],
      reasons: match.reasons ? [...match.reasons] : [],
      snippet: match.snippet || '',
      bytes: match.bytes || 0,
    });
  });

  // Embedding list (rank 1 = highest score)
  embeddingMatches.forEach((match, rank) => {
    const rrf = 1 / (RRF_K + rank + 1);
    const existing = fused.get(match.path);
    if (existing) {
      // Keep the best (earliest/highest) RRF contribution and embedding score
      existing.rrfScore = Math.max(existing.rrfScore, rrf);
      existing.embeddingScore = Math.max(existing.embeddingScore || 0, match.embeddingScore || match.score || 0);
      if (!existing.sources.includes('embedding')) existing.sources.push('embedding');
      if (!existing.reasons.includes('rerank:embedding-match')) existing.reasons.push('rerank:embedding-match');
    } else {
      fused.set(match.path, {
        path: match.path,
        keywordScore: 0,
        embeddingScore: match.embeddingScore || match.score || 0,
        rrfScore: rrf,
        sources: ['embedding'],
        reasons: ['rerank:embedding-match'],
        snippet: match.snippet || '',
        bytes: 0,
      });
    }
  });

  // Apply metadata multiplier to the RRF score
  return applyMetadataAndSort([...fused.values()]);
}

/**
 * Weighted hybrid combination (default mode).
 *
 * Strategy: keyword score is the PRIMARY signal (preserved from the BM25-style
 * harness). Embedding score is a SECONDARY bonus that boosts files appearing in
 * BOTH keyword and embedding results, and can inject embedding-only files at a
 * capped score below the lowest keyword match (so embedding noise never
 * displaces known-good keyword results).
 *
 * This addresses two failure modes observed in July 2026 testing:
 *   1. RRF dilution: "mobile app discovers computers" → gatewayDiscovery.ts
 *      dropped from #2 to #7 because equal-weight RRF let embedding noise
 *      outrank a strong keyword match.
 *   2. Keyword displacement: "resource-lease singleton" → resource-lease.js
 *      (exists in repo but not grepai index) was pushed below top-k because
 *      the weighted blend treated embeddingNorm=0 as a penalty.
 *
 * Formula:
 *   keywordPrimary = keywordScore (raw, unnormalized — preserves dynamic range)
 *   embeddingBonus = inBoth ? embeddingNorm * 15 : 0  (max 15 points, can't dominate)
 *   embeddingOnly  = !inKeyword ? embeddingNorm * 8 : 0  (capped low)
 *   hybridRaw = keywordPrimary + embeddingBonus + embeddingOnly
 * Then apply metadataMultiplier * (keywordPrimary + embeddingBonus + embeddingOnly)
 */
function hybridCombine(keywordMatches, embeddingMatches, weightKeyword = 0.6, weightEmbedding = 0.4) {
  const fused = new Map(); // path -> entry

  const maxKw = Math.max(...keywordMatches.map((m) => m.score || 0), 1);
  const maxEmb = Math.max(...embeddingMatches.map((m) => m.embeddingScore || m.score || 0), 0.0001);
  // Cap for embedding-only files: the lowest keyword score, so they never
  // displace a file that the keyword harness found.
  const minKeywordScore = keywordMatches.length > 0
    ? Math.min(...keywordMatches.map((m) => m.score || 0))
    : 0;
  const embeddingCap = minKeywordScore > 0 ? minKeywordScore * 0.5 : 0;

  // Keyword list (primary signal)
  keywordMatches.forEach((match, rank) => {
    fused.set(match.path, {
      path: match.path,
      keywordScore: match.score || 0,
      keywordRank: rank + 1,
      embeddingScore: 0,
      embeddingNorm: 0,
      sources: ['keyword'],
      reasons: match.reasons ? [...match.reasons] : [],
      snippet: match.snippet || '',
      bytes: match.bytes || 0,
    });
  });

  // Embedding list (secondary signal)
  embeddingMatches.forEach((match, rank) => {
    const embNorm = (match.embeddingScore || match.score || 0) / maxEmb;
    const newScore = match.embeddingScore || match.score || 0;
    const existing = fused.get(match.path);
    if (existing) {
      // File in BOTH lists: add embedding bonus (can't exceed keyword score)
      if (newScore > existing.embeddingScore) {
        existing.embeddingScore = newScore;
        existing.embeddingNorm = embNorm;
      }
      if (rank + 1 < (existing.embeddingRank || Infinity)) {
        existing.embeddingRank = rank + 1;
      }
      if (!existing.sources.includes('embedding')) existing.sources.push('embedding');
      if (!existing.reasons.includes('rerank:embedding-match')) existing.reasons.push('rerank:embedding-match');
    } else {
      // File ONLY in embedding: cap below lowest keyword score
      fused.set(match.path, {
        path: match.path,
        keywordScore: 0,
        keywordRank: null,
        embeddingScore: newScore,
        embeddingNorm: embNorm,
        embeddingRank: rank + 1,
        sources: ['embedding'],
        reasons: ['rerank:embedding-only'],
        snippet: match.snippet || '',
        bytes: 0,
      });
    }
  });

  // Compute hybrid score:
  // - Files in BOTH keyword and embedding: multiplicative boost (keyword score
  //   amplified by embedding relevance, up to 1.8x for top embedding match).
  //   This lets a moderate-keyword-score file with a top embedding match
  //   outrank a high-keyword-score file with no embedding signal.
  // - Files ONLY in keyword: keyword score unchanged (no penalty).
  // - Files ONLY in embedding: capped at 40% of max keyword score (can't
  //   displace known-good keyword results).
  const EMBEDDING_BOOST_MAX = 0.8;   // max 80% boost for top embedding match
  const EMBEDDING_ONLY_CAP = 0.4;    // embedding-only files capped at 40% of max kw score

  const blend = (entry) => {
    if (entry.keywordScore > 0 && entry.embeddingScore > 0) {
      // In BOTH lists: boost by embedding relevance
      return Number((
        entry.keywordScore * (1 + EMBEDDING_BOOST_MAX * entry.embeddingNorm) + 0.001
      ).toFixed(6));
    }
    if (entry.keywordScore > 0) {
      // Keyword only: preserve exact ranking
      return Number((entry.keywordScore + 0.001).toFixed(6));
    }
    // Embedding only: capped below the lowest keyword score
    return Number((maxKw * EMBEDDING_ONLY_CAP * entry.embeddingNorm + 0.001).toFixed(6));
  };

  return applyMetadataAndSort([...fused.values()], blend);
}

/**
 * Shared: dedupe sources/reasons, apply metadata multiplier, sort.
 * @param {Array} entries
 * @param {function} [scoreFn] — custom scoring function (default: RRF raw score)
 */
function applyMetadataAndSort(entries, scoreFn) {
  const adjusted = entries.map((entry) => {
    const mult = metadataMultiplier(entry.path);
    const raw = scoreFn ? scoreFn(entry) : entry.rrfScore || 0;
    return {
      ...entry,
      sources: [...new Set(entry.sources)],
      reasons: [...new Set(entry.reasons)],
      hybridRaw: Number((raw || 0).toFixed(6)),
      finalScore: Number((raw * mult + 0.001).toFixed(6)),
      metadataMultiplier: mult,
    };
  });

  adjusted.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.path.localeCompare(b.path);
  });

  return adjusted;
}

// ─── Main retrieve ─────────────────────────────────────────────────

/**
 * Hybrid retrieve: combines keyword + embedding search via RRF or weighted blend.
 *
 * @param {string} query - Original (pre-rewrite) query
 * @param {object} options - { repo, limit, maxFiles, maxBytes, skipEmbedding, mode, weightKeyword, weightEmbedding }
 *   mode: 'hybrid' (default, weighted blend) | 'rrf' (pure reciprocal rank fusion)
 * @returns {object} Hybrid retrieval result
 */
function retrieve(query, options = {}) {
  const limit = options.limit || 8;
  const maxFiles = options.maxFiles || 5000;
  const repo = path.resolve(options.repo || REPO);
  const mode = options.mode || 'hybrid';

  // Step 1: Query rewriting
  const rewrittenQuery = rewriteQuery(query);
  const didRewrite = rewrittenQuery !== query.toLowerCase();

  // Step 2: Keyword retrieval (from the dependency-free harness)
  const keywordResult = harness.retrieve(rewrittenQuery, {
    repo,
    limit: maxFiles, // get all keyword candidates for combination
    maxFiles,
    maxBytes: options.maxBytes || 240000,
  });

  const keywordMatches = keywordResult.matches || [];

  // Step 3: Embedding retrieval (when grepai + index available)
  let embeddingMatches = [];
  let embeddingBackend = null;
  let embeddingAvailable = false;

  if (!options.skipEmbedding) {
    const grepaiDir = getGrepaiDir();
    if (grepaiDir) {
      embeddingBackend = grepaiDir;
      const raw = grepaiSearch(rewrittenQuery, limit, grepaiDir);
      if (raw) {
        embeddingMatches = dedupeByPath(raw);
        embeddingAvailable = true;
      }
    }
  }

  // Step 4: Combine via selected strategy
  let combined;
  if (mode === 'rrf' && embeddingAvailable) {
    combined = rrfCombine(keywordMatches, embeddingMatches);
  } else if (mode === 'hybrid' && embeddingAvailable) {
    combined = hybridCombine(
      keywordMatches,
      embeddingMatches,
      options.weightKeyword || 0.6,
      options.weightEmbedding || 0.4,
    );
  } else {
    // Fallback: keyword-only with metadata adjustment
    combined = applyMetadataAndSort(
      keywordMatches.map((m) => ({ ...m, sources: ['keyword'], rrfScore: m.score || 0 })),
      (entry) => entry.rrfScore || 0,
    );
  }

  const scoreKey = mode === 'rrf' ? 'rrfScore' : 'hybridRaw';

  // Slice to limit, keep public fields including metadata multiplier
  const matches = combined
    .slice(0, limit)
    .map((entry, i) => ({
      path: entry.path,
      score: Number(entry.finalScore.toFixed(6)),
      rank: i + 1,
      keywordScore: Number((entry.keywordScore || entry.score || 0).toFixed(4)),
      embeddingScore: Number((entry.embeddingScore || 0).toFixed(4)),
      hybridRaw: entry.hybridRaw,
      rrfScore: entry.rrfScore || null,
      metadataMultiplier: entry.metadataMultiplier,
      sources: entry.sources,
      reasons: entry.reasons.slice(0, 8),
      snippet: entry.snippet,
      bytes: entry.bytes,
    }));

  return {
    query,
    mode,
    rewrittenQuery: didRewrite ? rewrittenQuery : undefined,
    rewritten: didRewrite,
    repo,
    fileCount: keywordResult.fileCount,
    maxFiles,
    matches,
    backends: {
      keyword: { provider: 'hermes-retrieval-harness', count: keywordMatches.length },
      embedding: embeddingAvailable
        ? { provider: 'grepai', model: PINNED_EMBEDDING_MODEL, indexDir: embeddingBackend, available: true, count: embeddingMatches.length }
        : { provider: 'grepai', model: PINNED_EMBEDDING_MODEL, available: false, count: 0 },
    },
    rrfK: RRF_K,
    embeddingModel: PINNED_EMBEDDING_MODEL,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    command: 'retrieve',
    query: '',
    repo: REPO,
    limit: 8,
    maxFiles: 5000,
    maxBytes: 240000,
    mode: 'hybrid',
    skipEmbedding: false,
    json: false,
    score: false,
    help: false,
    positional: [],
  };

  if (argv[0] && !argv[0].startsWith('--')) {
    args.command = argv.shift();
  }

  if (args.command === 'score') {
    // `score <query> <path>` — collect positional args after flags
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === '--json') args.json = true;
      else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
      else args.positional.push(argv[i]);
    }
    return args;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || args.query;
    else if (a === '--repo') args.repo = path.resolve(argv[++i] || REPO);
    else if (a === '--limit') args.limit = Number(argv[++i] || 8);
    else if (a === '--max-files') args.maxFiles = Number(argv[++i] || 5000);
    else if (a === '--max-bytes') args.maxBytes = Number(argv[++i] || 240000);
    else if (a === '--skip-embedding') args.skipEmbedding = true;
    else if (a === '--mode') args.mode = argv[++i] || args.mode;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.query) args.query = a;
    else throw new Error(`Unknown argument: ${a}`);
  }

  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`
Usage: node tools/hermes-retrieval-hybrid.js [retrieve|score] [options]

retrieve (default):
  --query <text>       Search query
  --repo <path>        Repository root (default: repo root)
  --limit <n>          Max results (default: 8)
  --mode <hybrid|rrf>  Combination strategy (default: hybrid)
  --skip-embedding     Skip grepai embedding search, keyword-only
  --json               Output JSON

score:
  <query> <path>       Print the metadata multiplier for a path

Examples:
  node tools/hermes-retrieval-hybrid.js --query "hardware leash USB watchdog"
  node tools/hermes-retrieval-hybrid.js --query "fix USB tethering on Mac" --skip-embedding --json
  node tools/hermes-retrieval-hybrid.js score "dummy" "tools/resource-lease.js"
`);
    return;
  }

  if (args.command === 'score') {
    if (args.positional.length < 2) {
      throw new Error('score requires <query> <path>');
    }
    const result = metadataMultiplier(args.positional[1]);
    if (args.json) {
      console.log(JSON.stringify({ path: args.positional[1], metadataMultiplier: result }));
    } else {
      console.log(result.toFixed(4));
    }
    return;
  }

  const result = retrieve(args.query, {
    repo: args.repo,
    limit: args.limit,
    maxFiles: args.maxFiles,
    maxBytes: args.maxBytes,
    mode: args.mode,
    skipEmbedding: args.skipEmbedding,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Hybrid retrieval: ${args.query}`);
    console.log(`Rewritten: ${result.rewritten ? result.rewrittenQuery : '(no expansion needed)'}`);
    console.log(
      `Backends: keyword=${result.backends.keyword.count} · ` +
        `embedding=${result.backends.embedding.available ? result.backends.embedding.count : 'unavailable'} ` +
        `(${result.backends.embedding.model})`,
    );
    console.log(`Files scanned: ${result.fileCount} · mode=${result.mode} · RRF k=${result.rrfK}`);
    console.log('');
    for (const match of result.matches) {
      console.log(
        `  ${match.rank}  ${match.path}  score=${match.score.toFixed(4)}  ` +
          `keyword=${match.keywordScore.toFixed(4)} emb=${match.embeddingScore.toFixed(4)} ` +
          `mult=${match.metadataMultiplier.toFixed(2)}  [${match.sources.join('+')}]`,
      );
      if (match.snippet) console.log(`     ${match.snippet.slice(0, 200)}`);
    }
  }
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  retrieve,
  rewriteQuery,
  rrfCombine,
  hybridCombine,
  metadataMultiplier,
  grepaiSearch,
  getGrepaiDir,
  applyMetadataAndSort,
  dedupeByPath,
  RRF_K,
  PINNED_EMBEDDING_MODEL,
  SYNONYM_MAP,
  parseArgs,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
