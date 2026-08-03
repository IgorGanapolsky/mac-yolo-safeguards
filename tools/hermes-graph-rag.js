#!/usr/bin/env node
'use strict';

/**
 * Hermes Graph RAG — local, incremental, $0 knowledge-graph retrieval for
 * autonomous Hermes / business-ops memory on the Mac Pro.
 *
 * Design goals (vs Microsoft GraphRAG / heavy Neo4j stacks):
 *   - Instant incremental updates (mtime-based; no full offline rebuild)
 *   - Zero cloud token cost for indexing (deterministic entity extraction)
 *   - Dual-layer retrieval: entity graph + chunk text (LightRAG-style)
 *   - Pre-action safety gate: entity lookups stay graph-local; multi-hop
 *     only when the query actually needs relational synthesis
 *   - Optional Graphify AST overlay for code structure (already on disk)
 *   - No Docker, no Neo4j, no LightRAG pip deps (those remain optional later)
 *
 * Storage (append-friendly JSON, SessionDB-adjacent):
 *   ~/.hermes/graph-rag/<repo-slug>/index.json
 *
 * Commands:
 *   node tools/hermes-graph-rag.js index [--repo PATH] [--vault PATH] [--force]
 *   node tools/hermes-graph-rag.js classify --query "..."
 *   node tools/hermes-graph-rag.js retrieve --query "..." [--depth N] [--json]
 *   node tools/hermes-graph-rag.js gate --query "..." [--json]
 *   node tools/hermes-graph-rag.js status [--json]
 *   node tools/hermes-graph-rag.js neighbors --entity "thumbgate" [--depth 2]
 *
 * Exit 0 on success; exit 1 on usage errors; retrieve/gate always best-effort (0).
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const INDEX_VERSION = 1;
const DEFAULT_STORE_ROOT = path.join(os.homedir(), '.hermes', 'graph-rag');

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.js', '.json', '.jsx', '.md', '.mjs', '.py', '.sh', '.ts', '.tsx',
  '.txt', '.yaml', '.yml',
]);

const IGNORE_DIRS = new Set([
  '.git', '.expo', '.next', '.turbo', '.worktrees', 'android', 'artifacts',
  'build', 'coverage', 'dist', 'node_modules', 'parallel-research', 'Pods',
  'vendor', 'Compiled-Vaults', 'content-engine', 'proofs', 'tmp', 'ios',
  '.graphify-venv', 'graphify-out', // graphify consumed via graph.json overlay
]);

/** Priority roots so ops/docs stay visible under caps. */
const PRIORITY_ROOTS = [
  'docs', 'tools', 'coordination', 'evals', 'scripts', 'apps',
  'hermes-mobile/docs', '.github',
];

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what',
  'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
]);

// Multi-hop / relational query signals (pre-action gate)
const MULTI_HOP_RE =
  /\b(how (?:does|do|is)|relate[sd]?|relationship|between|depends? on|dependency|call(?:s|ed|ing)?|import(?:s|ed)?|path from|connect(?:s|ed|ion)?|impact|owner(?:ship)?|who owns|timeline|history of|changed|before|after|versus|vs\.?|compare|trade-?off|because|caused|leads? to|blocked by|owned by)\b/i;

const ENTITY_HINT_RE =
  /\b(entity|lookup|what is|who is|define|definition|status of|where is)\b/i;

// ─── Utils ──────────────────────────────────────────────────────────

