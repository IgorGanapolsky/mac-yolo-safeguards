#!/usr/bin/env node
'use strict';

/**
 * MCP inventory + structural health for this repo's .mcp.json.
 *
 * Does not require live tokens for the default (offline) mode.
 * Optional --ping probes HTTP MCP initialize (may 401 without secrets — reported as warn).
 *
 *   node tools/mcp-health-check.js
 *   node tools/mcp-health-check.js --json
 *   node tools/mcp-health-check.js --write-docs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const REPO = path.resolve(__dirname, '..');
const MCP_PATH = path.join(REPO, '.mcp.json');
const DOCS_PATH = path.join(REPO, 'docs/MCP-INVENTORY.md');

/** Blast-radius / scope metadata (hand-curated; extend when adding servers). */
const SERVER_META = {
  github: {
    scope: 'GitHub Issues/PRs/reviews — agent coordination bus',
    secret: 'GITHUB_MCP_PAT / Authorization bearer',
    locality: 'remote-http',
    blastRadius: 'repo + org GitHub via token scopes',
  },
  context7: {
    scope: 'Library/framework documentation lookup',
    secret: 'CONTEXT7_API_KEY (optional)',
    locality: 'remote-http',
    blastRadius: 'read-only docs fetch',
  },
  grepai: {
    scope: 'Local semantic code search (Tree-sitter + embeddings)',
    secret: 'none (local binary + index path)',
    locality: 'local-stdio',
    blastRadius: 'read local index only; Mac-only',
  },
  thumbgate: {
    scope: 'Lessons recall/capture, product gates (host-dependent)',
    secret: 'host ThumbGate MCP wiring',
    locality: 'host-dependent',
    blastRadius: 'workspace memory write + read',
  },
  gmail: {
    scope: 'Gmail read/send when host wires it',
    secret: 'Gmail OAuth / MCP host',
    locality: 'host-dependent',
    blastRadius: 'email read/send — high',
  },
  playwright: {
    scope: 'Browser automation',
    secret: 'none',
    locality: 'local',
    blastRadius: 'browser sessions / navigations',
  },
};

function parseArgs(argv) {
  const args = { json: false, writeDocs: false, ping: false, help: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--write-docs') args.writeDocs = true;
    else if (a === '--ping') args.ping = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadMcpConfig() {
  if (!fs.existsSync(MCP_PATH)) {
    return { ok: false, error: '.mcp.json missing', servers: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(MCP_PATH, 'utf8'));
    return { ok: true, servers: raw.mcpServers || {}, raw };
  } catch (error) {
    return { ok: false, error: error.message, servers: {} };
  }
}

function classifyServer(name, config) {
  const meta = SERVER_META[name] || {
    scope: 'unlisted — add to SERVER_META in tools/mcp-health-check.js',
    secret: 'unknown',
    locality: config.url ? 'remote-http' : config.command ? 'local-stdio' : 'unknown',
    blastRadius: 'unknown — document before production use',
  };
  const issues = [];
  if (!config.url && !config.command) issues.push('no url or command');
  if (config.url && config.type && config.type !== 'http' && config.type !== 'sse') {
    issues.push(`unusual type: ${config.type}`);
  }
  if (config.command === 'grepai' && !config.args?.length) issues.push('grepai missing args');
  return {
    name,
    type: config.type || (config.command ? 'stdio' : 'unknown'),
    url: config.url || null,
    command: config.command || null,
    ...meta,
    issues,
    healthy: issues.length === 0,
  };
}

function pingHttp(url, headers = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-health-check', version: '1.0.0' },
      },
    });
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        timeout: 8000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 500,
            bodySnippet: data.slice(0, 200),
          });
        });
      },
    );
    req.on('error', (error) => resolve({ status: 0, ok: false, error: error.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, ok: false, error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

function expandHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') continue;
    out[key] = value.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (_, name, fallback) => {
      if (process.env[name] != null && process.env[name] !== '') return process.env[name];
      return fallback != null ? fallback : '';
    });
  }
  return out;
}

function renderDocs(rows) {
  const lines = [
    '# MCP inventory',
    '',
    'Generated by `node tools/mcp-health-check.js --write-docs`. Hand-edit `SERVER_META` in the tool when adding servers.',
    '',
    '| Server | Locality | Scope | Secret | Blast radius | Config healthy |',
    '|--------|----------|-------|--------|--------------|----------------|',
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.name}\` | ${row.locality} | ${row.scope.replace(/\|/g, '/')} | ${row.secret.replace(/\|/g, '/')} | ${row.blastRadius.replace(/\|/g, '/')} | ${row.healthy ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push('## How we know it works');
  lines.push('');
  lines.push('- Structural: `node tools/mcp-health-check.js` (CI / maturity scorecard).');
  lines.push('- Optional live: `node tools/mcp-health-check.js --ping` (needs tokens for private servers).');
  lines.push('- Product memory: ThumbGate MCP `recall` after `capture` (AGENTS.md protected component).');
  lines.push('');
  lines.push('## Security rules');
  lines.push('');
  lines.push('- Never commit MCP PATs or API keys.');
  lines.push('- Prefer least-privilege tokens (GitHub: contents/issues/PRs only as needed).');
  lines.push('- Local stdio servers (grepai) must not run on untrusted multi-tenant hosts.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/mcp-health-check.js [--json] [--write-docs] [--ping]');
    process.exit(0);
  }
  const loaded = loadMcpConfig();
  if (!loaded.ok) {
    const fail = { ok: false, error: loaded.error, servers: [] };
    if (args.json) console.log(JSON.stringify(fail, null, 2));
    else console.error(loaded.error);
    process.exit(1);
  }
  const rows = Object.entries(loaded.servers).map(([name, config]) =>
    classifyServer(name, config || {}),
  );
  if (args.ping) {
    for (const row of rows) {
      const config = loaded.servers[row.name];
      if (!config?.url) {
        row.ping = { skipped: true, reason: 'not http' };
        continue;
      }
      row.ping = await pingHttp(config.url, expandHeaders(config.headers || {}));
    }
  }
  const ok = rows.every((r) => r.healthy);
  const report = {
    ok,
    path: '.mcp.json',
    serverCount: rows.length,
    servers: rows,
  };
  if (args.writeDocs) {
    fs.mkdirSync(path.dirname(DOCS_PATH), { recursive: true });
    fs.writeFileSync(DOCS_PATH, renderDocs(rows));
    report.docsWritten = 'docs/MCP-INVENTORY.md';
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`MCP health: ${rows.filter((r) => r.healthy).length}/${rows.length} servers structurally healthy`);
    for (const r of rows) {
      console.log(`  ${r.healthy ? 'OK' : '!!'} ${r.name} (${r.locality}) — ${r.scope}`);
      if (r.issues.length) console.log(`      issues: ${r.issues.join('; ')}`);
      if (r.ping) console.log(`      ping: ${JSON.stringify(r.ping)}`);
    }
    if (args.writeDocs) console.log(`Wrote ${report.docsWritten}`);
  }
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

module.exports = { classifyServer, loadMcpConfig, renderDocs, SERVER_META };
