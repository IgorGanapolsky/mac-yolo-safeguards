#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { checkGraphStaleness } = require('./graphify-staleness-check');

const REPO = path.resolve(process.env.GRAPHIFY_REPO || path.resolve(__dirname, '..'));
const GRAPHIFY_BIN = path.resolve(
  process.env.GRAPHIFY_BIN || path.join(REPO, '.graphify-venv', 'bin', 'graphify'),
);
const GRAPH_JSON = path.resolve(
  process.env.GRAPHIFY_GRAPH || path.join(REPO, 'graphify-out', 'graph.json'),
);

const TOOLS = [
  {
    name: 'graphify_search',
    description: 'Search the validated code knowledge graph with a natural-language query. Fails closed when the graph does not match origin/main.',
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
    description: 'Look up a symbol in the validated code graph and return its source and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name (for example "checkGraphStaleness")' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'graphify_refs',
    description: 'Find the relationship path between two entities in the validated code graph.',
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
    description: 'Validate graph JSON, source SHA, build receipt, query canary, age, and package/skill version.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function runGraphify(args, options = {}) {
  const graphifyBin = options.graphifyBin || GRAPHIFY_BIN;
  const repo = options.repo || REPO;
  return new Promise((resolve) => {
    const child = (options.spawn || spawn)(graphifyBin, args, {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', (error) => resolve({ stdout: '', stderr: error.message, code: -1 }));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function getGraphStatus(options = {}) {
  return checkGraphStaleness({
    repo: options.repo || REPO,
    graphPath: options.graphPath || GRAPH_JSON,
    graphifyBin: options.graphifyBin || GRAPHIFY_BIN,
    originMainSha: options.originMainSha,
    currentVersionInfo: options.currentVersionInfo,
    now: options.now,
  });
}

function unhealthyResult(status) {
  return {
    content: [{
      type: 'text',
      text: `Graphify snapshot is not safe to serve: ${status.failures.join(', ')}. Run the atomic snapshot refresh and require strict health before querying.`,
    }],
    isError: true,
  };
}

async function handleToolCall(name, args = {}, options = {}) {
  const statusFn = options.getGraphStatus || getGraphStatus;
  const runFn = options.runGraphify || runGraphify;
  if (name === 'graphify_status') {
    return { content: [{ type: 'text', text: JSON.stringify(statusFn(options), null, 2) }] };
  }
  if (!['graphify_search', 'graphify_symbol', 'graphify_refs'].includes(name)) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  const status = statusFn(options);
  if (!status.ok) return unhealthyResult(status);
  const graphPath = options.graphPath || GRAPH_JSON;

  if (name === 'graphify_search') {
    const query = String(args.query || '').trim();
    if (!query) return { content: [{ type: 'text', text: 'query is required' }], isError: true };
    const budget = Math.min(Math.max(Number(args.budget) || 1000, 100), 5000);
    const result = await runFn(['query', query, '--graph', graphPath, '--budget', String(budget)], options);
    if (result.code !== 0 || !result.stdout.trim()) {
      return { content: [{ type: 'text', text: `No results (exit ${result.code}). ${result.stderr.slice(0, 200)}` }], isError: true };
    }
    return { content: [{ type: 'text', text: result.stdout.trim() }] };
  }
  if (name === 'graphify_symbol') {
    const symbol = String(args.symbol || '').trim();
    if (!symbol) return { content: [{ type: 'text', text: 'symbol is required' }], isError: true };
    const result = await runFn(['explain', symbol, '--graph', graphPath], options);
    if (result.code !== 0 || !result.stdout.trim()) {
      return { content: [{ type: 'text', text: `Symbol "${symbol}" not found (exit ${result.code})` }], isError: true };
    }
    return { content: [{ type: 'text', text: result.stdout.trim() }] };
  }
  const source = String(args.source || '').trim();
  const target = String(args.target || '').trim();
  if (!source || !target) {
    return { content: [{ type: 'text', text: 'source and target are required' }], isError: true };
  }
  const result = await runFn(['path', source, target, '--graph', graphPath], options);
  if (result.code !== 0 || !result.stdout.trim()) {
    return { content: [{ type: 'text', text: `No path found between "${source}" and "${target}".` }], isError: true };
  }
  return { content: [{ type: 'text', text: result.stdout.trim() }] };
}

function startServer(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = readline.createInterface({ input });
  const pending = new Set();
  const send = (message) => output.write(`${JSON.stringify(message)}\n`);
  const handle = async (message) => {
    const { id, method, params } = message;
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'graphify', version: '1.1.0' },
      } });
    }
    if (method === 'notifications/initialized') return undefined;
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const result = await handleToolCall(params.name, params.arguments || {}, options);
      return send({ jsonrpc: '2.0', id, result });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (id !== undefined) {
      return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
    return undefined;
  };
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line);
      const promise = handle(message).catch((error) => {
        if (message.id !== undefined) {
          send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `Internal error: ${error.message}` } });
        }
      });
      pending.add(promise);
      promise.finally(() => pending.delete(promise));
    } catch {
      // JSON-RPC transports ignore malformed individual lines.
    }
  });
  rl.on('close', () => Promise.allSettled(pending).finally(() => {
    if (!options.noExit) process.exit(0);
  }));
  return rl;
}

if (require.main === module) startServer();

module.exports = {
  GRAPHIFY_BIN,
  GRAPH_JSON,
  REPO,
  TOOLS,
  getGraphStatus,
  handleToolCall,
  runGraphify,
  startServer,
};
