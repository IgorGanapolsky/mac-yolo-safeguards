#!/usr/bin/env node
'use strict';

/**
 * Multi-query expansion for dual-path retrieval.
 *
 * Generates N deterministic query variants (template paraphrases + synonym rewrite),
 * retrieves each, then RRF-fuses paths. No free-form LLM paraphrases by default
 * (CI-stable). Optional --llm adds local Ollama paraphrases when available.
 *
 *   node tools/retrieval-multi-query.js --query "session not found" --json
 *   node tools/retrieval-multi-query.js --query "..." --llm --json
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { rewriteQuery } = require('./retrieval-query-rewrite');
const { rrfFuse } = require('./retrieval-dual-path');

const REPO = path.resolve(__dirname, '..');
const RRF_K = 60;

/** Deterministic paraphrase templates — no LLM. */
const TEMPLATES = [
  (q) => q,
  (q) => `how to fix ${q}`,
  (q) => `where is code for ${q}`,
  (q) => `${q} implementation`,
  (q) => `troubleshoot ${q}`,
];

function parseArgs(argv) {
  const args = {
    query: '',
    limit: 10,
    json: false,
    llm: false,
    maxVariants: 5,
    perQueryLimit: 12,
    noRewrite: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 10);
    else if (a === '--json') args.json = true;
    else if (a === '--llm') args.llm = true;
    else if (a === '--max-variants') args.maxVariants = Number(argv[++i] || 5);
    else if (a === '--no-rewrite') args.noRewrite = true;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function uniqueQueries(list) {
  const seen = new Set();
  const out = [];
  for (const q of list) {
    const key = String(q || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(q).trim());
  }
  return out;
}

function deterministicVariants(query, maxVariants) {
  const base = String(query || '').trim();
  if (!base) return [];
  // Prefer original + synonym rewrite first (highest signal), then templates.
  const variants = [base];
  const rewritten = rewriteQuery(base);
  if (rewritten.rewritten && rewritten.rewritten !== base) {
    variants.push(rewritten.rewritten);
  }
  for (const fn of TEMPLATES) {
    variants.push(fn(base));
  }
  return uniqueQueries(variants).slice(0, maxVariants);
}

function llmParaphrases(query, n = 2) {
  const model = process.env.HERMES_MULTI_QUERY_MODEL || 'qwen2.5:3b-64k';
  const prompt =
    `Rewrite the search query into ${n} short alternative phrasings for code search.\n` +
    `Query: ${query}\n` +
    `Return ONLY a JSON array of strings, no markdown.`;
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.3, num_predict: 120 },
  });
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '--max-time',
      '45',
      'http://127.0.0.1:11434/api/chat',
      '-H',
      'Content-Type: application/json',
      '-d',
      body,
    ],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  if (r.status !== 0) return { ok: false, variants: [], error: (r.stderr || r.stdout || '').slice(0, 160) };
  try {
    const j = JSON.parse(r.stdout || '{}');
    const content = j?.message?.content || '';
    const m = content.match(/\[[\s\S]*\]/);
    if (!m) return { ok: false, variants: [], error: 'no JSON array in LLM response' };
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return { ok: false, variants: [], error: 'not an array' };
    return { ok: true, variants: arr.map(String).filter(Boolean) };
  } catch (e) {
    return { ok: false, variants: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function runDualOnce(query, limit) {
  const dual = path.join(REPO, 'tools', 'retrieval-dual-path.js');
  const r = spawnSync(
    process.execPath,
    [
      dual,
      '--query',
      query,
      '--limit',
      String(limit),
      '--candidate-pool',
      String(Math.max(limit, 15)),
      '--no-rerank',
      '--no-multi-query', // prevent recursive multi-query fan-out
      '--json',
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
  );
  // dual-path always rewrites by default; pass --no-rewrite only if we already expanded
  // We re-invoke with rewrite left on for synonym benefit on templates.
  if (r.status !== 0) {
    return { ok: false, matches: [], error: (r.stderr || r.stdout || '').slice(0, 200) };
  }
  try {
    const body = JSON.parse(r.stdout);
    return { ok: true, matches: body.matches || [], pathStatus: body.pathStatus };
  } catch (e) {
    return { ok: false, matches: [], error: e.message };
  }
}

/**
 * Multi-query retrieve + RRF fuse.
 */
async function multiQueryRetrieve(options = {}) {
  const queryIn = String(options.query || '').trim();
  if (!queryIn) throw new Error('--query required');
  const limit = options.limit || 10;
  const maxVariants = options.maxVariants || 5;
  const perQueryLimit = options.perQueryLimit || 12;

  let variants = deterministicVariants(queryIn, maxVariants);
  if (options.noRewrite) {
    // strip synonym rewrite variants — keep only templates on raw
    variants = uniqueQueries(TEMPLATES.map((fn) => fn(queryIn))).slice(0, maxVariants);
  }

  let llmMeta = { applied: false };
  if (options.llm) {
    const llm = llmParaphrases(queryIn, 2);
    llmMeta = { applied: llm.ok, error: llm.error, raw: llm.variants };
    if (llm.ok) variants = uniqueQueries([...variants, ...llm.variants]).slice(0, maxVariants + 2);
  }

  const lists = [];
  const perQuery = [];
  for (const v of variants) {
    const run = runDualOnce(v, perQueryLimit);
    perQuery.push({
      query: v,
      ok: run.ok,
      hitCount: (run.matches || []).length,
      error: run.error,
      pathStatus: run.pathStatus,
    });
    if (run.ok && run.matches?.length) {
      lists.push(
        run.matches.map((m, i) => ({
          path: m.path,
          rank: i + 1,
          source: `mq:${v.slice(0, 40)}`,
          snippet: m.snippet,
          rrfScore: m.rrfScore,
        })),
      );
    }
  }

  const fused = rrfFuse(lists, RRF_K).slice(0, limit);
  return {
    ok: lists.length > 0,
    query: queryIn,
    variants,
    variantCount: variants.length,
    llm: llmMeta,
    perQuery,
    fusion: 'rrf-multi-query',
    rrfK: RRF_K,
    matches: fused,
  };
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (args.help || !args.query) {
        console.log(
          'Usage: node tools/retrieval-multi-query.js --query "..." [--limit 10] [--llm] [--json]',
        );
        process.exit(args.help ? 0 : 2);
      }
      const out = await multiQueryRetrieve(args);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(`multi-query n=${out.variantCount} fused=${out.matches.length}`);
        out.variants.forEach((v, i) => console.log(`  q${i + 1}: ${v}`));
        out.matches.forEach((m, i) => {
          console.log(`${i + 1}. ${m.rrfScore.toFixed(4)}  ${m.path}`);
        });
      }
      process.exit(out.ok ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    }
  })();
}

module.exports = {
  multiQueryRetrieve,
  deterministicVariants,
  llmParaphrases,
  uniqueQueries,
  TEMPLATES,
};
