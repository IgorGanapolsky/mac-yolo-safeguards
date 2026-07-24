#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const REPO = path.resolve(__dirname, '..');
const GRAPHIFY_BIN = path.join(REPO, '.graphify-venv', 'bin', 'graphify');
const GRAPH_JSON = path.join(REPO, 'graphify-out', 'graph.json');

const TOOLS = [
  {
    name: 'graphify_search',
    description: 'Search the code knowledge graph with a natural-language query. Returns relevant code nodes (functions, classes, files, concepts) with their source locations. Use this instead of grep when you need semantic context about how code works together.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of what you are looking for' },
        budget: { type: 'number', description: 'Max approximate tokens to return (default 1000, max 5000)', default: 1000 },
      },
      required: ['query'],
    },
  },
  {
    name: 'graphify_symbol',
    description: 'Look up a specific symbol (function, class, constant, file) in the code graph. Returns its type, source location, and direct connections (what imports/calls/contains it).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name (e.g. "checkGraphStaleness", "GatewayContext", "MEGAFILES")' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'graphify_refs',
    description: 'Find the relationship path between two code entities (files, functions, symbols). Returns how A connects to B through imports, calls, or containment.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or symbol' },
        target: { type: 'string', description: 'Target file or symbol' },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'graphify_status',
    description: 'Check the code graph health: node count, link count, age, and whether it is stale.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function runGraphify(args) {
  return new Promise((resolve) => {
    const child = spawn(GRAPHIFY_BIN, args, {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ stdout: '', stderr: err.message, code: -1 }));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function getGraphStatus() {
  if (!fs.existsSync(GRAPH_JSON)) {
    return { exists: false, stale: true, reason: 'graph.json missing' };
  }
  const stat = fs.statSync(GRAPH_JSON);
  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
  let nodeCount = 0;
  let linkCount = 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(GRAPH_JSON, 'utf8'));
    nodeCount = (parsed.nodes || []).length;
    linkCount = (parsed.links || parsed.edges || []).length;
  } catch { /* mid-write */ }
  return {
    exists: true,
    mtime: stat.mtime.toISOString(),
    ageHours: Math.round(ageHours * 10) / 10,
    nodeCount,
    linkCount,
    stale: ageHours > 48,
    graphifyAvailable: fs.existsSync(GRAPHIFY_BIN),
  };
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'graphify_search': {
      const budget = Math.min(args.budget || 1000, 5000);
      const res = await runGraphify(['query', args.query, '--budget', String(budget)]);
      if (res.code !== 0 || !res.stdout.trim()) {
        return { content: [{ type: 'text', text: `No results (exit ${res.code}). ${res.stderr.slice(0, 200)}` }], isError: true };
      }
      return { content: [{ type: 'text', text: res.stdout.trim() }] };
    }
    case 'graphify_symbol': {
      const res = await runGraphify(['explain', args.symbol]);
      if (res.code !== 0 || !res.stdout.trim()) {
        return { content: [{ type: 'text', text: `Symbol "${args.symbol}" not found (exit ${res.code})` }], isError: true };
      }
      return { content: [{ type: 'text', text: res.stdout.trim() }] };
    }
    case 'graphify_refs': {
      const res = await runGraphify(['path', args.source, args.target]);
      if (res.code !== 0 || !res.stdout.trim()) {
        return { content: [{ type: 'text', text: `No path found between "${args.source}" and "${args.target}".` }] };
      }
      return { content: [{ type: 'text', text: res.stdout.trim() }] };
    }
    case 'graphify_status': {
      return { content: [{ type: 'text', text: JSON.stringify(getGraphStatus(), null, 2) }] };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}

const rl = readline.createInterface({ input: process.stdin });
const pending = new Set();

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'graphify', version: '1.0.0' },
    }});
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }
  if (method === 'tools/call') {
    const result = await handleToolCall(params.name, params.arguments || {});
    return send({ jsonrpc: '2.0', id, result });
  }
  if (method === 'ping') {
    return send({ jsonrpc: '2.0', id, result: {} });
  }
  if (id !== undefined) {
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const p = handle(msg).catch((err) => {
      if (msg.id !== undefined) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `Internal error: ${err.message}` } });
      }
    });
    pending.add(p);
    p.finally(() => pending.delete(p));
  } catch { /* malformed JSON */ }
});

rl.on('close', () => {
  Promise.allSettled(pending).finally(() => process.exit(0));
});
