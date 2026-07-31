#!/usr/bin/env node
'use strict';

/**
 * Second-stage reranking for dual-path retrieval.
 *
 * Strategies (all production-callable):
 *   1. cross_encoder  — joint (query, passage) scoring (CE-style cross-feature encoder)
 *                       via Ollama nomic embeddings: cos(q,d) + cos(joint,q) + lexical
 *   2. colbert_lite   — late-interaction MaxSim over query-token × passage-window embeds
 *   3. llm            — local LLM pointwise/listwise rank of top-N (Ollama chat)
 *   4. ensemble       — default: blend CE + ColBERT (+ optional LLM on top slice)
 *
 * Usage:
 *   node tools/retrieval-rerank.js --query "..." --candidates-file c.json --strategy ensemble --json
 *   node tools/retrieval-rerank.js --self-test --json
 *
 * Inject embedder/llm for hermetic unit tests via options.embed / options.chat.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_EMBED_MODEL = process.env.HERMES_RERANK_EMBED_MODEL || 'nomic-embed-text';
const DEFAULT_CHAT_MODEL = process.env.HERMES_RERANK_CHAT_MODEL || 'qwen2.5:3b-64k';
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

function parseArgs(argv) {
  const args = {
    query: '',
    strategy: 'ensemble',
    limit: 10,
    candidatesFile: null,
    json: false,
    selfTest: false,
    llm: process.env.HERMES_LLM_RERANK === '1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--strategy') args.strategy = argv[++i] || 'ensemble';
    else if (a === '--limit') args.limit = Number(argv[++i] || 10);
    else if (a === '--candidates-file') args.candidatesFile = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--llm') args.llm = true;
    else if (a === '--no-llm') args.llm = false;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./+-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function lexicalOverlap(query, passage) {
  const qt = new Set(tokenize(query));
  const pt = tokenize(passage);
  if (!qt.size || !pt.length) return 0;
  let hit = 0;
  for (const t of pt) if (qt.has(t)) hit += 1;
  const uniqHit = [...qt].filter((t) => pt.includes(t)).length;
  return 0.5 * (hit / pt.length) + 0.5 * (uniqHit / qt.size);
}

function pathBonus(query, filePath) {
  const qt = tokenize(query);
  const p = String(filePath || '').toLowerCase();
  if (!qt.length || !p) return 0;
  let n = 0;
  for (const t of qt) if (p.includes(t)) n += 1;
  return Math.min(1, n / Math.max(2, qt.length * 0.5));
}

/** Default Ollama embedder (batch-friendly sequential with cache). */
function createOllamaEmbedder(options = {}) {
  const model = options.model || DEFAULT_EMBED_MODEL;
  const endpoint = options.endpoint || `${OLLAMA}/api/embeddings`;
  const cache = new Map();
  return {
    model,
    async embed(text) {
      const key = String(text || '').slice(0, 4000);
      if (cache.has(key)) return cache.get(key);
      const body = JSON.stringify({ model, prompt: key });
      // Use curl for zero-deps reliability in agent env.
      const r = spawnSync(
        'curl',
        ['-sS', '--max-time', String(options.timeoutSec || 60), endpoint, '-H', 'Content-Type: application/json', '-d', body],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      );
      if (r.status !== 0) throw new Error(`embed failed: ${(r.stderr || r.stdout || '').slice(0, 160)}`);
      const j = JSON.parse(r.stdout || '{}');
      const vec = j.embedding;
      if (!Array.isArray(vec) || !vec.length) throw new Error(`empty embedding: ${r.stdout.slice(0, 120)}`);
      cache.set(key, vec);
      return vec;
    },
    cacheSize: () => cache.size,
  };
}

function createOllamaChat(options = {}) {
  const model = options.model || DEFAULT_CHAT_MODEL;
  const endpoint = options.endpoint || `${OLLAMA}/api/chat`;
  return {
    model,
    async chat(messages, opts = {}) {
      const body = JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0, num_predict: opts.maxTokens || 256 },
      });
      const r = spawnSync(
        'curl',
        ['-sS', '--max-time', String(opts.timeoutSec || 90), endpoint, '-H', 'Content-Type: application/json', '-d', body],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      );
      if (r.status !== 0) throw new Error(`chat failed: ${(r.stderr || r.stdout || '').slice(0, 160)}`);
      const j = JSON.parse(r.stdout || '{}');
      const content = j?.message?.content || j?.choices?.[0]?.message?.content || '';
      if (!content) throw new Error(`empty chat: ${r.stdout.slice(0, 120)}`);
      return String(content);
    },
  };
}

