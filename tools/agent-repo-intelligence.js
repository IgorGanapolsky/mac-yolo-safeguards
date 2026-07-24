#!/usr/bin/env node
'use strict';

/**
 * High-ROI local "repo intelligence" for coding agents (JetBrains Context-class job).
 *
 * Why: agents thrash on multi-agent megafiles by re-exploring with rg/read.
 * This tool returns a compact subgraph + field-guide surprises so the next
 * turn can act instead of re-discovering architecture.
 *
 * Does NOT send source to third-party servers (unlike cloud indexes).
 *
 * Usage:
 *   node tools/agent-repo-intelligence.js "why pair.json expires"
 *   node tools/agent-repo-intelligence.js --json "manual Tailscale connect"
 *   node tools/agent-repo-intelligence.js --path A B
 *   node tools/agent-repo-intelligence.js --status
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const GRAPHIFY = path.join(REPO, '.graphify-venv', 'bin', 'graphify');
const GRAPH_JSON = path.join(REPO, 'graphify-out', 'graph.json');
const FIELD_GUIDE = path.join(REPO, 'docs', 'agent-field-guide', 'index.md');

function hasGraphify() {
  return fs.existsSync(GRAPHIFY) && fs.existsSync(GRAPH_JSON);
}

function runGraphify(args, timeoutMs = 60_000) {
  if (!hasGraphify()) {
    return {
      ok: false,
      error: 'graphify not ready (missing .graphify-venv/bin/graphify or graphify-out/graph.json)',
    };
  }
  const r = spawnSync(GRAPHIFY, args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error) {
    return { ok: false, error: r.error.message };
  }
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) {
    return { ok: false, error: err || out || `graphify exit ${r.status}`, status: r.status };
  }
  return { ok: true, output: out, stderr: err || undefined };
}

function readFieldGuide(maxLines = 40) {
  if (!fs.existsSync(FIELD_GUIDE)) {
    return { ok: false, error: 'docs/agent-field-guide/index.md missing' };
  }
  const lines = fs.readFileSync(FIELD_GUIDE, 'utf8').split(/\r?\n/);
  return {
    ok: true,
    path: 'docs/agent-field-guide/index.md',
    lines: lines.slice(0, maxLines),
    totalLines: lines.length,
  };
}

function status() {
  let graphNodes = null;
  let graphEdges = null;
  if (fs.existsSync(GRAPH_JSON)) {
    try {
      const g = JSON.parse(fs.readFileSync(GRAPH_JSON, 'utf8'));
      graphNodes = Array.isArray(g.nodes) ? g.nodes.length : g.nodeCount ?? null;
      graphEdges = Array.isArray(g.edges) ? g.edges.length : g.edgeCount ?? null;
    } catch {
      graphNodes = 'parse_error';
    }
  }
  return {
    graphifyBinary: fs.existsSync(GRAPHIFY),
    graphJson: fs.existsSync(GRAPH_JSON),
    graphNodes,
    graphEdges,
    fieldGuide: fs.existsSync(FIELD_GUIDE),
    jetbrainsContextCli: Boolean(spawnSync('which', ['jbcontext'], { encoding: 'utf8' }).stdout?.trim()),
    note:
      'JetBrains Context (jbcontext) is optional SaaS; this tool is the in-repo high-ROI substitute using graphify + field guide.',
  };
}

function query(question) {
  const g = runGraphify(['query', question]);
  const guide = readFieldGuide(30);
  return {
    question,
    graphify: g,
    fieldGuide: guide.ok
      ? { path: guide.path, preview: guide.lines.join('\n'), totalLines: guide.totalLines }
      : guide,
    nextSteps: [
      'If graphify.ok, act on those paths first — do not re-sweep the whole tree.',
      'If graphify fails, use targeted rg + read AGENTS.md / plan.md claims.',
      'After edits, when graph.json exists: .graphify-venv/bin/graphify update .',
    ],
  };
}

function pathQuery(a, b) {
  return {
    from: a,
    to: b,
    graphify: runGraphify(['path', a, b]),
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const filtered = args.filter((a) => a !== '--json');

  let result;
  if (filtered[0] === '--status' || filtered.length === 0) {
    result = status();
  } else if (filtered[0] === '--path' && filtered.length >= 3) {
    result = pathQuery(filtered[1], filtered[2]);
  } else if (filtered[0] === '--update') {
    result = runGraphify(['update', '.']);
  } else {
    const q = filtered.join(' ').trim();
    result = query(q);
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.graphifyBinary !== undefined) {
    // status
    console.log('Agent repo intelligence status');
    console.log(`  graphify binary: ${result.graphifyBinary}`);
    console.log(`  graph.json: ${result.graphJson} (nodes=${result.graphNodes}, edges=${result.graphEdges})`);
    console.log(`  field guide: ${result.fieldGuide}`);
    console.log(`  jbcontext CLI: ${result.jetbrainsContextCli}`);
    console.log(`  note: ${result.note}`);
    return;
  }

  if (result.question) {
    console.log(`# Query: ${result.question}\n`);
    if (result.graphify.ok) {
      console.log('## graphify\n');
      console.log(result.graphify.output);
    } else {
      console.log('## graphify\n');
      console.log(`FAILED: ${result.graphify.error}`);
    }
    if (result.fieldGuide?.preview) {
      console.log('\n## field guide (preview)\n');
      console.log(result.fieldGuide.preview);
    }
    console.log('\n## next\n');
    for (const s of result.nextSteps) console.log(`- ${s}`);
    return;
  }

  if (result.from) {
    console.log(`# Path ${result.from} → ${result.to}\n`);
    if (result.graphify.ok) console.log(result.graphify.output);
    else console.log(`FAILED: ${result.graphify.error}`);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
