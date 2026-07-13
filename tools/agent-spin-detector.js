#!/usr/bin/env node
/**
 * agent-spin-detector.js
 *
 * Answers: "is this agent doing productive work, or is it spinning and burning
 * tokens?" CPU and token rate cannot tell those apart — a spinning agent looks
 * identical to a working one on both. What separates them is STATE CHANGE.
 *
 * A productive agent keeps changing the world: tool calls, file writes, commits.
 * A spinning agent keeps *talking* — tokens flow, turns advance — but the state
 * delta goes to zero. That divergence, not spend, is the signal.
 *
 * Two distinct failure modes, deliberately separated:
 *
 *   SPINNING  — tokens are being spent but no state changed for the whole window.
 *   LOOPING   — the agent is emitting the same response over and over. It may
 *               even be calling tools, so `spinning` misses it. Repetition of
 *               output is the tell.
 *
 * Reads the LiteLLM traffic log (~/.hermes/litellm-logs/traffic.jsonl), where
 * `has_tool_calls` is the state-change proxy. Read-only. Pure functions are
 * exported so this is portable to any agent harness: feed it
 * {ts, tokens, stateChanges, response} and it does not care where they came from.
 *
 *   node tools/agent-spin-detector.js            # human summary
 *   node tools/agent-spin-detector.js --json
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_LOG = process.env.HERMES_LOG_PATH
  || path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');

// A window shorter than this can't distinguish "thinking hard" from "stuck".
const DEFAULT_WINDOW = Number(process.env.SPIN_WINDOW_CALLS || 6);
// Below this, the agent isn't burning anything worth alerting about.
const DEFAULT_MIN_TOKENS = Number(process.env.SPIN_MIN_TOKENS || 2000);
// How many identical responses before we call it a loop.
const DEFAULT_REPEAT = Number(process.env.SPIN_REPEAT_THRESHOLD || 3);

/** Tolerates truncated/garbage lines — the log is appended to live. */
function parseLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* partial write; skip */ }
  }
  return out;
}

/**
 * Normalize a traffic record into the harness-agnostic event shape.
 * `stateChanges` is the whole ballgame: anything that changed the world.
 */
function toEvent(rec) {
  const toolCalls = rec.has_tool_calls === true || Number(rec.tool_call_count) > 0;
  return {
    // Whether the REQUEST offered tools. A vision call, an embedding, or a plain
    // chat completion never calls a tool — judging those as "spinning" is how a
    // detector cries wolf. Records written before this field existed report
    // undefined, and are excluded rather than guessed at.
    toolCapable: rec.tools_offered === true
      || (rec.tools_offered === undefined && toolCalls ? true : rec.tools_offered),
    ts: rec.ts_end || rec.ts || null,
    tokens: Number(rec.total_tokens) || 0,
    // Callers with richer telemetry (file writes, commits) add them here.
    stateChanges: (toolCalls ? 1 : 0)
      + (Number(rec.files_changed) || 0)
      + (Number(rec.commits) || 0),
    response: typeof rec.response === 'string' ? rec.response : '',
    status: rec.status || 'unknown',
  };
}

/** Longest run of identical, non-empty responses anywhere in the window. */
function maxRepeatRun(events) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const e of events) {
    const key = e.response.trim();
    if (key && key === prev) { run += 1; } else { run = 1; prev = key || null; }
    if (key) best = Math.max(best, run);
  }
  return best;
}

/**
 * The verdict. Returns a reason string rather than a bare boolean so an
 * operator can see *why* without re-deriving it.
 */
function detectSpin(events, opts = {}) {
  const window = opts.window || DEFAULT_WINDOW;
  const minTokens = opts.minTokens != null ? opts.minTokens : DEFAULT_MIN_TOKENS;
  const repeatThreshold = opts.repeatThreshold || DEFAULT_REPEAT;

  // Only agentic calls are evaluable. Everything else is not evidence either way.
  const evaluable = events.filter((e) => e.toolCapable === true);
  const recent = evaluable.slice(-window);
  const tokens = recent.reduce((n, e) => n + e.tokens, 0);
  const stateChanges = recent.reduce((n, e) => n + e.stateChanges, 0);
  const repeats = maxRepeatRun(recent);

  const base = { calls: recent.length, tokens, stateChanges, repeats, window };

  // Not enough evidence yet. Saying "healthy" here would be a lie.
  if (recent.length < window) {
    return {
      ...base,
      verdict: 'unknown',
      reason: `only ${recent.length}/${window} tool-capable calls observed`
        + ` (${events.length - evaluable.length} non-agentic calls ignored)`,
    };
  }
  // Looping is checked first: a looping agent may still call tools every turn,
  // so the spinning test below would clear it.
  if (repeats >= repeatThreshold) {
    return { ...base, verdict: 'looping', reason: `same response ${repeats}x in a row` };
  }
  if (tokens < minTokens) {
    return { ...base, verdict: 'idle', reason: `only ${tokens} tokens in last ${window} calls` };
  }
  if (stateChanges === 0) {
    return {
      ...base,
      verdict: 'spinning',
      reason: `${tokens} tokens across ${window} calls with zero state changes`,
    };
  }
  return { ...base, verdict: 'productive', reason: `${stateChanges} state change(s) in last ${window} calls` };
}

function main(argv) {
  const asJson = argv.includes('--json');
  const logPath = DEFAULT_LOG;
  if (!fs.existsSync(logPath)) {
    const msg = { verdict: 'unknown', reason: `no traffic log at ${logPath}` };
    console.log(asJson ? JSON.stringify(msg) : `unknown: ${msg.reason}`);
    return 0;
  }
  const events = parseLines(fs.readFileSync(logPath, 'utf8')).map(toEvent);
  const result = detectSpin(events);

  if (asJson) {
    console.log(JSON.stringify({ ...result, logPath, totalEvents: events.length }, null, 2));
  } else {
    console.log(`${result.verdict.toUpperCase()}: ${result.reason}`);
    console.log(`  window=${result.window} calls  tokens=${result.tokens}  stateChanges=${result.stateChanges}  maxRepeat=${result.repeats}`);
  }
  // Exit non-zero on the two states worth waking someone for.
  return (result.verdict === 'spinning' || result.verdict === 'looping') ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parseLines, toEvent, maxRepeatRun, detectSpin };
