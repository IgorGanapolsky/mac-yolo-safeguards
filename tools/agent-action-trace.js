#!/usr/bin/env node
'use strict';

/**
 * agent-action-trace.js — Visible end-to-end agent observability.
 *
 * Stolen from Screenpipe's "agent run · visible end to end":
 * "See the trigger, context, decision, and result instead of trusting a
 * black box."
 *
 * Records an immutable audit trail for each agent action:
 *   - trigger: what caused the agent to act (event + source)
 *   - context: which files/patterns were read for context
 *   - decision: the key decision point or branch
 *   - result: what files were changed / what was output
 *
 * Stored as JSONL (append-only, never modified) at:
 *   ~/.mac-yolo-safeguards/harness-router/agent-action-traces.jsonl
 *
 * Usage:
 *   node tools/agent-action-trace.js start    --trigger "github_webhook" --context "plan.md"
 *   node tools/agent-action-trace.js decision --trace-id <id> --decision "chose approach A"
 *   node tools/agent-action-trace.js end      --trace-id <id> --result "files modified, tests pass"
 *   node tools/agent-action-trace.js list     --limit 20 [--json]
 *   node tools/agent-action-trace.js show     --trace-id <id>
 *
 * Usage from scripts/tools:
 *   const { startTrace, recordDecision, endTrace } = require('./agent-action-trace');
 *   const trace = startTrace({ trigger: 'webhook', context: ['plan.md'] });
 *   recordDecision(trace.id, 'chose Approach A over B');
 *   endTrace(trace.id, { changedFiles: ['tools/foo.js'], testResult: 'pass' });
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const TRACE_FILE = path.join(STORAGE_DIR, 'agent-action-traces.jsonl');

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function shortId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readTraces(opts = {}) {
  const file = opts.traceFile || TRACE_FILE;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function appendTrace(entry, opts = {}) {
  const file = opts.traceFile || TRACE_FILE;
  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(entry, null, 0) + '\n');
  return entry;
}

function startTrace(args, opts = {}) {
  const id = shortId('trace');
  const entry = {
    id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'running',
    trigger: args.trigger || 'manual',
    triggerSource: args.triggerSource || null,
    context: args.context || [],
    decisions: [],
    result: null,
    durationMs: null,
  };
  appendTrace(entry, opts);
  return entry;
}

function recordDecision(args, opts = {}) {
  if (!args.traceId) {
    console.error('recordDecision requires --trace-id');
    process.exit(1);
  }
  const traces = readTraces(opts);
  const idx = traces.findIndex((t) => t.id === args.traceId && t.status === 'running');
  if (idx === -1) {
    console.error(`Trace ${args.traceId} not found or already ended`);
    process.exit(1);
  }
  traces[idx].decisions.push({
    at: new Date().toISOString(),
    decision: args.decision,
    detail: args.detail || null,
  });
  rewriteTraces(traces, opts);
  return traces[idx];
}

function endTrace(args, opts = {}) {
  if (!args.traceId) {
    console.error('endTrace requires --trace-id');
    process.exit(1);
  }
  const traces = readTraces(opts);
  const idx = traces.findIndex((t) => t.id === args.traceId && t.status === 'running');
  if (idx === -1) {
    console.error(`Trace ${args.traceId} not found or already ended`);
    process.exit(1);
  }
  const started = Date.parse(traces[idx].startedAt);
  traces[idx].endedAt = new Date().toISOString();
  traces[idx].status = args.status || 'completed';
  traces[idx].result = args.result || null;
  traces[idx].resultFiles = args.resultFiles || [];
  traces[idx].durationMs = Date.now() - started;
  rewriteTraces(traces, opts);
  return traces[idx];
}

function rewriteTraces(traces, opts = {}) {
  const file = opts.traceFile || TRACE_FILE;
  ensureDir(file);
  fs.writeFileSync(file, traces.map((e) => JSON.stringify(e, null, 0)).join('\n') + '\n');
}

function listTraces(args = {}) {
  const traces = readTraces({ traceFile: args.traceFile });
  const limit = args.limit || 20;
  const filtered = traces.slice(-limit).reverse();
  return { traces: filtered, total: traces.length };
}

function showTrace(traceId, opts = {}) {
  const traces = readTraces(opts);
  const found = traces.find((t) => t.id === traceId);
  if (!found) {
    console.error(`Trace ${traceId} not found`);
    process.exit(1);
  }
  return found;
}

function parseArgs(argv) {
  const out = { cmd: 'list', json: false, traceId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--trace-id') out.traceId = argv[++i];
    else if (a === '--trigger') out.trigger = argv[++i];
    else if (a === '--trigger-source') out.triggerSource = argv[++i];
    else if (a === '--context') out.context = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--decision') out.decision = argv[++i];
    else if (a === '--detail') out.detail = argv[++i];
    else if (a === '--result') out.result = argv[++i];
    else if (a === '--result-files') out.resultFiles = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--status') out.status = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (!a.startsWith('-') && !out.cmd) out.cmd = a;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`agent-action-trace — visible end-to-end agent observability

Stolen from Screenpipe: "See the trigger, context, decision, and result
instead of trusting a black box."

Usage:
  node tools/agent-action-trace.js start    --trigger "github_webhook" --context "plan.md,tools/foo.js" [--trigger-source url]
  node tools/agent-action-trace.js decision --trace-id <id> --decision "chose approach A" [--detail "..."]
  node tools/agent-action-trace.js end      --trace-id <id> [--status completed|failed|cancelled] --result "tests pass" [--result-files foo.js,bar.ts]
  node tools/agent-action-trace.js list     [--limit 20] [--json]
  node tools/agent-action-trace.js show     --trace-id <id>

Use in scripts:
  const { startTrace, recordDecision, endTrace } = require('./agent-action-trace');
`);
    return;
  }

  const args = parseArgs(argv);
  let out;

  switch (args.cmd) {
    case 'start':
      out = startTrace(args);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else console.log(`TRACE STARTED: ${out.id} (trigger: ${out.trigger})`);
      break;

    case 'decision':
      out = recordDecision(args);
      if (args.json) console.log(JSON.stringify({ traceId: args.traceId, decisions: out.decisions }, null, 2));
      else console.log(`Decision recorded for trace ${args.traceId} (${out.decisions.length} total)`);
      break;

    case 'end':
      out = endTrace(args);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else console.log(`TRACE ENDED: ${out.id} (status: ${out.status}, duration: ${out.durationMs}ms)`);
      break;

    case 'list':
      out = listTraces(args);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(`Agent action traces (${out.total} total, showing ${out.traces.length}):`);
        for (const t of out.traces) {
          const dur = t.durationMs != null ? `${t.durationMs}ms` : 'running';
          const decs = t.decisions?.length || 0;
          console.log(`  ${t.status === 'running' ? '⚙' : '✓'} ${t.id} | ${t.trigger} | ${dur} | decisions:${decs}`);
        }
      }
      break;

    case 'show':
      out = showTrace(args.traceId);
      if (args.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(`Trace: ${out.id}`);
        console.log(`  Status: ${out.status}`);
        console.log(`  Trigger: ${out.trigger}${out.triggerSource ? ` (${out.triggerSource})` : ''}`);
        console.log(`  Started: ${out.startedAt}`);
        if (out.endedAt) console.log(`  Ended: ${out.endedAt} (${out.durationMs}ms)`);
        console.log(`  Context: ${out.context?.join(', ') || '(none)'}`);
        console.log(`  Decisions (${out.decisions?.length || 0}):`);
        for (const d of out.decisions || []) {
          console.log(`    - [${d.at}] ${d.decision}${d.detail ? ` — ${d.detail}` : ''}`);
        }
        if (out.result) console.log(`  Result: ${out.result}`);
        if (out.resultFiles?.length) console.log(`  Files changed: ${out.resultFiles.join(', ')}`);
      }
      break;

    default:
      console.error(`Unknown command: ${args.cmd}`);
      process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  startTrace,
  recordDecision,
  endTrace,
  listTraces,
  showTrace,
  STORAGE_DIR,
  TRACE_FILE,
  readTraces,
};