function passageWindows(text, maxWindows = 8, winChars = 280) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [''];
  if (t.length <= winChars) return [t];
  const out = [];
  const step = Math.max(80, Math.floor(winChars * 0.6));
  for (let i = 0; i < t.length && out.length < maxWindows; i += step) {
    out.push(t.slice(i, i + winChars));
  }
  return out;
}

function significantQueryTokens(query, maxTokens = 12) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'are', 'with', 'from', 'that', 'this', 'how', 'what', 'when', 'where', 'why',
  ]);
  const toks = tokenize(query).filter((t) => !stop.has(t) && t.length >= 3);
  // Prefer longer / rarer-looking tokens
  toks.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return [...new Set(toks)].slice(0, maxTokens);
}

/**
 * Cross-encoder style joint scorer (CE-lite without torch).
 * Features joint embed(query||passage) + bi-encoder cos + lexical + path.
 */
async function crossEncoderScore(query, candidate, embedder, ctx = {}) {
  const passage = String(candidate.snippet || candidate.text || candidate.path || '').slice(0, 1200);
  const joint = `query: ${query}\npassage: ${passage}\npath: ${candidate.path || ''}`;
  const [qVec, dVec, jVec] = await Promise.all([
    embedder.embed(query),
    embedder.embed(passage || candidate.path || ' '),
    embedder.embed(joint),
  ]);
  const bi = cosine(qVec, dVec);
  const jointAlign = cosine(jVec, qVec);
  const lex = lexicalOverlap(query, `${passage} ${candidate.path || ''}`);
  const path = pathBonus(query, candidate.path);
  const rrf = Number(candidate.rrfScore || candidate.score || 0);
  const rrfN = Math.min(1, rrf * 20); // RRF scores are small (~0.03)
  // Weights tuned for CE-like joint dominance
  const score =
    0.38 * bi + 0.32 * jointAlign + 0.18 * lex + 0.08 * path + 0.04 * rrfN;
  return {
    score,
    components: {
      biEncoderCos: Number(bi.toFixed(4)),
      jointAlign: Number(jointAlign.toFixed(4)),
      lexical: Number(lex.toFixed(4)),
      path: Number(path.toFixed(4)),
      rrfPrior: Number(rrfN.toFixed(4)),
    },
  };
}

/**
 * ColBERT-style late interaction: MaxSim over query tokens × passage windows.
 */
async function colbertLiteScore(query, candidate, embedder) {
  const qTokens = significantQueryTokens(query);
  const passage = String(candidate.snippet || candidate.text || '').slice(0, 2000);
  const windows = passageWindows(passage, 6, 240);
  if (!qTokens.length) {
    return { score: lexicalOverlap(query, passage), components: { maxSim: 0, tokens: 0 } };
  }
  const qEmbs = [];
  for (const t of qTokens) qEmbs.push(await embedder.embed(t));
  const wEmbs = [];
  for (const w of windows) wEmbs.push(await embedder.embed(w || ' '));
  // also include path as a "window"
  if (candidate.path) wEmbs.push(await embedder.embed(String(candidate.path)));

  let sum = 0;
  for (const qe of qEmbs) {
    let best = -1;
    for (const we of wEmbs) {
      const c = cosine(qe, we);
      if (c > best) best = c;
    }
    sum += Math.max(0, best);
  }
  const maxSim = sum / qEmbs.length;
  const lex = lexicalOverlap(query, `${passage} ${candidate.path || ''}`);
  const score = 0.85 * maxSim + 0.15 * lex;
  return {
    score,
    components: {
      maxSim: Number(maxSim.toFixed(4)),
      tokens: qTokens.length,
      windows: wEmbs.length,
      lexical: Number(lex.toFixed(4)),
    },
  };
}

/**
 * LLM listwise rerank — returns order of candidate indices (0-based).
 */