function slugRepo(repoPath) {
  const base = path.basename(path.resolve(repoPath)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const hash = crypto.createHash('sha1').update(path.resolve(repoPath)).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

function indexPathFor(repoPath, storeRoot = DEFAULT_STORE_ROOT) {
  return path.join(storeRoot, slugRepo(repoPath), 'index.json');
}

function normalizeEntity(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\[\[|\]\]$/g, '')
    .replace(/\|.*$/, '') // wiki alias
    .replace(/\.md$/i, '')
    .replace(/[\/\\]+/g, '/')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .toLowerCase();
}

function entityId(label) {
  return normalizeEntity(label).replace(/[^a-z0-9./_-]+/g, '_').slice(0, 96) || 'unknown';
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function emptyIndex(repoPath) {
  return {
    version: INDEX_VERSION,
    repo: path.resolve(repoPath),
    updatedAt: null,
    files: {},
    nodes: {},
    edges: [],
    chunks: {},
    stats: { files: 0, nodes: 0, edges: 0, chunks: 0 },
  };
}

// ─── Corpus walk ────────────────────────────────────────────────────

function shouldIndexFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  // Skip huge dumps
  try {
    const st = fs.statSync(absPath);
    if (st.size > 1_500_000) return false;
  } catch {
    return false;
  }
  return true;
}

function walkDir(root, relativeBase, out, { maxFiles = 4000 } = {}) {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  // Prefer deterministic order
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    if (out.length >= maxFiles) return;
    if (ent.name.startsWith('.') && ent.name !== '.github') continue;
    if (IGNORE_DIRS.has(ent.name)) continue;
    const abs = path.join(root, ent.name);
    const rel = relativeBase ? path.join(relativeBase, ent.name) : ent.name;
    if (ent.isDirectory()) {
      walkDir(abs, rel, out, { maxFiles });
    } else if (ent.isFile() && shouldIndexFile(abs)) {
      out.push({ abs, rel: rel.replace(/\\/g, '/') });
    }
  }
}

function collectCorpus(repoPath, options = {}) {
  const maxFiles = options.maxFiles || 4000;
  const files = [];
  const repo = path.resolve(repoPath);

  // Priority roots first
  for (const root of PRIORITY_ROOTS) {
    const abs = path.join(repo, root);
    if (fs.existsSync(abs)) {
      walkDir(abs, root, files, { maxFiles });
    }
  }
  // Top-level markdown / key files
  for (const name of ['AGENTS.md', 'Claude.md', 'plan.md', 'README.md']) {
    const abs = path.join(repo, name);
    if (fs.existsSync(abs) && shouldIndexFile(abs)) {
      const rel = name;
      if (!files.some((f) => f.rel === rel)) files.push({ abs, rel });
    }
  }
  // Optional vault (Obsidian AI-Agent-Sync) — bounded
  if (options.vault) {
    const vault = path.resolve(options.vault);
    const vaultRoots = ['Handoffs', 'Knowledge', 'Procedural-Memory', 'Declarative-Memory', 'Agent-State', 'Daily'];
    for (const vr of vaultRoots) {
      const abs = path.join(vault, vr);
      if (fs.existsSync(abs)) {
        walkDir(abs, `vault:${vr}`, files, { maxFiles });
      }
    }
  }
  return files.slice(0, maxFiles);
}

// ─── Extraction ─────────────────────────────────────────────────────

