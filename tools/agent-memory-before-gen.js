#!/usr/bin/env node
'use strict';

/**
 * Memory-before-gen gate (enterprise RAG episode pattern, 2026-08).
 *
 * Before calling an expensive generative model:
 *   1) similarity-search prior structured agent outputs
 *   2) decide REUSE | ADAPT | GENERATE
 *   3) optional cheap-model evaluate is left to the caller (we return the hit)
 *
 * Zero network. Deterministic token Jaccard similarity (no embeddings required
 * so Ollama-down does not break the gate).
 *
 * Usage:
 *   node tools/agent-memory-before-gen.js store  --query "..." --answer "..." [--domain ahls] [--id x] [--json]
 *   node tools/agent-memory-before-gen.js decide --query "..." [--domain ahls] [--limit 5] [--json]
 *   node tools/agent-memory-before-gen.js stats  [--json]
 *   node tools/agent-memory-before-gen.js clear  --confirm  # test only / destructive
 *
 * Store path: --store path | THUMBGATE_AGENT_MEMORY | ~/.thumbgate/agent-memory.jsonl
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STORE = path.join(os.homedir(), '.thumbgate', 'agent-memory.jsonl');

const REUSE_THRESHOLD = 0.85;
const ADAPT_THRESHOLD = 0.55;
// Rough fleet heuristic: full gen often burns ~2k–8k tokens; reuse saves most of that.
const EST_TOKENS_FULL_GEN = 4000;
const EST_TOKENS_ADAPT = 800;

function parseArgs(argv) {
  const out = {
    cmd: null,
    query: '',
    answer: '',
    domain: 'general',
    id: '',
    limit: 5,
    store: process.env.THUMBGATE_AGENT_MEMORY || DEFAULT_STORE,
    json: false,
    confirm: false,
    help: false,
  };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('-')) {
    out.cmd = args.shift();
  }
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--query') out.query = requireVal(args, ++i, a);
    else if (a === '--answer') out.answer = requireVal(args, ++i, a);
    else if (a === '--domain') out.domain = requireVal(args, ++i, a);
    else if (a === '--id') out.id = requireVal(args, ++i, a);
    else if (a === '--limit') out.limit = Math.max(1, parseInt(requireVal(args, ++i, a), 10) || 5);
    else if (a === '--store') out.store = path.resolve(requireVal(args, ++i, a));
    else if (a === '--json') out.json = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function requireVal(args, i, flag) {
  if (i >= args.length || !args[i] || args[i].startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return args[i];
}

function usage() {
  return `agent-memory-before-gen — REUSE/ADAPT/GENERATE gate before expensive gen

Commands:
  store   --query Q --answer A [--domain D] [--id ID]
  decide  --query Q [--domain D] [--limit N]
  stats
  clear   --confirm

Options:
  --store PATH   JSONL memory file (default ~/.thumbgate/agent-memory.jsonl)
  --json         Machine-readable output
`;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    // Hyphen/underscore are separators so "after-hours" matches "after hours".
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const n = normalize(text);
  if (!n) return new Set();
  return new Set(n.split(' ').filter((t) => t.length > 1));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readEntries(storePath) {
  if (!fs.existsSync(storePath)) return [];
  const raw = fs.readFileSync(storePath, 'utf8');
  const entries = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj.query === 'string' && typeof obj.answer === 'string') {
        entries.push(obj);
      }
    } catch {
      // skip corrupt lines
    }
  }
  return entries;
}

function appendEntry(storePath, entry) {
  ensureParent(storePath);
  fs.appendFileSync(storePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function storeCmd(opts) {
  if (!opts.query.trim()) throw new Error('--query is required for store');
  if (!opts.answer.trim()) throw new Error('--answer is required for store');
  const id =
    opts.id ||
    crypto.createHash('sha256').update(`${opts.domain}|${opts.query}|${Date.now()}`).digest('hex').slice(0, 16);
  const entry = {
    id,
    domain: opts.domain || 'general',
    query: opts.query.trim(),
    answer: opts.answer.trim(),
    created_at: new Date().toISOString(),
  };
  appendEntry(opts.store, entry);
  return { ok: true, action: 'stored', entry, store: opts.store };
}

function decideCmd(opts) {
  if (!opts.query.trim()) throw new Error('--query is required for decide');
  const qTokens = tokenize(opts.query);
  const entries = readEntries(opts.store).filter(
    (e) => !opts.domain || opts.domain === 'general' || e.domain === opts.domain || e.domain === 'general',
  );
  const ranked = entries
    .map((e) => {
      const qScore = jaccard(qTokens, tokenize(e.query));
      const aScore = jaccard(qTokens, tokenize(e.answer));
      // Query match dominates; answer tokens can only boost slightly.
      const score = Math.min(1, qScore * 0.85 + aScore * 0.15);
      return { entry: e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);

  const best = ranked[0] || null;
  let decision = 'GENERATE';
  let estimated_tokens_saved = 0;
  if (best && best.score >= REUSE_THRESHOLD) {
    decision = 'REUSE';
    estimated_tokens_saved = EST_TOKENS_FULL_GEN;
  } else if (best && best.score >= ADAPT_THRESHOLD) {
    decision = 'ADAPT';
    estimated_tokens_saved = Math.max(0, EST_TOKENS_FULL_GEN - EST_TOKENS_ADAPT);
  }

  return {
    ok: true,
    action: 'decide',
    query: opts.query,
    domain: opts.domain,
    decision,
    score: best ? Number(best.score.toFixed(4)) : 0,
    thresholds: { REUSE: REUSE_THRESHOLD, ADAPT: ADAPT_THRESHOLD },
    estimated_tokens_saved,
    vanity_metrics_rejected: ['lines_of_code', 'raw_token_volume_as_productivity'],
    outcome_metrics: ['decision', 'estimated_tokens_saved', 'reuse_rate'],
    hit: best
      ? {
          id: best.entry.id,
          domain: best.entry.domain,
          query: best.entry.query,
          answer: best.entry.answer,
          created_at: best.entry.created_at,
          score: Number(best.score.toFixed(4)),
        }
      : null,
    candidates: ranked.map((r) => ({
      id: r.entry.id,
      score: Number(r.score.toFixed(4)),
      query: r.entry.query.slice(0, 120),
    })),
    store: opts.store,
    memory_count: entries.length,
  };
}

function statsCmd(opts) {
  const entries = readEntries(opts.store);
  const byDomain = {};
  for (const e of entries) {
    byDomain[e.domain || 'general'] = (byDomain[e.domain || 'general'] || 0) + 1;
  }
  return {
    ok: true,
    action: 'stats',
    store: opts.store,
    count: entries.length,
    by_domain: byDomain,
  };
}

function clearCmd(opts) {
  if (!opts.confirm) throw new Error('clear requires --confirm');
  if (fs.existsSync(opts.store)) fs.unlinkSync(opts.store);
  return { ok: true, action: 'cleared', store: opts.store };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(2);
  }
  if (opts.help || !opts.cmd) {
    process.stdout.write(usage());
    process.exit(opts.help ? 0 : 2);
  }

  let result;
  try {
    if (opts.cmd === 'store') result = storeCmd(opts);
    else if (opts.cmd === 'decide') result = decideCmd(opts);
    else if (opts.cmd === 'stats') result = statsCmd(opts);
    else if (opts.cmd === 'clear') result = clearCmd(opts);
    else throw new Error(`Unknown command: ${opts.cmd}`);
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(2);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (opts.cmd === 'decide') {
    process.stdout.write(
      `decision=${result.decision} score=${result.score} tokens_saved≈${result.estimated_tokens_saved} memory=${result.memory_count}\n`,
    );
    if (result.hit) {
      process.stdout.write(`hit_id=${result.hit.id}\nquery=${result.hit.query}\n---\n${result.hit.answer}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  normalize,
  tokenize,
  jaccard,
  storeCmd,
  decideCmd,
  statsCmd,
  REUSE_THRESHOLD,
  ADAPT_THRESHOLD,
};
