#!/usr/bin/env node
'use strict';

/**
 * agent-incident-capture.js — Structured post-incident RAG payload (context/memory theme).
 *
 * Builds a secret-safe lesson template for ThumbGate capture_memory_feedback and
 * optionally writes a local receipt. Does not call MCP itself (agents invoke MCP).
 *
 * Usage:
 *   node tools/agent-incident-capture.js --title "..." --root-cause "..." --fix "..." \\
 *     [--artifact "path|sha|cmd"] [--signal down] [--json] [--write]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'mac-yolo-safeguards',
  'incident-captures',
);

const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{12,}\b/g,
  /\bAPI[_-]?KEY\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/gi,
  /hermes:\/\/setup\?[^\s)]+/gi,
];

function redact(text) {
  let out = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    title: '',
    rootCause: '',
    fix: '',
    artifacts: [],
    signal: 'down',
    tags: ['incident', 'agent-conf-roi'],
    json: false,
    write: false,
    outDir: process.env.AGENT_INCIDENT_DIR || DEFAULT_DIR,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--title') args.title = argv[++i] || '';
    else if (a === '--root-cause') args.rootCause = argv[++i] || '';
    else if (a === '--fix') args.fix = argv[++i] || '';
    else if (a === '--artifact') args.artifacts.push(argv[++i] || '');
    else if (a === '--signal') args.signal = argv[++i] || 'down';
    else if (a === '--tag') args.tags.push(argv[++i] || '');
    else if (a === '--json') args.json = true;
    else if (a === '--write') args.write = true;
    else if (a === '--out-dir') args.outDir = path.resolve(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function buildCapture(input) {
  const title = redact(input.title || '').trim();
  const rootCause = redact(input.rootCause || '').trim();
  const fix = redact(input.fix || '').trim();
  const artifacts = (input.artifacts || [])
    .map((a) => redact(a).trim())
    .filter(Boolean)
    .slice(0, 12);
  const signal = input.signal === 'up' ? 'up' : 'down';
  const date = new Date().toISOString().slice(0, 10);

  if (!title || !rootCause || !fix) {
    return {
      ok: false,
      error: 'title, root-cause, and fix are required',
    };
  }

  const context = [
    `MISTAKE: ${date}: ${title}`,
    `Root cause: ${rootCause}`,
    `Fix: ${fix}`,
    artifacts.length ? `Artifacts: ${artifacts.join('; ')}` : null,
    'Heuristic: capture concrete paths/SHAs/commands — never vibes-only ship claims.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    mcp: {
      tool: 'capture_memory_feedback',
      signal,
      context,
      tags: [...new Set([...(input.tags || []), 'hermes', 'observability'])],
    },
    receipt: {
      schema: 'agent-incident-capture/v1',
      writtenAt: new Date().toISOString(),
      title,
      rootCause,
      fix,
      artifacts,
      signal,
      repo: REPO,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/agent-incident-capture.js --title "..." --root-cause "..." --fix "..." \\
    [--artifact "..."] [--signal down|up] [--write] [--json]`);
    process.exit(0);
  }

  const built = buildCapture(args);
  if (!built.ok) {
    console.error(built.error);
    process.exit(1);
  }

  let writtenPath = null;
  if (args.write) {
    fs.mkdirSync(args.outDir, { recursive: true });
    const safe = built.receipt.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48);
    writtenPath = path.join(args.outDir, `${Date.now()}-${safe || 'incident'}.json`);
    fs.writeFileSync(writtenPath, JSON.stringify(built.receipt, null, 2));
  }

  if (args.json) {
    console.log(JSON.stringify({ ...built, writtenPath }, null, 2));
  } else {
    console.log('=== ThumbGate capture payload ===');
    console.log(`signal: ${built.mcp.signal}`);
    console.log(`tags: ${built.mcp.tags.join(', ')}`);
    console.log('--- context ---');
    console.log(built.mcp.context);
    if (writtenPath) console.log(`wrote: ${writtenPath}`);
    console.log('Invoke: mcp__thumbgate__capture_memory_feedback with signal+context above');
  }
  process.exit(0);
}

module.exports = { buildCapture, redact };

if (require.main === module) {
  main();
}
