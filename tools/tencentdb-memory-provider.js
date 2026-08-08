#!/usr/bin/env node
'use strict';
/**
 * TencentDB Agent Memory — local provider adapter.
 *
 * Exposes the two tools the real upstream `memory_tencentdb` gateway provider
 * advertises (`tdai_memory_search`, `tdai_conversation_search`) but backed
 * entirely by the local layered-memory engine (`tencentdb-memory-engine.js`).
 * This is the isolated, zero-cloud implementation of the `hermes_plugin_route`
 * readiness control. It does NOT require the Tencent Cloud plugin or Docker,
 * and it does not mutate live Hermes config.
 *
 * Tools:
 *   tdai_memory_search        query atoms.jsonl (L1/L2) with optional layer filter
 *   tdai_conversation_search  search raw refs/ files + conversation/ transcripts
 *   personamem                read the L3 persona.md
 *
 * Usage:
 *   node tools/tencentdb-memory-provider.js search --query "k" [--layer L1]
 *   node tools/tencentdb-memory-provider.js conversation --query "k"
 *   node tools/tencentdb-memory-provider.js persona --root <dir>
 *   node tools/tencentdb-memory-provider.js tools --root <dir>   (list tool schema)
 *   All accept --root (default ~/.hermes/memory/tencentdb) and --json.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOT = path.join(os.homedir(), '.hermes/memory/tencentdb');

function readOrEmpty(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
}

function loadAtoms(root) {
  const file = path.join(root, 'atoms.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function listDir(root, sub) {
  try { return fs.readdirSync(path.join(root, sub)).map((f) => path.join(sub, f)); } catch (_) { return []; }
}

function score(needle, haystack) {
  if (!needle) return 0;
  const q = String(needle).toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  const h = String(haystack).toLowerCase();
  for (const t of q) {
    if (h.includes(t)) s += 1;
    else {
      // token prefix match (e.g. compact vs compaction)
      const toks = h.split(/[^a-z0-9]+/);
      if (toks.some((x) => x.startsWith(t) || t.startsWith(x))) s += 0.5;
    }
  }
  return s;
}

function memorySearch({ query, root, layer }) {
  const atoms = loadAtoms(root).filter((a) => a && a.text);
  let filtered = atoms;
  if (layer) filtered = filtered.filter((a) => String(a.layer).toUpperCase() === String(layer).toUpperCase());
  return filtered
    .map((a) => ({ ...a, score: score(query, `${a.text} ${a.kind || ''} ${a.result_ref || ''}`) }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .filter(Boolean);
}

function conversationSearch({ query, root }) {
  const refs = listDirFiles(root, 'refs');
  const convos = listDirFiles(root, 'conversation');
  const hits = [];
  for (const rel of [...refs, ...convos]) {
    const body = readOrEmpty(path.join(root, rel));
    const s = score(query, `${rel} ${body}`);
    if (s > 0) hits.push({ ref: rel, score: s, preview: body.slice(0, 200) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 10);
}

function listDirFiles(root, sub) {
  try {
    return fs.readdirSync(path.join(root, sub)).map((f) => `${sub}/${f}`);
  } catch (_) { return []; }
}

function toolsSchema(root) {
  return {
    provider: 'memory_tencentdb',
    tools: [
      { name: 'tdai_memory_search', description: 'Search distilled layered-memory atoms (L1/L2) with optional layer filter.' },
      { name: 'tdai_conversation_search', description: 'Search raw offload refs and conversation transcripts.' },
      { name: 'personamem', description: 'Return the L3 persona.' },
    ],
    memory_root: root,
  };
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--query') args.query = argv[++i];
    else if (a === '--layer') args.layer = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('-')) throw new Error(`Unknown argument: ${a}`);
    else if (!args.cmd) args.cmd = a;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/tencentdb-memory-provider.js <tools|tdai_memory_search|tdai_conversation_search|personamem> [--root <dir>] [--query <q>] [--layer <L0..L3>] [--json]');
    process.exit(0);
  }
  const root = path.resolve(args.root);
  const cmd = args.cmd;
  let result;
  switch (cmd) {
    case 'tools':
      result = toolsSchema(root);
      break;
    case 'tdai_memory_search': {
      if (!args.query) throw new Error('tdai_memory_search requires --query');
      result = memorySearch({ query: args.query, root, layer: args.layer });
      break;
    }
    case 'tdai_conversation_search': {
      if (!args.query) throw new Error('tdai_conversation_search requires --query');
      result = conversationSearch({ query: args.query, root });
      break;
    }
    case 'personamem': {
      const f = path.join(root, 'persona.md');
      result = { persona: fs.existsSync(f) ? readOrEmpty(f) : null };
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd || ''}`);
  }
  if (args.json || true) console.log(JSON.stringify(result, null, 0));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { memorySearch, conversationSearch, toolsSchema, DEFAULT_ROOT, parseArgs };