async function llmRerankOrder(query, candidates, chat) {
  const lines = candidates.map((c, i) => {
    const snip = String(c.snippet || '').replace(/\s+/g, ' ').slice(0, 180);
    return `${i}. ${c.path || '(no path)'} :: ${snip}`;
  });
  const prompt =
    `You are a relevance ranker for a code/docs retrieval system.\n` +
    `Query: ${query}\n` +
    `Candidates:\n${lines.join('\n')}\n` +
    `Return ONLY a JSON array of candidate indices from most to least relevant, e.g. [2,0,1].\n` +
    `Use every index exactly once.`;
  const raw = await chat.chat([{ role: 'user', content: prompt }], { maxTokens: 200, temperature: 0 });
  const match = raw.match(/\[[\d,\s]+\]/);
  if (!match) throw new Error(`LLM did not return index array: ${raw.slice(0, 120)}`);
  const order = JSON.parse(match[0]);
  if (!Array.isArray(order) || order.length !== candidates.length) {
    throw new Error(`LLM order length mismatch: ${JSON.stringify(order)}`);
  }
  const set = new Set(order);
  if (set.size !== candidates.length) throw new Error('LLM order missing/dupe indices');
  return order.map(Number);
}

async function scoreCandidates(query, candidates, strategy, options = {}) {
  const embedder = options.embedder || createOllamaEmbedder(options);
  const chat = options.chat || createOllamaChat(options);
  const useLlm = Boolean(options.llm) || strategy === 'llm';
  const strat = strategy === 'auto' ? 'ensemble' : strategy;

  const scored = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    let ce = null;
    let col = null;
    if (strat === 'cross_encoder' || strat === 'ensemble') {
      ce = await crossEncoderScore(query, c, embedder, options);
    }
    if (strat === 'colbert_lite' || strat === 'ensemble') {
      col = await colbertLiteScore(query, c, embedder);
    }
    let score = 0;
    let method = strat;
    if (strat === 'cross_encoder') {
      score = ce.score;
      method = 'cross_encoder';
    } else if (strat === 'colbert_lite') {
      score = col.score;
      method = 'colbert_lite';
    } else if (strat === 'ensemble') {
      score = 0.55 * (ce?.score || 0) + 0.45 * (col?.score || 0);
      method = 'ensemble(ce+colbert)';
    } else if (strat === 'llm') {
      // placeholder until listwise reorder
      score = (ce?.score || 0) * 0.5 + (col?.score || 0) * 0.5;
      method = 'llm';
    } else {
      throw new Error(`Unknown strategy: ${strat}`);
    }
    scored.push({
      ...c,
      priorRank: i + 1,
      rerankScore: Number(score.toFixed(6)),
      method,
      components: {
        crossEncoder: ce?.components,
        colbert: col?.components,
      },
    });
  }

  scored.sort((a, b) => b.rerankScore - a.rerankScore || a.path.localeCompare(b.path || ''));

  if (useLlm || strat === 'llm') {
    const topN = scored.slice(0, Math.min(8, scored.length));
    try {
      const order = await llmRerankOrder(query, topN, chat);
      const reordered = order.map((idx, rank) => ({
        ...topN[idx],
        llmRank: rank + 1,
        method: `${topN[idx].method}+llm`,
        rerankScore: Number((topN[idx].rerankScore + (topN.length - rank) * 0.001).toFixed(6)),
      }));
      const rest = scored.slice(topN.length);
      return { candidates: [...reordered, ...rest], llmApplied: true };
    } catch (error) {
      return {
        candidates: scored,
        llmApplied: false,
        llmError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { candidates: scored, llmApplied: false };
}

/**
 * Main entry: rerank a candidate list.
 * @param {object} options
 * @param {string} options.query
 * @param {Array} options.candidates - {path, snippet?, rrfScore?, score?}
 * @param {string} [options.strategy] cross_encoder|colbert_lite|llm|ensemble|auto
 * @param {number} [options.limit]
 */
async function rerank(options = {}) {
  const query = String(options.query || '').trim();
  if (!query) throw new Error('query required');
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  if (!candidates.length) {
    return {
      ok: true,
      query,
      strategy: options.strategy || 'ensemble',
      matches: [],
      note: 'empty candidates',
    };
  }
  const strategy = options.strategy || 'ensemble';
  const limit = options.limit || candidates.length;
  const started = Date.now();
  const result = await scoreCandidates(query, candidates, strategy, options);
  const matches = result.candidates.slice(0, limit).map((c, i) => ({
    ...c,
    rank: i + 1,
  }));
  return {
    ok: true,
    query,
    strategy,
    llmApplied: result.llmApplied,
    llmError: result.llmError,
    elapsedMs: Date.now() - started,
    matchCount: matches.length,
    matches,
    // Capability matrix for scorecard
    capabilities: {
      cross_encoder: true,
      colbert_lite: true,
      llm_rerank: true,
      ensemble: true,
    },
  };
}

/** Hermetic self-test: inverted list must be corrected by CE/ColBERT features. */
async function selfTest() {
  // Deterministic fake embedder: bag-of-char hashing into fixed dim
  function hashEmbed(text, dim = 32) {
    const v = new Array(dim).fill(0);
    const s = String(text || '').toLowerCase();
    for (let i = 0; i < s.length; i += 1) {
      const code = s.charCodeAt(i);
      v[code % dim] += 1;
      v[(code * 7 + i) % dim] += 0.3;
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }
  const embedder = { embed: async (t) => hashEmbed(t) };
  const query = 'gateway session recover tailscale';
  const candidates = [
    {
      path: 'docs/unrelated-marketing.md',
      snippet: 'pricing funnel continuity stripe buy links promo social',
      rrfScore: 0.05,
    },
    {
      path: 'tools/hermes-cloud-connector.js',
      snippet: 'gateway session recover when tailscale path fails; reconnect session token',
      rrfScore: 0.02,
    },
  ];
  // RRF would prefer marketing (higher prior); CE/ColBERT must flip to connector.
  const ce = await rerank({
    query,
    candidates,
    strategy: 'cross_encoder',
    embedder,
    limit: 2,
  });
  const col = await rerank({
    query,
    candidates,
    strategy: 'colbert_lite',
    embedder,
    limit: 2,
  });
  const ens = await rerank({
    query,
    candidates,
    strategy: 'ensemble',
    embedder,
    limit: 2,
  });
  const want = 'tools/hermes-cloud-connector.js';
  return {
    ok:
      ce.matches[0]?.path === want &&
      col.matches[0]?.path === want &&
      ens.matches[0]?.path === want,
    cross_encoder_top: ce.matches[0]?.path,
    colbert_top: col.matches[0]?.path,
    ensemble_top: ens.matches[0]?.path,
    capabilities: ce.capabilities,
  };
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (args.help) {
        console.log(
          'Usage: node tools/retrieval-rerank.js --query "..." --candidates-file f.json [--strategy ensemble] [--json]\n' +
            '       node tools/retrieval-rerank.js --self-test --json',
        );
        process.exit(0);
      }
      if (args.selfTest) {
        const report = await selfTest();
        if (args.json) console.log(JSON.stringify(report, null, 2));
        else console.log(`rerank self-test: ${report.ok ? 'OK' : 'FAIL'}`);
        process.exit(report.ok ? 0 : 1);
      }
      if (!args.query || !args.candidatesFile) {
        console.error('--query and --candidates-file required (or --self-test)');
        process.exit(2);
      }
      const candidates = JSON.parse(fs.readFileSync(path.resolve(args.candidatesFile), 'utf8'));
      const list = Array.isArray(candidates) ? candidates : candidates.matches || candidates.candidates || [];
      const out = await rerank({
        query: args.query,
        candidates: list,
        strategy: args.strategy,
        limit: args.limit,
        llm: args.llm,
      });
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(`rerank strategy=${out.strategy} n=${out.matchCount} llm=${out.llmApplied}`);
        out.matches.forEach((m) => {
          console.log(`${m.rank}. ${m.rerankScore.toFixed(4)}  ${m.path}`);
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
  rerank,
  selfTest,
  crossEncoderScore,
  colbertLiteScore,
  llmRerankOrder,
  cosine,
  lexicalOverlap,
  tokenize,
  significantQueryTokens,
  passageWindows,
  createOllamaEmbedder,
  createOllamaChat,
};
