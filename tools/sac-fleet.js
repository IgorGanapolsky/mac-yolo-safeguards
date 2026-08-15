#!/usr/bin/env node
'use strict';

/**
 * sac-fleet.js — Fleet Search-as-Code (SaC)
 *
 * Perplexity SaC (research.perplexity.ai, 2026-06-01) plus the Aug 2026
 * cost-per-task optimizations (~10%) from the @perplexity Threads post.
 *
 * Layers (do not dispatch retrieval through function-calling / MCP):
 *   1. Models generate a retrieval program
 *   2. Sandbox runs it with filesystem serde (not REPL)
 *   3. Agentic Search SDK exposes atomic primitives
 *   4. Fleet installer wires every agent home / harness
 *
 * Usage:
 *   node tools/sac-fleet.js doctor --json
 *   node tools/sac-fleet.js search "query" --fanout --rerank --compact
 *   node tools/sac-fleet.js run ./workflow.js
 *   node tools/sac-fleet.js install
 *   node tools/sac-fleet.js cost --json
 *   node tools/sac-fleet.js recollect --query "focus"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.hermes', 'sac-state');
const FLEET_MARKER = path.join(os.homedir(), '.hermes', 'sac-fleet.json');

const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt:/i,
  /you\s+are\s+now\s+a/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/i,
  /eval\(/i,
  /document\.cookie/i,
];

const AGENT_SKILL_HOMES = [
  ['.grok', 'skills'],
  ['.claude', 'skills'],
  ['.cursor', 'skills'],
  ['.agents', 'skills'],
  ['.hermes', 'skills'],
  ['.codex', 'skills'],
  ['.gemini', 'config', 'skills'],
];

const SIBLING_PROJECTS = [
  'ThumbGate',
  'Resume',
  'ai-operations-agency',
  'YourStageTickets',
  'Random-Timer',
  'hermes-eval',
];

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./+-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function sanitizeContent(rawText, sourceUrl = '') {
  let cleaned = String(rawText || '');
  let sanitizations = 0;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '[REDACTED_SECURITY_INTERDICTION]');
      sanitizations += 1;
    }
  }
  const beforeLen = cleaned.length;
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (cleaned.length !== beforeLen) sanitizations += 1;
  return {
    cleaned: cleaned.trim(),
    sanitizations,
    provenanceHash: crypto.createHash('sha256').update(`${sourceUrl}:${cleaned}`).digest('hex'),
    sourceUrl,
  };
}

function jaccard(a, b) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (!sa.size && !sb.size) return 1;
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function lexicalOverlap(query, text) {
  const q = tokenize(query);
  if (!q.length) return 0;
  const hay = String(text || '').toLowerCase();
  let hits = 0;
  for (const t of q) if (hay.includes(t)) hits += 1;
  return hits / q.length;
}

class BM25Reranker {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  score(query, documents, textAccessor = (d) => `${d.title || ''} ${d.snippet || ''} ${d.content || ''}`) {
    const qTokens = tokenize(query);
    if (!qTokens.length || !documents.length) {
      return documents.map((doc, idx) => ({ ...doc, bm25Score: Number((1 / (idx + 1)).toFixed(4)) }));
    }
    const docTokensList = documents.map((doc) => tokenize(textAccessor(doc)));
    const totalDocs = documents.length;
    const avgDocLen = docTokensList.reduce((sum, toks) => sum + toks.length, 0) / Math.max(1, totalDocs);
    const df = {};
    for (const term of qTokens) {
      df[term] = docTokensList.filter((toks) => toks.includes(term)).length;
    }
    return documents
      .map((doc, idx) => {
        const docTokens = docTokensList[idx];
        const counts = {};
        for (const t of docTokens) counts[t] = (counts[t] || 0) + 1;
        let score = 0;
        for (const term of qTokens) {
          const tf = counts[term] || 0;
          const idf = Math.log(1 + (totalDocs - df[term] + 0.5) / (df[term] + 0.5));
          const den = tf + this.k1 * (1 - this.b + (this.b * docTokens.length) / Math.max(1, avgDocLen));
          score += idf * ((tf * (this.k1 + 1)) / (den || 1));
        }
        return { ...doc, bm25Score: Number(score.toFixed(4)) };
      })
      .sort((a, b) => b.bm25Score - a.bm25Score);
  }
}

function reciprocalRankFusion(rankingsList, k = 60) {
  const scores = new Map();
  const docs = new Map();
  for (const ranking of rankingsList) {
    ranking.forEach((doc, rank) => {
      const key = doc.id || doc.url || doc.source || JSON.stringify(doc);
      docs.set(key, doc);
      scores.set(key, (scores.get(key) || 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, rrfScore]) => ({ ...docs.get(key), rrfScore: Number(rrfScore.toFixed(6)) }));
}

function loadPeerEngine(repoRoot) {
  const peer = path.join(repoRoot, 'tools', 'sac-engine.js');
  if (!fs.existsSync(peer)) return null;
  try {
    return require(peer);
  } catch {
    return null;
  }
}

class SacCostOptimizer {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      fetchesSkipped: 0,
      earlyStops: 0,
      tokensNaive: 0,
      tokensOptimized: 0,
    };
  }

  cacheKey(query, opts = {}) {
    const norm = String(query || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return `${norm}::${opts.provider || 'all'}::${opts.limit || 10}`;
  }

  remember(key, value) {
    this.cache.set(key, value);
    return value;
  }

  recall(key) {
    if (!this.cache.has(key)) {
      this.stats.misses += 1;
      return null;
    }
    this.stats.hits += 1;
    return this.cache.get(key);
  }

  prefilter(query, docs, minOverlap = 0.15) {
    return docs.filter((doc) => {
      const text = `${doc.title || ''} ${doc.snippet || ''} ${doc.content || ''}`;
      const keep = lexicalOverlap(query, text) >= minOverlap;
      if (!keep) this.stats.fetchesSkipped += 1;
      return keep;
    });
  }

  earlyStop(records, floor) {
    if (!floor || records.length < floor) return records;
    this.stats.earlyStops += 1;
    return records.slice(0, floor);
  }

  account(naiveText, optimizedText) {
    this.stats.tokensNaive += estimateTokens(naiveText);
    this.stats.tokensOptimized += estimateTokens(optimizedText);
  }

  savingsRatio() {
    if (!this.stats.tokensNaive) return 0;
    return (this.stats.tokensNaive - this.stats.tokensOptimized) / this.stats.tokensNaive;
  }

  snapshot() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      savingsRatio: Number(this.savingsRatio().toFixed(4)),
      meetsCostTarget: this.savingsRatio() >= 0.1,
    };
  }
}

class SacStateStore {
  constructor(dir = DEFAULT_STATE_DIR) {
    this.dir = dir;
  }

  ensure() {
    fs.mkdirSync(this.dir, { recursive: true });
    return this.dir;
  }

  pathFor(name) {
    const safe = String(name || 'state').replace(/[^a-zA-Z0-9._-]+/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  save(name, value) {
    this.ensure();
    const payload = {
      savedAt: new Date().toISOString(),
      name,
      value,
    };
    fs.writeFileSync(this.pathFor(name), `${JSON.stringify(payload, null, 2)}\n`);
    return this.pathFor(name);
  }

  load(name) {
    const file = this.pathFor(name);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  }
}

class ContextCompactor {
  compact(records, options = {}) {
    const limit = options.limit || 8;
    const maxSnippet = options.maxSnippet || 180;
    const rows = records.slice(0, limit).map((rec, idx) => ({
      i: idx + 1,
      title: String(rec.title || rec.source || rec.id || 'untitled').slice(0, 80),
      source: String(rec.source || rec.url || '').slice(0, 120),
      fact: String(rec.snippet || rec.content || '')
        .replace(/\s+/g, ' ')
        .slice(0, maxSnippet),
      type: rec.type || 'unknown',
    }));
    const markdown = rows
      .map((r) => `- [${r.i}] ${r.title} (${r.type}) — ${r.fact}${r.source ? ` ⟨${r.source}⟩` : ''}`)
      .join('\n');
    const naive = records.map((r) => `${r.title || ''}\n${r.snippet || ''}\n${r.content || ''}`).join('\n\n');
    const reduction = naive.length ? 1 - markdown.length / naive.length : 0;
    return {
      markdown,
      rows,
      tokensIn: estimateTokens(naive),
      tokensOut: estimateTokens(markdown),
      reduction: Number(reduction.toFixed(4)),
    };
  }
}

class AgenticSearchSDK {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || REPO_ROOT;
    this.bm25 = new BM25Reranker();
    this.cost = options.cost || new SacCostOptimizer();
    this.state = options.state || new SacStateStore(options.stateDir);
    this.providers = {
      code: options.codeSearch || ((q, opts) => this.defaultCodeSearch(q, opts)),
      memory: options.memorySearch || ((q, opts) => this.defaultMemorySearch(q, opts)),
      docs: options.docsSearch || ((q, opts) => this.defaultDocsSearch(q, opts)),
      web: options.webSearch || ((q, opts) => this.defaultWebSearch(q, opts)),
    };
    this.peer = options.peer !== undefined ? options.peer : loadPeerEngine(this.repoRoot);
    this.stats = { searches: 0, fanouts: 0, fetches: 0, dedupes: 0, reranks: 0, backfills: 0 };
    this.search_many = this.searchMany.bind(this);
    this.fetch_extract = this.fetchExtract.bind(this);
    this.synthesize_table = this.synthesizeTable.bind(this);
    this.verify_claims = this.verifyClaims.bind(this);
    this.extract_many = this.extractMany.bind(this);
    this.backfill_coverage = this.backfillCoverage.bind(this);
  }

  async search(query, options = {}) {
    this.stats.searches += 1;
    const provider = options.provider || 'all';
    const limit = options.limit || 10;
    const key = this.cost.cacheKey(query, { provider, limit });
    const cached = this.cost.recall(key);
    if (cached) return cached.slice(0, limit);

    if (this.peer && this.peer.AgenticSearchSDK && !options.skipPeer) {
      try {
        const peerSdk = new this.peer.AgenticSearchSDK({ repoRoot: this.repoRoot });
        const peerHits = await peerSdk.search(query, options);
        if (Array.isArray(peerHits) && peerHits.length) {
          return this.cost.remember(key, peerHits.slice(0, limit));
        }
      } catch {
        // fall through to local providers
      }
    }

    const buckets = [];
    if (provider === 'code' || provider === 'all') buckets.push(this.providers.code(query, options));
    if (provider === 'memory' || provider === 'all') buckets.push(this.providers.memory(query, options));
    if (provider === 'docs' || provider === 'all') buckets.push(this.providers.docs(query, options));
    if (provider === 'web' || provider === 'all') buckets.push(this.providers.web(query, options));
    const settled = await Promise.all(buckets.map((p) => Promise.resolve(p).catch(() => [])));
    const merged = settled.flat().slice(0, Math.max(limit * 2, limit));
    return this.cost.remember(key, merged.slice(0, limit));
  }

  defaultCodeSearch(query, options = {}) {
    const limit = options.limit || 10;
    const term = String(query || '').split(/\s+/).find(Boolean) || query;
    if (!term) return [];
    const res = spawnSync('git', ['grep', '-n', '-I', '-i', '-m', '4', '--', term], {
      cwd: this.repoRoot,
      encoding: 'utf8',
      timeout: 4000,
    });
    if (res.status !== 0 || !res.stdout) return [];
    return res.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const parts = line.split(':');
        const file = parts[0];
        const lineNum = parts[1];
        const snippet = parts.slice(2).join(':').trim();
        return {
          id: `code:${file}:${lineNum}`,
          type: 'code',
          source: file,
          line: Number(lineNum) || 0,
          title: path.basename(file),
          snippet: snippet.slice(0, 300),
          url: `file://${path.join(this.repoRoot, file)}`,
          score: 0.8,
        };
      });
  }

  defaultMemorySearch(query, options = {}) {
    const limit = options.limit || 10;
    const lessonsDir = path.join(this.repoRoot, '.thumbgate', 'lessons');
    if (!fs.existsSync(lessonsDir)) return [];
    const qToks = tokenize(query);
    const out = [];
    for (const name of fs.readdirSync(lessonsDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const json = JSON.parse(fs.readFileSync(path.join(lessonsDir, name), 'utf8'));
        const text = `${json.title || ''} ${json.problem || ''} ${json.solution || ''}`;
        const overlap = qToks.filter((t) => text.toLowerCase().includes(t)).length;
        if (overlap > 0) {
          out.push({
            id: `memory:${name}`,
            type: 'memory',
            source: name,
            title: json.title || name,
            snippet: String(json.solution || json.problem || '').slice(0, 300),
            score: overlap / Math.max(1, qToks.length),
          });
        }
      } catch {
        // skip corrupt lesson files
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  defaultDocsSearch(query, options = {}) {
    const limit = options.limit || 8;
    const docsRoot = path.join(this.repoRoot, 'docs');
    if (!fs.existsSync(docsRoot)) return [];
    const term = String(query || '').split(/\s+/).find(Boolean);
    if (!term) return [];
    const res = spawnSync(
      'git',
      ['grep', '-n', '-I', '-i', '-m', '3', '--', term, '--', 'docs', 'AGENTS.md', 'SKILLS.md'],
      { cwd: this.repoRoot, encoding: 'utf8', timeout: 4000 },
    );
    if (res.status !== 0 || !res.stdout) return [];
    return res.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line, idx) => {
        const parts = line.split(':');
        return {
          id: `docs:${parts[0]}:${idx}`,
          type: 'docs',
          source: parts[0],
          title: path.basename(parts[0] || 'doc'),
          snippet: parts.slice(2).join(':').trim().slice(0, 300),
          score: 0.7,
        };
      });
  }

  defaultWebSearch(query, options = {}) {
    if (options.offline || process.env.SAC_FLEET_OFFLINE === '1') return [];
    const gw = path.join(this.repoRoot, 'tools', 'web-intelligence-gateway.js');
    if (!fs.existsSync(gw)) return [];
    const res = spawnSync(process.execPath, [gw, '--query', String(query), '--json'], {
      cwd: this.repoRoot,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (res.status !== 0 || !res.stdout) return [];
    try {
      const json = JSON.parse(res.stdout);
      return [
        {
          id: `web:${json.sourceUrl || query}`,
          type: 'web',
          source: json.sourceUrl || 'web-stream',
          title: `Web: ${query}`,
          snippet: String(json.rawCleaned || json.formattedContent || '').slice(0, 400),
          provenanceHash: json.provenanceHash,
          score: 0.9,
        },
      ];
    } catch {
      return [];
    }
  }

  async searchMany(queries, options = {}) {
    return this.fanout(queries, options);
  }

  async fanout(queries = [], options = {}) {
    this.stats.fanouts += 1;
    if (!Array.isArray(queries) || !queries.length) return [];
    const concurrency = options.concurrency || 6;
    const all = [];
    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map(async (q) => {
          const text = typeof q === 'string' ? q : q.query;
          const opts = typeof q === 'object' ? { ...options, ...q } : options;
          const hits = await this.search(text, opts);
          return hits.map((h) => ({ ...h, queryVariant: text }));
        }),
      );
      for (const item of settled) {
        if (item.status === 'fulfilled') all.push(...item.value);
      }
    }
    return all;
  }

  async fetchExtract(targets = [], options = {}) {
    this.stats.fetches += targets.length;
    const out = [];
    const seen = new Set();
    for (const target of targets) {
      const url = typeof target === 'string' ? target : target.url;
      if (!url || seen.has(url)) {
        if (url) this.cost.stats.fetchesSkipped += 1;
        continue;
      }
      seen.add(url);
      try {
        if (url.startsWith('file://') || fs.existsSync(url)) {
          const filePath = url.replace('file://', '');
          const raw = fs.readFileSync(filePath, 'utf8').slice(0, 12000);
          const sanitized = sanitizeContent(raw, url);
          out.push({
            url,
            status: 'ok',
            content: sanitized.cleaned,
            provenanceHash: sanitized.provenanceHash,
            tokensEstimate: estimateTokens(sanitized.cleaned),
          });
        } else if (options.allowNetwork && process.env.SAC_FLEET_OFFLINE !== '1') {
          const res = spawnSync('curl', ['-sL', '-A', 'Mozilla/5.0 sac-fleet', '--max-time', '6', url], {
            encoding: 'utf8',
            timeout: 7000,
          });
          if (res.status === 0 && res.stdout) {
            const body = res.stdout
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ');
            const sanitized = sanitizeContent(body.slice(0, 15000), url);
            out.push({
              url,
              status: 'ok',
              content: sanitized.cleaned,
              provenanceHash: sanitized.provenanceHash,
              tokensEstimate: estimateTokens(sanitized.cleaned),
            });
          } else {
            out.push({ url, status: 'error', error: 'fetch_failed' });
          }
        } else {
          out.push({ url, status: 'skipped', error: 'offline_or_non_file' });
        }
      } catch (err) {
        out.push({ url, status: 'error', error: err.message });
      }
    }
    return out;
  }

  filter(results = [], predicate = () => true) {
    if (typeof predicate !== 'function') return results;
    return results.filter(predicate);
  }

  dedupe(results = [], options = {}) {
    this.stats.dedupes += 1;
    const keyFn = typeof options === 'function' ? options : options.keyFn || ((r) => r.url || r.id || r.title || '');
    const threshold = typeof options === 'object' && options.similarityThreshold !== undefined ? options.similarityThreshold : 0.7;
    const seen = new Set();
    const unique = [];
    for (const item of results) {
      const key = keyFn(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const text = item.snippet || item.content || item.title || '';
      const dup = unique.some((accepted) => jaccard(text, accepted.snippet || accepted.content || accepted.title || '') >= threshold);
      if (!dup) unique.push(item);
    }
    return unique;
  }

  rerank(query, candidates = [], options = {}) {
    this.stats.reranks += 1;
    const strategy = options.strategy || 'rrf';
    const limit = options.limit || 10;
    if (!candidates.length) return [];
    if (strategy === 'bm25') return this.bm25.score(query, candidates).slice(0, limit);
    const bm25Ranked = this.bm25.score(query, candidates);
    const scoreRanked = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0));
    return reciprocalRankFusion([bm25Ranked, scoreRanked]).slice(0, limit);
  }

  synthesizeTable(records = [], fields = ['title', 'source', 'snippet']) {
    if (!records.length) return '| No records found |\n| --- |';
    const header = `| ${fields.map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join(' | ')} |`;
    const divider = `| ${fields.map(() => '---').join(' | ')} |`;
    const rows = records.map((rec) => {
      const vals = fields.map((f) =>
        String(rec[f] !== undefined ? rec[f] : '-')
          .replace(/\|/g, '\\|')
          .replace(/\n+/g, ' ')
          .slice(0, 160),
      );
      return `| ${vals.join(' | ')} |`;
    });
    return [header, divider, ...rows].join('\n');
  }

  verifyClaims(claims = [], evidenceRecords = []) {
    const corpus = evidenceRecords.map((r) => `${r.title || ''} ${r.snippet || ''} ${r.content || ''}`).join(' ').toLowerCase();
    return claims.map((claim) => {
      const claimText = typeof claim === 'string' ? claim : claim.statement || claim.claim;
      const tokens = tokenize(claimText);
      const matching = tokens.filter((t) => corpus.includes(t)).length;
      const confidence = tokens.length ? Number((matching / tokens.length).toFixed(3)) : 0;
      const status = confidence >= 0.7 ? 'VERIFIED' : confidence >= 0.4 ? 'PARTIAL_EVIDENCE' : 'UNSUPPORTED';
      let citation = 'unknown';
      let best = 0;
      for (const ev of evidenceRecords) {
        const evText = `${ev.title || ''} ${ev.snippet || ''} ${ev.content || ''}`.toLowerCase();
        const overlap = tokens.filter((t) => evText.includes(t)).length;
        if (overlap > best) {
          best = overlap;
          citation = ev.source || ev.url || ev.id || 'unknown';
        }
      }
      return { claim: claimText, status, confidence, citation, isSupported: status === 'VERIFIED' };
    });
  }

  extractMany(items = [], schema = {}) {
    const keys = Object.keys(schema);
    return items.map((item) => {
      const text = `${item.title || ''} ${item.snippet || ''} ${item.content || ''}`;
      const extracted = { source: item.url || item.source || item.id || null };
      for (const key of keys) {
        const hint = String(schema[key] || key);
        const re = new RegExp(`${key}[:\\s]+([^\\n|;]{2,80})`, 'i');
        const match = text.match(re);
        extracted[key] = match ? match[1].trim() : hint === 'bool' ? Boolean(text) : null;
      }
      extracted.evidence = String(item.snippet || text).slice(0, 240);
      return extracted;
    });
  }

  async backfillCoverage(seedHits, queryPlan, options = {}) {
    this.stats.backfills += 1;
    const byKey = {};
    for (const hit of seedHits) {
      const key = hit.bucket || hit.queryVariant || 'default';
      byKey[key] = (byKey[key] || 0) + 1;
    }
    const floor = options.floor || 2;
    const sparse = (queryPlan || []).filter((q) => (byKey[q.bucket || q.query] || 0) < floor);
    if (!sparse.length) return { coverage: byKey, extra: [], sparse: [] };
    const extra = await this.fanout(
      sparse.map((q) => (typeof q === 'string' ? `${q} extra evidence` : { ...q, query: `${q.query} extra evidence` })),
      options,
    );
    return { coverage: byKey, extra, sparse };
  }

  decomposeQuery(query) {
    const base = String(query || '').trim();
    if (!base) return [];
    return [
      base,
      `${base} architecture`,
      `${base} benchmark`,
      `${base} implementation`,
    ];
  }
}

class SaCSandboxRunner {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 4000;
    this.sdk = options.sdk || new AgenticSearchSDK(options);
    this.state = options.state || this.sdk.state;
  }

  async runCode(codeString, initialContext = {}) {
    const started = Date.now();
    const logs = [];
    const sandbox = {
      sac: this.sdk,
      search: this.sdk.search.bind(this.sdk),
      fanout: this.sdk.fanout.bind(this.sdk),
      search_many: this.sdk.searchMany.bind(this.sdk),
      fetch_extract: this.sdk.fetchExtract.bind(this.sdk),
      filter: this.sdk.filter.bind(this.sdk),
      dedupe: this.sdk.dedupe.bind(this.sdk),
      rerank: this.sdk.rerank.bind(this.sdk),
      synthesize_table: this.sdk.synthesizeTable.bind(this.sdk),
      verify_claims: this.sdk.verifyClaims.bind(this.sdk),
      extract_many: this.sdk.extractMany.bind(this.sdk),
      persist: (name, value) => this.state.save(name, value),
      load_state: (name) => this.state.load(name),
      console: {
        log: (...args) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
        error: (...args) => logs.push(`[ERROR] ${args.join(' ')}`),
      },
      Promise,
      Array,
      Object,
      Math,
      JSON,
      String,
      Number,
      Boolean,
      Date,
      RegExp,
      Map,
      Set,
      ...initialContext,
    };
    vm.createContext(sandbox);
    const wrapped = `(async () => {\n${codeString}\n})()`;
    try {
      const result = await Promise.race([
        vm.runInContext(wrapped, sandbox, { timeout: this.timeoutMs }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('sandbox_timeout')), this.timeoutMs)),
      ]);
      return { success: true, result, logs, durationMs: Date.now() - started };
    } catch (err) {
      return { success: false, error: err.message, logs, durationMs: Date.now() - started };
    }
  }
}

async function runOptimizedSearch(query, options = {}) {
  const sdk = options.sdk || new AgenticSearchSDK(options);
  const compactor = new ContextCompactor();
  const variants = options.fanout === false ? [query] : sdk.decomposeQuery(query);
  const raw = await sdk.fanout(variants, { limit: options.limit || 6, offline: options.offline });
  const prefiltered = sdk.cost.prefilter(query, raw);
  const deduped = sdk.dedupe(prefiltered);
  const ranked = options.rerank === false ? deduped : sdk.rerank(query, deduped, { strategy: 'rrf', limit: options.limit || 8 });
  const stopped = sdk.cost.earlyStop(ranked, options.coverageFloor || options.limit || 8);
  const compacted = options.compact === false ? { markdown: sdk.synthesizeTable(stopped), rows: stopped, tokensIn: estimateTokens(JSON.stringify(raw)), tokensOut: estimateTokens(JSON.stringify(stopped)), reduction: 0 } : compactor.compact(stopped);
  const naiveDump = raw.map((r) => `${r.title}\n${r.snippet}\n${r.content || ''}`).join('\n\n');
  sdk.cost.account(naiveDump, compacted.markdown);
  return {
    query,
    hits: stopped,
    table: sdk.synthesizeTable(stopped),
    compact: compacted,
    cost: sdk.cost.snapshot(),
    stats: sdk.stats,
    variants,
  };
}

function fleetHomes(home = os.homedir()) {
  return AGENT_SKILL_HOMES.map((parts) => path.join(home, ...parts));
}

function siblingSkillDirs(home = os.homedir()) {
  const root = path.join(home, 'workspace', 'git', 'igor');
  return SIBLING_PROJECTS.map((name) => path.join(root, name, '.agents', 'skills')).filter((dir) => fs.existsSync(path.dirname(dir)));
}

function installFleet(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const home = options.home || os.homedir();
  const skillSrc = path.join(repoRoot, '.agents', 'skills', 'search-as-code-fleet');
  const results = [];
  const targets = [
    ...fleetHomes(home),
    path.join(repoRoot, '.agents', 'skills'),
    path.join(repoRoot, '.claude', 'skills'),
    path.join(repoRoot, '.grok', 'skills'),
    path.join(repoRoot, '.cursor', 'skills'),
    path.join(repoRoot, 'hermes-skills'),
    path.join(repoRoot, 'hermes-local-skills'),
    ...siblingSkillDirs(home),
  ];

  for (const dir of targets) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, 'search-as-code-fleet');
      if (path.resolve(dest) === path.resolve(skillSrc)) {
        results.push({ dest, status: 'canonical' });
        continue;
      }
      let destStat = null;
      try {
        destStat = fs.lstatSync(dest);
      } catch {
        destStat = null;
      }
      if (destStat && (destStat.isSymbolicLink() || destStat.isDirectory() || destStat.isFile())) {
        results.push({ dest, status: 'exists' });
        continue;
      }
      fs.symlinkSync(skillSrc, dest);
      results.push({ dest, status: 'linked' });
    } catch (err) {
      if (err.code === 'EEXIST') results.push({ dest: path.join(dir, 'search-as-code-fleet'), status: 'exists' });
      else results.push({ dest: path.join(dir, 'search-as-code-fleet'), status: 'error', error: err.message });
    }
  }

  const binDir = path.join(home, '.local', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const binDest = path.join(binDir, 'sac-fleet');
  const binSrc = path.join(repoRoot, 'bin', 'sac-fleet');
  try {
    let binStat = null;
    try {
      binStat = fs.lstatSync(binDest);
    } catch {
      binStat = null;
    }
    if (binStat) {
      results.push({ dest: binDest, status: 'exists' });
    } else {
      fs.symlinkSync(binSrc, binDest);
      results.push({ dest: binDest, status: 'linked' });
    }
  } catch (err) {
    results.push({ dest: binDest, status: err.code === 'EEXIST' ? 'exists' : 'error', error: err.message });
  }

  const marker = {
    installedAt: new Date().toISOString(),
    repoRoot,
    skill: skillSrc,
    cli: path.join(repoRoot, 'bin', 'sac-fleet'),
    homes: fleetHomes(home),
    costTarget: 0.1,
    architecture: ['models', 'sandbox+filesystem-serde', 'agentic-search-sdk'],
  };
  fs.mkdirSync(path.dirname(FLEET_MARKER), { recursive: true });
  fs.writeFileSync(FLEET_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
  return { ok: true, marker, results };
}

function runDoctor(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const sdk = new AgenticSearchSDK({ repoRoot, offline: true });
  const skill = path.join(repoRoot, '.agents', 'skills', 'search-as-code-fleet', 'SKILL.md');
  const cli = path.join(repoRoot, 'bin', 'sac-fleet');
  const homes = fleetHomes(options.home || os.homedir());
  const linked = homes.filter((dir) => fs.existsSync(path.join(dir, 'search-as-code-fleet', 'SKILL.md')));
  const peer = loadPeerEngine(repoRoot);
  return {
    engine: 'Search-as-Code Fleet',
    status: fs.existsSync(skill) && fs.existsSync(cli) ? 'healthy' : 'degraded',
    repoRoot,
    skillPresent: fs.existsSync(skill),
    cliPresent: fs.existsSync(cli),
    peerEngine: Boolean(peer),
    fleetHomesLinked: linked.length,
    fleetHomesTotal: homes.length,
    markerPresent: fs.existsSync(FLEET_MARKER),
    primitives: [
      'search',
      'searchMany',
      'fanout',
      'fetchExtract',
      'filter',
      'dedupe',
      'rerank',
      'synthesizeTable',
      'verifyClaims',
      'extractMany',
      'backfillCoverage',
      'persist/load_state',
    ],
    costTarget: 0.1,
    sdkStats: sdk.stats,
  };
}

function printSacFleetBrief(options = {}) {
  const doc = runDoctor(options);
  const lines = [
    '=== Search-as-Code fleet ===',
    `status=${doc.status} peerEngine=${doc.peerEngine} homes=${doc.fleetHomesLinked}/${doc.fleetHomesTotal}`,
    'prefer: bin/sac-fleet search "<q>" --fanout --rerank --compact',
    'never: serial web_search / MCP dump of raw hits into context',
  ];
  return lines.join('\n');
}

async function recollect(query, options = {}) {
  const result = await runOptimizedSearch(query || 'Search as Code fleet retrieval', {
    ...options,
    offline: options.offline !== false,
    compact: true,
    rerank: true,
  });
  return {
    ok: true,
    query: result.query,
    compactMarkdown: result.compact.markdown,
    tokensOut: result.compact.tokensOut,
    cost: result.cost,
  };
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'doctor';
  const json = argv.includes('--json');
  const rest = argv.slice(1).filter((a) => a !== '--json');

  if (cmd === 'doctor' || cmd === '--doctor') {
    const doc = runDoctor();
    if (json) console.log(JSON.stringify(doc, null, 2));
    else console.log(`SaC fleet ${doc.status} · homes ${doc.fleetHomesLinked}/${doc.fleetHomesTotal} · peer=${doc.peerEngine}`);
    process.exit(doc.status === 'healthy' ? 0 : 1);
  }

  if (cmd === 'install') {
    const out = installFleet();
    if (json) console.log(JSON.stringify(out, null, 2));
    else console.log(`installed ${out.results.filter((r) => r.status === 'linked' || r.status === 'exists' || r.status === 'canonical').length} targets`);
    return;
  }

  if (cmd === 'search') {
    const query = rest.find((a) => !a.startsWith('--')) || '';
    const out = await runOptimizedSearch(query, {
      fanout: rest.includes('--fanout') || !rest.includes('--no-fanout'),
      rerank: rest.includes('--rerank') || !rest.includes('--no-rerank'),
      compact: rest.includes('--compact') || !rest.includes('--no-compact'),
      offline: rest.includes('--offline') || process.env.SAC_FLEET_OFFLINE === '1',
    });
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(out.compact.markdown || out.table);
      console.log(`\ncost savings=${(out.cost.savingsRatio * 100).toFixed(1)}% tokensOut=${out.compact.tokensOut}`);
    }
    return;
  }

  if (cmd === 'run') {
    const script = rest[0];
    if (!script) {
      console.error('usage: sac-fleet run <script.js>');
      process.exit(1);
    }
    const code = fs.readFileSync(script, 'utf8');
    const runner = new SaCSandboxRunner({ timeoutMs: 8000 });
    const result = await runner.runCode(code);
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.success ? JSON.stringify(result.result, null, 2) : result.error);
    process.exit(result.success ? 0 : 1);
  }

  if (cmd === 'cost') {
    const query = rest.find((a) => !a.startsWith('--')) || 'Search as Code programmable retrieval';
    const out = await runOptimizedSearch(query, { offline: true });
    if (json) console.log(JSON.stringify(out.cost, null, 2));
    else console.log(`savings=${out.cost.savingsRatio} meetsTarget=${out.cost.meetsCostTarget}`);
    return;
  }

  if (cmd === 'recollect') {
    const queryIdx = rest.indexOf('--query');
    const query = queryIdx >= 0 ? rest[queryIdx + 1] : rest.find((a) => !a.startsWith('--')) || 'current task context';
    const out = await recollect(query, { offline: true });
    if (json) console.log(JSON.stringify(out, null, 2));
    else console.log(out.compactMarkdown);
    return;
  }

  if (cmd === 'brief') {
    const brief = printSacFleetBrief();
    if (json) console.log(JSON.stringify({ brief }, null, 2));
    else console.log(brief);
    return;
  }

  console.error('usage: sac-fleet <doctor|search|run|install|cost|recollect|brief>');
  process.exit(1);
}

module.exports = {
  estimateTokens,
  tokenize,
  sanitizeContent,
  jaccard,
  lexicalOverlap,
  BM25Reranker,
  reciprocalRankFusion,
  SacCostOptimizer,
  SacStateStore,
  ContextCompactor,
  AgenticSearchSDK,
  SaCSandboxRunner,
  runOptimizedSearch,
  installFleet,
  runDoctor,
  printSacFleetBrief,
  recollect,
  fleetHomes,
  loadPeerEngine,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
