#!/usr/bin/env node
'use strict';

/**
 * agent-loop-guard.js — Detect when agents are stuck in repetitive
 * tool-call cycles (the #1 failure mode from the LangChain4j self-building
 * agent experiment: gpt-4o entered a tool-calling loop and hit 100 invocations).
 *
 * This wraps any agent command and watches its JSON/structured output for
 * repeated identical tool calls. If the same tool+args repeat N times
 * consecutively, it kills the process and reports the loop.
 *
 * Usage:
 *   node tools/agent-loop-guard.js --max-repeat 5 -- node tools/some-agent.js
 *   node tools/agent-loop-guard.js --max-repeat 5 --max-total 50 -- hermes-yolo "task"
 *
 * Exit codes:
 *   0  = process completed normally
 *   1  = loop detected (summary printed to stderr)
 *   2  = max-total invocations exceeded
 *
 * Or use as a library:
 *   const { LoopGuard } = require('./agent-loop-guard');
 *   const guard = new LoopGuard({ maxRepeat: 5 });
 *   guard.observe(toolName, args);  // returns { loop: true, count: N } if looped
 */

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_MAX_REPEAT = 5;
const DEFAULT_MAX_TOTAL = 100;

class LoopGuard {
  constructor(opts = {}) {
    this.maxRepeat = opts.maxRepeat || DEFAULT_MAX_REPEAT;
    this.maxTotal = opts.maxTotal || DEFAULT_MAX_TOTAL;
    this.history = [];
    this.lastKey = null;
    this.repeatCount = 0;
  }

  observe(toolName, args) {
    const key = `${toolName}:${JSON.stringify(args || {})}`;
    this.history.push({ tool: toolName, args, ts: Date.now() });

    if (key === this.lastKey) {
      this.repeatCount++;
    } else {
      this.lastKey = key;
      this.repeatCount = 1;
    }

    if (this.repeatCount >= this.maxRepeat) {
      return {
        loop: true,
        type: 'repeat',
        tool: toolName,
        count: this.repeatCount,
        message: `Tool "${toolName}" called ${this.repeatCount} times consecutively with identical args`,
      };
    }

    if (this.history.length >= this.maxTotal) {
      return {
        loop: true,
        type: 'total',
        count: this.history.length,
        message: `Exceeded max total tool invocations (${this.maxTotal})`,
      };
    }

    return { loop: false, totalCalls: this.history.length };
  }

  summary() {
    const toolCounts = {};
    for (const entry of this.history) {
      toolCounts[entry.tool] = (toolCounts[entry.tool] || 0) + 1;
    }
    return {
      totalCalls: this.history.length,
      toolCounts,
      uniqueTools: Object.keys(toolCounts).length,
      durationMs: this.history.length > 0
        ? this.history[this.history.length - 1].ts - this.history[0].ts
        : 0,
    };
  }
}

function parseArgs(argv) {
  const opts = { maxRepeat: DEFAULT_MAX_REPEAT, maxTotal: DEFAULT_MAX_TOTAL };
  const cmd = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--max-repeat') { opts.maxRepeat = parseInt(argv[++i]); i++; continue; }
    if (a === '--max-total') { opts.maxTotal = parseInt(argv[++i]); i++; continue; }
    if (a === '--') { cmd.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) { i++; continue; }
    cmd.push(a);
    i++;
  }
  return { opts, cmd };
}

function main() {
  const { opts, cmd } = parseArgs(process.argv.slice(2));
  if (cmd.length === 0) {
    process.stderr.write('Usage: agent-loop-guard.js [--max-repeat N] [--max-total N] -- <command>\n');
    process.exit(1);
  }

  const guard = new LoopGuard(opts);
  const child = spawn(cmd[0], cmd.slice(1), {
    stdio: ['inherit', 'pipe', 'inherit'],
    env: process.env,
  });

  let buffer = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      checkLine(line, guard, child);
    }
  });

  child.on('close', (code) => {
    const s = guard.summary();
    if (s.totalCalls > 0) {
      process.stderr.write(`\n[loop-guard] ${s.totalCalls} tool calls, ${s.uniqueTools} unique tools, ${s.durationMs}ms\n`);
    }
    process.exit(code || 0);
  });
}

function checkLine(line, guard, child) {
  try {
    const msg = JSON.parse(line);
    if (!msg.tool && !msg.function_call && !msg.tool_calls) return;
    const toolName = msg.tool || msg.function_call?.name || msg.tool_calls?.[0]?.function?.name;
    if (!toolName) return;
    const toolArgs = msg.arguments || msg.function_call?.arguments || msg.tool_calls?.[0]?.function?.arguments;
    const result = guard.observe(toolName, toolArgs);
    if (result.loop) {
      process.stderr.write(`\n[loop-guard] LOOP DETECTED: ${result.message}\n`);
      process.stderr.write(`[loop-guard] Summary: ${JSON.stringify(guard.summary())}\n`);
      child.kill('SIGTERM');
      setTimeout(() => process.exit(1), 100);
    }
  } catch { /* not JSON */ }
}

module.exports = { LoopGuard, DEFAULT_MAX_REPEAT, DEFAULT_MAX_TOTAL };
module.exports.parseArgs = parseArgs;

if (require.main === module) {
  main();
}