function extractFromText(text, sourcePath) {
  const nodes = new Map(); // id -> node
  const edges = [];
  const chunks = [];

  function addNode(label, type, meta = {}) {
    const id = entityId(label);
    if (!id || id === 'unknown') return id;
    const existing = nodes.get(id);
    if (existing) {
      if (!existing.paths.includes(sourcePath)) existing.paths.push(sourcePath);
      return id;
    }
    nodes.set(id, {
      id,
      label: String(label).trim().slice(0, 160),
      type,
      paths: [sourcePath],
      ...meta,
    });
    return id;
  }

  function addEdge(source, target, relation, weight = 1) {
    if (!source || !target || source === target) return;
    edges.push({ source, target, relation, weight, path: sourcePath });
  }

  // Document node
  const docId = addNode(sourcePath, 'document', { kind: 'file' });

  // Headings as section entities + contains edges
  const lines = String(text || '').split(/\r?\n/);
  let currentSection = docId;
  let chunkBuf = [];
  let chunkStart = 0;

  function flushChunk(endLine) {
    const body = chunkBuf.join('\n').trim();
    if (body.length < 40) {
      chunkBuf = [];
      return;
    }
    const id = crypto
      .createHash('sha1')
      .update(`${sourcePath}:${chunkStart}:${endLine}:${body.slice(0, 200)}`)
      .digest('hex')
      .slice(0, 16);
    const entities = [];
    // entity mentions inside chunk
    for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
      entities.push(entityId(m[1]));
    }
    for (const m of body.matchAll(/`([A-Za-z][A-Za-z0-9_./-]{2,80})`/g)) {
      entities.push(entityId(m[1]));
    }
    chunks.push({
      id,
      path: sourcePath,
      startLine: chunkStart + 1,
      endLine: endLine,
      text: body.slice(0, 2400),
      entities: [...new Set(entities)].slice(0, 40),
      section: currentSection,
    });
    chunkBuf = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushChunk(i);
      chunkStart = i;
      const title = heading[2].trim();
      const secId = addNode(title, 'section');
      addEdge(docId, secId, 'contains', 1.2);
      currentSection = secId;
      chunkBuf.push(line);
      continue;
    }
    chunkBuf.push(line);
    // Flush long chunks ~80 lines
    if (chunkBuf.length >= 80) {
      flushChunk(i + 1);
      chunkStart = i + 1;
    }
  }
  flushChunk(lines.length);

  // Wiki links
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = addNode(m[1], 'wiki');
    addEdge(docId, target, 'links_to', 1.5);
    addEdge(currentSection, target, 'mentions', 1.0);
  }

  // Markdown links [text](url-or-path)
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const label = m[1];
    const href = m[2];
    if (href.startsWith('http')) {
      const tid = addNode(href.replace(/^https?:\/\//, '').split('/')[0], 'external');
      addEdge(docId, tid, 'references', 0.8);
    } else if (!href.startsWith('#')) {
      const tid = addNode(href.split('#')[0], 'path_ref');
      addEdge(docId, tid, 'references', 1.0);
    } else {
      addNode(label, 'anchor');
    }
  }

  // Hashtags / skill tags
  for (const m of text.matchAll(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{2,40})\b/g)) {
    const tid = addNode(m[1], 'tag');
    addEdge(docId, tid, 'tagged', 0.9);
  }

  // Backtick identifiers (code-ish)
  for (const m of text.matchAll(/`([A-Za-z][A-Za-z0-9_./-]{2,80})`/g)) {
    const raw = m[1];
    // Skip pure numbers / common noise
    if (/^\d+$/.test(raw)) continue;
    const tid = addNode(raw, 'symbol');
    addEdge(docId, tid, 'mentions', 1.0);
  }

  // Co-occurrence edges between entities in the same chunk (cap)
  for (const ch of chunks) {
    const ents = ch.entities.slice(0, 12);
    for (let i = 0; i < ents.length; i += 1) {
      for (let j = i + 1; j < ents.length; j += 1) {
        addEdge(ents[i], ents[j], 'co_occurs', 0.5);
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    chunks,
  };
}

// ─── Index build (incremental) ──────────────────────────────────────

function loadIndex(repoPath, storeRoot = DEFAULT_STORE_ROOT) {
  const file = indexPathFor(repoPath, storeRoot);
  const idx = readJsonSafe(file, null);
  if (!idx || idx.version !== INDEX_VERSION) return emptyIndex(repoPath);
  return idx;
}

function saveIndex(repoPath, index, storeRoot = DEFAULT_STORE_ROOT) {
  const file = indexPathFor(repoPath, storeRoot);
  index.updatedAt = new Date().toISOString();
  index.stats = {
    files: Object.keys(index.files || {}).length,
    nodes: Object.keys(index.nodes || {}).length,
    edges: (index.edges || []).length,
    chunks: Object.keys(index.chunks || {}).length,
  };
  writeJsonAtomic(file, index);
  return file;
}

function removeFileFromIndex(index, rel) {
  const meta = index.files[rel];
  if (!meta) return;
  const chunkIds = new Set(meta.chunkIds || []);
  for (const id of chunkIds) delete index.chunks[id];
  // Soft-delete edges/nodes for this path: rebuild edges filter
  index.edges = (index.edges || []).filter((e) => e.path !== rel);
  for (const [nid, node] of Object.entries(index.nodes)) {
    node.paths = (node.paths || []).filter((p) => p !== rel);
    if (!node.paths.length) delete index.nodes[nid];
  }
  delete index.files[rel];
}

function mergeExtract(index, rel, extract, mtimeMs, size) {
  removeFileFromIndex(index, rel);
  const chunkIds = [];
  for (const ch of extract.chunks) {
    index.chunks[ch.id] = ch;
    chunkIds.push(ch.id);
  }
  for (const n of extract.nodes) {
    const existing = index.nodes[n.id];
    if (existing) {
      existing.paths = [...new Set([...(existing.paths || []), ...n.paths])];
      if (!existing.type || existing.type === 'document') existing.type = n.type;
    } else {
      index.nodes[n.id] = n;
    }
  }
  for (const e of extract.edges) {
    index.edges.push(e);
  }
  index.files[rel] = { mtimeMs, size, chunkIds, indexedAt: new Date().toISOString() };
}

/**
 * Overlay Graphify AST graph (code structure) as typed edges.
 * Does not re-run extractors — only maps source_file → node links.
 */
function overlayGraphify(index, repoPath, { maxLinks = 8000 } = {}) {
  const graphFile = path.join(repoPath, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphFile)) {
    return { ok: false, reason: 'graphify-out/graph.json missing' };
  }
  let body;
  try {
    body = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const links = Array.isArray(body.links) ? body.links : [];
  let addedNodes = 0;
  let addedEdges = 0;

  // Strip previous graphify overlay edges
  index.edges = (index.edges || []).filter((e) => e.relation !== 'ast' && e.origin !== 'graphify');

  const labelById = new Map();
  for (const n of nodes) {
    if (!n || !n.id) continue;
    const label = n.label || n.id;
    const file = n.source_file || '';
    const id = entityId(`ast:${n.id}`);
    labelById.set(n.id, id);
    if (!index.nodes[id]) {
      index.nodes[id] = {
        id,
        label: String(label).slice(0, 160),
        type: 'ast_symbol',
        paths: file ? [file] : [],
        origin: 'graphify',
      };
      addedNodes += 1;
    } else if (file && !index.nodes[id].paths.includes(file)) {
      index.nodes[id].paths.push(file);
    }
    if (file) {
      const docId = entityId(file);
      if (!index.nodes[docId]) {
        index.nodes[docId] = {
          id: docId,
          label: file,
          type: 'document',
          paths: [file],
        };
      }
      index.edges.push({
        source: docId,
        target: id,
        relation: 'ast',
        weight: 1.0,
        path: file,
        origin: 'graphify',
      });
      addedEdges += 1;
    }
  }

  for (const link of links.slice(0, maxLinks)) {
    const s = labelById.get(link.source);
    const t = labelById.get(link.target);
    if (!s || !t) continue;
    index.edges.push({
      source: s,
      target: t,
      relation: link.relation || 'ast',
      weight: Number(link.weight) || 1,
      path: link.source_file || '',
      origin: 'graphify',
    });
    addedEdges += 1;
  }

  return { ok: true, addedNodes, addedEdges, graphFile };
}

function buildIndex(repoPath, options = {}) {
  const storeRoot = options.storeRoot || DEFAULT_STORE_ROOT;
  const force = Boolean(options.force);
  const index = force ? emptyIndex(repoPath) : loadIndex(repoPath, storeRoot);
  index.repo = path.resolve(repoPath);

  const corpus = collectCorpus(repoPath, {
    maxFiles: options.maxFiles || 4000,
    vault: options.vault,
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let removed = 0;

  const seen = new Set();
  for (const file of corpus) {
    scanned += 1;
    seen.add(file.rel);
    let st;
    try {
      st = fs.statSync(file.abs);
    } catch {
      continue;
    }
    const prev = index.files[file.rel];
    if (!force && prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      skipped += 1;
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(file.abs, 'utf8');
    } catch {
      continue;
    }
    const extract = extractFromText(text, file.rel);
    mergeExtract(index, file.rel, extract, st.mtimeMs, st.size);
    updated += 1;
  }

  // Drop deleted files
  for (const rel of Object.keys(index.files)) {
    if (!seen.has(rel) && !rel.startsWith('vault:')) {
      // Keep vault files if vault not re-scanned this run without vault option
      if (!options.vault && rel.startsWith('vault:')) continue;
      removeFileFromIndex(index, rel);
      removed += 1;
    }
  }

  let graphify = { ok: false, reason: 'skipped' };
  if (options.graphify !== false) {
    graphify = overlayGraphify(index, path.resolve(repoPath));
  }

  // Cap edge list growth (keep highest weight)
  if (index.edges.length > 100_000) {
    index.edges.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    index.edges = index.edges.slice(0, 80_000);
  }

  const saved = saveIndex(repoPath, index, storeRoot);
  return {
    ok: true,
    indexPath: saved,
    scanned,
    updated,
    skipped,
    removed,
    graphify,
    stats: index.stats,
  };
}

// ─── Query gate + graph walk ────────────────────────────────────────

function matchEntities(query, index, limit = 12) {
  const tokens = tokenize(query);
  const qNorm = normalizeEntity(query);
  const scored = [];

  for (const node of Object.values(index.nodes || {})) {
    const id = node.id;
    const label = normalizeEntity(node.label);
    let score = 0;
    if (label === qNorm || id === qNorm) score += 10;
    if (qNorm.includes(label) && label.length >= 4) score += 4;
    if (label.includes(qNorm) && qNorm.length >= 4) score += 5;
    for (const t of tokens) {
      if (label === t || id === t) score += 3;
      else if (label.includes(t) || id.includes(t)) score += 1.2;
      else if (t.includes(label) && label.length >= 5) score += 0.8;
    }
    // Prefer business docs over AST noise slightly for equal scores
    if (node.type === 'document' || node.type === 'wiki' || node.type === 'section') score += 0.3;
    if (node.type === 'ast_symbol') score *= 0.85;
    if (score > 0) scored.push({ ...node, matchScore: score });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id));
  return scored.slice(0, limit);
}

function classifyQuery(query, index) {
  const q = String(query || '').trim();
  const entities = index ? matchEntities(q, index, 8) : [];
  const multiHop = MULTI_HOP_RE.test(q);
  const entityHint = ENTITY_HINT_RE.test(q);
  const tokenCount = tokenize(q).length;
  const strongEntity = entities.length > 0 && entities[0].matchScore >= 4;

  let mode = 'semantic';
  let depth = 0;
  let reason = 'default_semantic';

  if (multiHop && strongEntity) {
    mode = 'multi_hop';
    depth = 2;
    reason = 'relational_language+entity_match';
  } else if (multiHop && entities.length >= 2) {
    mode = 'multi_hop';
    depth = 2;
    reason = 'relational_language+multiple_entities';
  } else if (entityHint && strongEntity && tokenCount <= 8) {
    mode = 'entity';
    depth = 1;
    reason = 'entity_lookup';
  } else if (strongEntity && tokenCount <= 4 && !multiHop) {
    mode = 'entity';
    depth = 1;
    reason = 'short_entity_query';
  } else if (strongEntity) {
    mode = 'semantic';
    depth = 1; // graph boost only
    reason = 'semantic_with_graph_boost';
  }

  // Safety gate recommendation for agent routers
  let externalLlm = true;
  let preferredBackend = 'hybrid';
  if (mode === 'entity') {
    externalLlm = false;
    preferredBackend = 'graph';
  } else if (mode === 'multi_hop') {
    externalLlm = true; // synthesis may need LLM; retrieval itself is local
    preferredBackend = 'graph+hybrid';
  } else {
    preferredBackend = 'hybrid';
  }

  return {
    query: q,
    mode,
    depth,
    reason,
    entities: entities.slice(0, 6).map((e) => ({
      id: e.id,
      label: e.label,
      type: e.type,
      matchScore: Number(e.matchScore.toFixed(3)),
      paths: (e.paths || []).slice(0, 5),
    })),
    gate: {
      preferredBackend,
      runGraph: mode === 'entity' || mode === 'multi_hop' || depth > 0,
      runKeyword: mode !== 'entity',
      runEmbedding: mode === 'semantic' || mode === 'multi_hop',
      skipExternalLlmForLookup: mode === 'entity',
      externalLlmForSynthesis: externalLlm && mode !== 'entity',
      note:
        mode === 'entity'
          ? 'Entity-centric lookup — serve graph neighbors; do not spend cloud tokens for retrieval.'
          : mode === 'multi_hop'
            ? 'Multi-hop relational query — traverse graph then synthesize; prefer local embeddings.'
            : 'Semantic query — keyword+embedding hybrid; optional graph boost if entities matched.',
    },
  };
}

function buildAdjacency(index) {
  const adj = new Map();
  for (const e of index.edges || []) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push({ id: e.target, relation: e.relation, weight: e.weight || 1, path: e.path });
    adj.get(e.target).push({ id: e.source, relation: e.relation, weight: e.weight || 1, path: e.path, reverse: true });
  }
  return adj;
}

function bfsNeighbors(seedIds, adj, depth = 1, limit = 40) {
  const visited = new Map(); // id -> { depth, via }
  const queue = [];
  for (const id of seedIds) {
    visited.set(id, { depth: 0, via: null, relation: 'seed' });
    queue.push(id);
  }
  while (queue.length) {
    const cur = queue.shift();
    const meta = visited.get(cur);
    if (meta.depth >= depth) continue;
    const neighbors = adj.get(cur) || [];
    for (const n of neighbors) {
      if (visited.has(n.id)) continue;
      visited.set(n.id, {
        depth: meta.depth + 1,
        via: cur,
        relation: n.relation,
        weight: n.weight,
        path: n.path,
      });
      queue.push(n.id);
      if (visited.size >= limit + seedIds.length) break;
    }
    if (visited.size >= limit + seedIds.length) break;
  }
  return visited;
}

function scoreChunks(query, index, seedIds, neighborMap) {
  const tokens = tokenize(query);
  const seedSet = new Set(seedIds);
  const neighborSet = new Set(neighborMap.keys());
  const results = [];

  for (const ch of Object.values(index.chunks || {})) {
    let score = 0;
    const textToks = tokenize(ch.text);
    const textSet = new Set(textToks);
    for (const t of tokens) {
      if (textSet.has(t)) score += 1.5;
    }
    // Entity boosts
    for (const ent of ch.entities || []) {
      if (seedSet.has(ent)) score += 4;
      else if (neighborSet.has(ent)) score += 2;
    }
    if (seedSet.has(ch.section) || neighborSet.has(ch.section)) score += 1.5;
    if (seedSet.has(entityId(ch.path)) || neighborSet.has(entityId(ch.path))) score += 1.2;

    // Path quality
    const p = ch.path || '';
    if (/^docs\//.test(p) || p.includes('Handoffs') || p.includes('Procedural')) score *= 1.15;
    if (/\.test\.|__tests__|\/tests\//.test(p)) score *= 0.5;

    if (score > 0) {
      results.push({
        path: ch.path,
        score,
        snippet: ch.text.slice(0, 360).replace(/\s+/g, ' '),
        startLine: ch.startLine,
        endLine: ch.endLine,
        entities: ch.entities,
        sources: ['graph_chunk'],
      });
    }
  }

  // Aggregate by path (best chunk)
  const best = new Map();
  for (const r of results) {
    const prev = best.get(r.path);
    if (!prev || r.score > prev.score) best.set(r.path, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function retrieve(query, options = {}) {
  const repo = path.resolve(options.repo || REPO);
  const storeRoot = options.storeRoot || DEFAULT_STORE_ROOT;
  let index = loadIndex(repo, storeRoot);

  // Auto-index if empty
  if (!Object.keys(index.files || {}).length) {
    buildIndex(repo, {
      storeRoot,
      vault: options.vault,
      graphify: options.graphify !== false,
      maxFiles: options.maxFiles || 2000,
    });
    index = loadIndex(repo, storeRoot);
  }

  const classification = classifyQuery(query, index);
  const depth = options.depth != null ? Number(options.depth) : classification.depth || 1;
  const limit = options.limit || 8;

  const seedIds = classification.entities.map((e) => e.id);
  const adj = buildAdjacency(index);
  const neighborMap = seedIds.length
    ? bfsNeighbors(seedIds, adj, Math.max(depth, 1), 60)
    : new Map();

  const graphNodes = [];
  for (const [id, meta] of neighborMap.entries()) {
    const node = index.nodes[id];
    if (!node) continue;
    graphNodes.push({
      id,
      label: node.label,
      type: node.type,
      depth: meta.depth,
      via: meta.via,
      relation: meta.relation,
      paths: (node.paths || []).slice(0, 5),
      score: meta.depth === 0 ? 10 : 10 / (1 + meta.depth),
    });
  }
  graphNodes.sort((a, b) => b.score - a.score);

  const chunkHits = scoreChunks(query, index, seedIds, neighborMap);

  // Also surface direct document paths from matched entities
  const pathBoost = new Map();
  for (const ent of classification.entities) {
    for (const p of ent.paths || []) {
      pathBoost.set(p, (pathBoost.get(p) || 0) + ent.matchScore);
    }
  }
  for (const n of graphNodes) {
    for (const p of n.paths || []) {
      pathBoost.set(p, (pathBoost.get(p) || 0) + n.score * 0.5);
    }
  }

  const fused = new Map();
  for (const hit of chunkHits) {
    fused.set(hit.path, {
      path: hit.path,
      score: hit.score,
      snippet: hit.snippet,
      startLine: hit.startLine,
      endLine: hit.endLine,
      sources: hit.sources,
      reasons: ['graph:chunk-match'],
    });
  }
  for (const [p, boost] of pathBoost.entries()) {
    const existing = fused.get(p);
    if (existing) {
      existing.score += boost;
      if (!existing.reasons.includes('graph:entity-path')) existing.reasons.push('graph:entity-path');
    } else {
      fused.set(p, {
        path: p,
        score: boost,
        snippet: '',
        sources: ['graph_entity'],
        reasons: ['graph:entity-path'],
      });
    }
  }

  const matches = [...fused.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((m, i) => ({
      path: m.path,
      score: Number(m.score.toFixed(4)),
      rank: i + 1,
      snippet: m.snippet || '',
      startLine: m.startLine || null,
      endLine: m.endLine || null,
      sources: m.sources,
      reasons: m.reasons,
    }));

  return {
    query,
    classification,
    depth,
    repo,
    indexStats: index.stats,
    seeds: seedIds,
    graphNodes: graphNodes.slice(0, 20),
    matches,
    backends: {
      graph: { provider: 'hermes-graph-rag', available: true, nodes: Object.keys(index.nodes).length },
      graphifyOverlay: Boolean((index.edges || []).some((e) => e.origin === 'graphify')),
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    command: 'retrieve',
    query: '',
    repo: REPO,
    vault: process.env.HERMES_GRAPH_RAG_VAULT || '',
    storeRoot: process.env.HERMES_GRAPH_RAG_STORE || DEFAULT_STORE_ROOT,
    limit: 8,
    depth: null,
    force: false,
    graphify: true,
    json: false,
    entity: '',
    maxFiles: 4000,
    help: false,
  };

  if (argv[0] && !argv[0].startsWith('--')) {
    args.command = argv.shift();
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--repo') args.repo = path.resolve(argv[++i] || REPO);
    else if (a === '--vault') args.vault = argv[++i] || '';
    else if (a === '--store') args.storeRoot = path.resolve(argv[++i] || DEFAULT_STORE_ROOT);
    else if (a === '--limit') args.limit = Number(argv[++i] || 8);
    else if (a === '--depth') args.depth = Number(argv[++i]);
    else if (a === '--entity') args.entity = argv[++i] || '';
    else if (a === '--max-files') args.maxFiles = Number(argv[++i] || 4000);
    else if (a === '--force') args.force = true;
    else if (a === '--no-graphify') args.graphify = false;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.query && !a.startsWith('--')) args.query = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Hermes Graph RAG — local incremental dual-layer retrieval ($0 index cost)

Commands:
  index      Build/update the knowledge graph (mtime incremental)
  classify   Pre-action query gate (entity | multi_hop | semantic)
  gate       Alias for classify (agent router safety gate)
  retrieve   Graph + chunk retrieval with hop expansion
  neighbors  Show N-hop neighbors for an entity
  status     Index stats + path

Options:
  --query <text>     Query string
  --repo <path>      Repository root
  --vault <path>     Optional Obsidian vault (e.g. ~/Documents/AI-Agent-Sync)
  --store <path>     Index store root (default: ~/.hermes/graph-rag)
  --depth <n>        Graph hop depth
  --limit <n>        Max matches
  --force            Full rebuild
  --no-graphify      Skip AST overlay from graphify-out/graph.json
  --json             JSON output

Examples:
  node tools/hermes-graph-rag.js index --vault "$HOME/Documents/AI-Agent-Sync"
  node tools/hermes-graph-rag.js gate --query "how does leash relate to pair" --json
  node tools/hermes-graph-rag.js retrieve --query "thumbgate continuity ownership" --json
`);
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (args.help || !args.command) {
    printHelp();
    process.exit(0);
  }

  const out = (obj) => {
    if (args.json) console.log(JSON.stringify(obj, null, 2));
    else if (typeof obj === 'string') console.log(obj);
    else console.log(JSON.stringify(obj, null, 2));
  };

  try {
    if (args.command === 'index') {
      const result = buildIndex(args.repo, {
        storeRoot: args.storeRoot,
        vault: args.vault || undefined,
        force: args.force,
        graphify: args.graphify,
        maxFiles: args.maxFiles,
      });
      out(result);
      process.exit(result.ok ? 0 : 1);
    }

    if (args.command === 'status') {
      const idxPath = indexPathFor(args.repo, args.storeRoot);
      const index = loadIndex(args.repo, args.storeRoot);
      out({
        indexPath: idxPath,
        exists: fs.existsSync(idxPath),
        updatedAt: index.updatedAt,
        stats: index.stats,
        repo: index.repo || args.repo,
      });
      process.exit(0);
    }

    if (args.command === 'classify' || args.command === 'gate') {
      if (!args.query) throw new Error('--query required');
      let index = loadIndex(args.repo, args.storeRoot);
      if (!Object.keys(index.files || {}).length) {
        buildIndex(args.repo, {
          storeRoot: args.storeRoot,
          vault: args.vault || undefined,
          graphify: args.graphify,
          maxFiles: Math.min(args.maxFiles, 1500),
        });
        index = loadIndex(args.repo, args.storeRoot);
      }
      out(classifyQuery(args.query, index));
      process.exit(0);
    }

    if (args.command === 'neighbors') {
      const entity = args.entity || args.query;
      if (!entity) throw new Error('--entity or --query required');
      const index = loadIndex(args.repo, args.storeRoot);
      const seeds = matchEntities(entity, index, 3).map((e) => e.id);
      const adj = buildAdjacency(index);
      const depth = args.depth != null ? args.depth : 2;
      const visited = bfsNeighbors(seeds, adj, depth, 50);
      const nodes = [...visited.entries()].map(([id, meta]) => ({
        id,
        label: index.nodes[id]?.label,
        type: index.nodes[id]?.type,
        ...meta,
        paths: index.nodes[id]?.paths?.slice(0, 5),
      }));
      out({ seeds, depth, nodes });
      process.exit(0);
    }

    if (args.command === 'retrieve' || args.command === 'query') {
      if (!args.query) throw new Error('--query required');
      const result = retrieve(args.query, {
        repo: args.repo,
        storeRoot: args.storeRoot,
        vault: args.vault || undefined,
        depth: args.depth,
        limit: args.limit,
        graphify: args.graphify,
        maxFiles: args.maxFiles,
      });
      out(result);
      process.exit(0);
    }

    throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  INDEX_VERSION,
  DEFAULT_STORE_ROOT,
  slugRepo,
  indexPathFor,
  normalizeEntity,
  entityId,
  tokenize,
  extractFromText,
  collectCorpus,
  buildIndex,
  loadIndex,
  saveIndex,
  classifyQuery,
  matchEntities,
  buildAdjacency,
  bfsNeighbors,
  retrieve,
  overlayGraphify,
  emptyIndex,
};
