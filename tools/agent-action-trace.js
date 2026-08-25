#!/usr/bin/env node
'use strict';

/**
 * Append-only agent action observability.
 *
 * Each lifecycle transition is a new JSONL event. Existing v1 snapshot lines
 * remain readable, but this implementation never rewrites earlier bytes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const TRACE_FILE = path.join(STORAGE_DIR, 'agent-action-traces.jsonl');
const EVENT_SCHEMA = 'agent-action-trace-event/v2';

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function shortId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLines(opts = {}) {
  const file = opts.traceFile || TRACE_FILE;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function appendEvent(event, opts = {}) {
  const file = opts.traceFile || TRACE_FILE;
  ensureDir(file);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

function emptyTrace(id, at) {
  return {
    id,
    startedAt: at || null,
    endedAt: null,
    status: 'running',
    trigger: 'manual',
    triggerSource: null,
    context: [],
    decisions: [],
    result: null,
    resultFiles: [],
    durationMs: null,
  };
}

function applyEvent(state, event) {
  const id = event.traceId || event.id;
  if (!id) return state;
  const current = state.get(id) || emptyTrace(id, event.at);

  if (!event.event && event.id) {
    // Legacy v1 snapshot. A later v2 event for the same trace can extend it.
    state.set(id, {
      ...emptyTrace(id, event.startedAt),
      ...event,
      decisions: Array.isArray(event.decisions) ? event.decisions : [],
      resultFiles: Array.isArray(event.resultFiles) ? event.resultFiles : [],
    });
    return state;
  }

  if (event.event === 'start') {
    state.set(id, {
      ...emptyTrace(id, event.at),
      trigger: event.trigger || 'manual',
      triggerSource: event.triggerSource || null,
      context: Array.isArray(event.context) ? event.context : [],
    });
  } else if (event.event === 'decision') {
    current.decisions.push({
      at: event.at,
      decision: event.decision,
      detail: event.detail || null,
    });
    state.set(id, current);
  } else if (event.event === 'end') {
    current.endedAt = event.at;
    current.status = event.status || 'completed';
    current.result = event.result || null;
    current.resultFiles = Array.isArray(event.resultFiles) ? event.resultFiles : [];
    current.durationMs = Number.isFinite(event.durationMs)
      ? event.durationMs
      : Math.max(0, Date.parse(event.at) - Date.parse(current.startedAt));
    state.set(id, current);
  }
  return state;
}

function readTraces(opts = {}) {
  const state = readLines(opts).reduce(applyEvent, new Map());
  return [...state.values()].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
}

function startTrace(args = {}, opts = {}) {
  const id = shortId('trace');
  const at = new Date().toISOString();
  appendEvent({
    schema: EVENT_SCHEMA,
    event: 'start',
    traceId: id,
    at,
    trigger: args.trigger || 'manual',
    triggerSource: args.triggerSource || null,
    context: args.context || [],
  }, opts);
  return showTrace(id, opts);
}

function requireRunning(traceId, opts) {
  const trace = readTraces(opts).find((item) => item.id === traceId);
  if (!trace || trace.status !== 'running') {
    console.error(`Trace ${traceId} not found or already ended`);
    process.exit(1);
  }
  return trace;
}

function recordDecision(args, opts = {}) {
  if (!args.traceId) {
    console.error('recordDecision requires --trace-id');
    process.exit(1);
  }
  requireRunning(args.traceId, opts);
  appendEvent({
    schema: EVENT_SCHEMA,
    event: 'decision',
    traceId: args.traceId,
    at: new Date().toISOString(),
    decision: args.decision,
    detail: args.detail || null,
  }, opts);
  return showTrace(args.traceId, opts);
}

function endTrace(args, opts = {}) {
  if (!args.traceId) {
    console.error('endTrace requires --trace-id');
    process.exit(1);
  }
  const trace = requireRunning(args.traceId, opts);
  const at = new Date().toISOString();
  appendEvent({
    schema: EVENT_SCHEMA,
    event: 'end',
    traceId: args.traceId,
    at,
    status: args.status || 'completed',
    result: args.result || null,
    resultFiles: args.resultFiles || [],
    durationMs: Math.max(0, Date.parse(at) - Date.parse(trace.startedAt)),
  }, opts);
  return showTrace(args.traceId, opts);
}

function listTraces(args = {}) {
  const traces = readTraces({ traceFile: args.traceFile });
  const limit = args.limit || 20;
  return { traces: traces.slice(-limit).reverse(), total: traces.length };
}

function showTrace(traceId, opts = {}) {
  const found = readTraces(opts).find((trace) => trace.id === traceId);
  if (!found) {
    console.error(`Trace ${traceId} not found`);
    process.exit(1);
  }
  return found;
}

function parseArgs(argv) {
  const out = { cmd: null, json: false, traceId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') out.json = true;
    else if (arg === '--trace-id') out.traceId = argv[++index];
    else if (arg === '--trigger') out.trigger = argv[++index];
    else if (arg === '--trigger-source') out.triggerSource = argv[++index];
    else if (arg === '--context') out.context = (argv[++index] || '').split(',').map((item) => item.trim()).filter(Boolean);
    else if (arg === '--decision') out.decision = argv[++index];
    else if (arg === '--detail') out.detail = argv[++index];
    else if (arg === '--result') out.result = argv[++index];
    else if (arg === '--result-files') out.resultFiles = (argv[++index] || '').split(',').map((item) => item.trim()).filter(Boolean);
    else if (arg === '--status') out.status = argv[++index];
    else if (arg === '--limit') out.limit = Number.parseInt(argv[++index], 10);
    else if (!arg.startsWith('-') && !out.cmd) out.cmd = arg;
  }
  out.cmd ||= 'list';
  return out;
}

function renderTrace(trace) {
  const lines = [
    `Trace: ${trace.id}`,
    `  Status: ${trace.status}`,
    `  Trigger: ${trace.trigger}${trace.triggerSource ? ` (${trace.triggerSource})` : ''}`,
    `  Started: ${trace.startedAt}`,
  ];
  if (trace.endedAt) lines.push(`  Ended: ${trace.endedAt} (${trace.durationMs}ms)`);
  lines.push(`  Context: ${trace.context?.join(', ') || '(none)'}`);
  lines.push(`  Decisions (${trace.decisions?.length || 0}):`);
  for (const decision of trace.decisions || []) {
    lines.push(`    - [${decision.at}] ${decision.decision}${decision.detail ? ` — ${decision.detail}` : ''}`);
  }
  if (trace.result) lines.push(`  Result: ${trace.result}`);
  if (trace.resultFiles?.length) lines.push(`  Files changed: ${trace.resultFiles.join(', ')}`);
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log('agent-action-trace start|decision|end|list|show [options]');
    return;
  }
  const args = parseArgs(argv);
  let output;
  if (args.cmd === 'start') output = startTrace(args);
  else if (args.cmd === 'decision') output = recordDecision(args);
  else if (args.cmd === 'end') output = endTrace(args);
  else if (args.cmd === 'list') output = listTraces(args);
  else if (args.cmd === 'show') output = showTrace(args.traceId);
  else {
    console.error(`Unknown command: ${args.cmd}`);
    process.exit(1);
  }

  if (args.json) console.log(JSON.stringify(output, null, 2));
  else if (args.cmd === 'list') {
    console.log(`Agent action traces (${output.total} total, showing ${output.traces.length}):`);
    for (const trace of output.traces) console.log(`  ${trace.status === 'running' ? '⚙' : '✓'} ${trace.id} | ${trace.trigger}`);
  } else console.log(renderTrace(output));
}

if (require.main === module) main();

module.exports = {
  EVENT_SCHEMA,
  STORAGE_DIR,
  TRACE_FILE,
  endTrace,
  listTraces,
  parseArgs,
  readLines,
  readTraces,
  recordDecision,
  showTrace,
  startTrace,
};
