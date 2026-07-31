#!/usr/bin/env node
'use strict';

/**
 * durable-agent-loop.js — idempotent, checkpointed, watchdog-bounded agent loops.
 *
 * Inspired by DBOS Transact (idempotency keys + durable tables) and the delta-pipeline
 * micro-batch case study (bounded loops with watchdog restarts).
 *
 * Usage:
 *   node tools/durable-agent-loop.js --run --interval 30000 --max-ticks 10
 *
 * As a library:
 *   const { DurableAgentLoop } = require('./tools/durable-agent-loop');
 *   const loop = new DurableAgentLoop({ name: 'revenue', workFn, statePath: '/tmp/state.jsonl' });
 *   loop.start();
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_OPTIONS = {
  name: 'durable-agent-loop',
  statePath: '',
  intervalMs: 30_000,
  maxTicks: Infinity,
  maxFailuresPerWindow: 3,
  failureWindowTicks: 5,
  watchdogTimeoutMs: 120_000,
  retryDelayMs: 5_000,
  idempotencyNamespace: 'durable-agent',
};

function parseArgs(argv) {
  const args = {
    run: false,
    name: DEFAULT_OPTIONS.name,
    interval: DEFAULT_OPTIONS.intervalMs,
    'max-ticks': DEFAULT_OPTIONS.maxTicks,
    stateDir: '',
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') args.run = true;
    else if (arg === '--name') args.name = argv[++i] || args.name;
    else if (arg === '--interval') args.interval = parseInt(argv[++i], 10) || args.interval;
    else if (arg === '--max-ticks') args['max-ticks'] = parseInt(argv[++i], 10) || args['max-ticks'];
    else if (arg === '--state-dir') args.stateDir = argv[++i] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function defaultStatePath(name) {
  const tmp = process.env.TMPDIR || '/tmp';
  return path.join(tmp, `durable-agent-loop-${name}.jsonl`);
}

function nowIso() {
  return new Date().toISOString();
}

class DurableAgentLoop {
  constructor(options = {}) {
    this.name = options.name || DEFAULT_OPTIONS.name;
    this.workFn = options.workFn || null;
    this.statePath = options.statePath || defaultStatePath(this.name);
    this.intervalMs = options.intervalMs ?? DEFAULT_OPTIONS.intervalMs;
    this.maxTicks = options.maxTicks ?? DEFAULT_OPTIONS.maxTicks;
    this.maxFailuresPerWindow = options.maxFailuresPerWindow ?? DEFAULT_OPTIONS.maxFailuresPerWindow;
    this.failureWindowTicks = options.failureWindowTicks ?? DEFAULT_OPTIONS.failureWindowTicks;
    this.watchdogTimeoutMs = options.watchdogTimeoutMs ?? DEFAULT_OPTIONS.watchdogTimeoutMs;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_OPTIONS.retryDelayMs;
    this.idempotencyNamespace = options.idempotencyNamespace || DEFAULT_OPTIONS.idempotencyNamespace;

    this.ticks = 0;
    this.failures = 0;
    this.successes = 0;
    this.skipped = 0;
    this.running = false;
    this.timer = null;
    this.watchdogTimer = null;
    this.lastTickAt = 0;
    this.lastResult = null;
    this.failureHistory = []; // timestamps of recent failures

    if (this.statePath) {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  _appendState(record) {
    if (!this.statePath) return;
    const line = JSON.stringify(record) + '\n';
    try {
      fs.appendFileSync(this.statePath, line, 'utf8');
    } catch {
      // durable execution should not crash because of logging
    }
  }

  _readLatestCheckpoint() {
    if (!this.statePath || !fs.existsSync(this.statePath)) return null;
    try {
      const lines = fs.readFileSync(this.statePath, 'utf8').trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const rec = JSON.parse(lines[i]);
        if (rec.type === 'checkpoint') return rec;
      }
    } catch {
      return null;
    }
    return null;
  }

  makeIdempotencyKey(tick) {
    return `${this.idempotencyNamespace}:${this.name}:tick:${tick}`;
  }

  shouldSkipDuplicate(key, state = this._readLatestCheckpoint()) {
    if (!state || !state.completedKeys) return false;
    return state.completedKeys.includes(key);
  }

  _recordFailure(error) {
    this.failures += 1;
    const ts = Date.now();
    this.failureHistory.push(ts);
    const cutoff = ts - this.failureWindowTicks * this.intervalMs;
    this.failureHistory = this.failureHistory.filter((t) => t >= cutoff);
  }

  failureRateExceeded() {
    return this.failureHistory.length > this.maxFailuresPerWindow;
  }

  async executeWork(tickIndex) {
    if (!this.workFn) {
      return { status: 'noop', message: 'no workFn configured' };
    }
    const key = this.makeIdempotencyKey(tickIndex);
    if (this.shouldSkipDuplicate(key)) {
      this.skipped += 1;
      return { status: 'skipped', idempotencyKey: key, reason: 'already completed' };
    }
    const result = await this.workFn({
      tick: tickIndex,
      idempotencyKey: key,
      name: this.name,
    });
    return { status: 'ok', idempotencyKey: key, result };
  }

  async tick() {
    const tickIndex = this.ticks;
    this.ticks += 1;
    this.lastTickAt = Date.now();
    const checkpoint = this._readLatestCheckpoint() || { completedKeys: [] };
    const key = this.makeIdempotencyKey(tickIndex);
    let outcome;
    try {
      outcome = await this.executeWork(tickIndex);
      if (outcome.status === 'ok') {
        this.successes += 1;
        checkpoint.completedKeys = [...new Set([...checkpoint.completedKeys, key])].slice(-1000);
      }
    } catch (error) {
      this._recordFailure(error);
      outcome = { status: 'error', error: error.message || String(error), idempotencyKey: key };
    }

    this._appendState({
      type: 'checkpoint',
      ts: nowIso(),
      name: this.name,
      tick: tickIndex,
      outcome,
      completedKeys: checkpoint.completedKeys,
      stats: this.stats(),
    });

    this.lastResult = outcome;
    return outcome;
  }

  stats() {
    return {
      name: this.name,
      ticks: this.ticks,
      successes: this.successes,
      failures: this.failures,
      skipped: this.skipped,
      failureRateExceeded: this.failureRateExceeded(),
      lastTickAt: this.lastTickAt,
    };
  }

  _watchdog() {
    if (!this.running) return;
    const elapsed = Date.now() - this.lastTickAt;
    if (elapsed > this.watchdogTimeoutMs) {
      this._appendState({
        type: 'watchdog',
        ts: nowIso(),
        name: this.name,
        elapsed,
        action: 'restart',
      });
      this.stop();
      this.start();
      return;
    }
    this.watchdogTimer = setTimeout(() => this._watchdog(), Math.min(5_000, this.watchdogTimeoutMs));
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = Date.now();

    const cp = this._readLatestCheckpoint();
    if (cp && typeof cp.tick === 'number') {
      this.ticks = cp.tick + 1;
      this.successes = cp.stats?.successes ?? 0;
      this.failures = cp.stats?.failures ?? 0;
      this.skipped = cp.stats?.skipped ?? 0;
    }

    this._appendState({ type: 'start', ts: nowIso(), name: this.name, tick: this.ticks });

    const loop = async () => {
      if (!this.running) return;
      if (this.ticks >= this.maxTicks) {
        this.stop();
        return;
      }
      if (this.failureRateExceeded()) {
        this._appendState({
          type: 'circuit-open',
          ts: nowIso(),
          name: this.name,
          reason: `>${this.maxFailuresPerWindow} failures in ${this.failureWindowTicks} ticks`,
        });
        this.stop();
        return;
      }

      const start = Date.now();
      await this.tick();
      const duration = Date.now() - start;
      const delay = Math.max(0, this.intervalMs - duration);
      this.timer = setTimeout(loop, delay);
    };

    this.watchdogTimer = setTimeout(() => this._watchdog(), Math.min(5_000, this.watchdogTimeoutMs));
    loop();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this._appendState({ type: 'stop', ts: nowIso(), name: this.name, stats: this.stats() });
  }
}

async function demoWork({ tick }) {
  // deterministic enough for demo/tests
  if (tick === 0) throw new Error('simulated recoverable failure');
  return { processed: tick, at: nowIso() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/durable-agent-loop.js --run [options]

Options:
  --run                Start a demo loop.
  --name TEXT          Loop name (used in state file).
  --interval MS        Tick interval in ms (default 30000).
  --max-ticks N        Stop after N ticks.
  --state-dir DIR      Directory for durable state files.
  --json               Print stats as JSON on exit.
  --help               Show this help.`);
    process.exit(0);
  }

  if (!args.run) {
    console.log('Pass --run to start a demo durable loop.');
    process.exit(0);
  }

  const statePath = args.stateDir
    ? path.join(args.stateDir, `durable-agent-loop-${args.name}.jsonl`)
    : defaultStatePath(args.name);

  const loop = new DurableAgentLoop({
    name: args.name,
    statePath,
    intervalMs: args.interval,
    maxTicks: args['max-ticks'],
    workFn: demoWork,
  });

  process.on('SIGINT', () => loop.stop());
  process.on('SIGTERM', () => loop.stop());

  await loop.start();
  while (loop.running) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const stats = loop.stats();
  if (args.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(`Durable loop finished: ticks=${stats.ticks} ok=${stats.successes} skipped=${stats.skipped} failures=${stats.failures}`);
  }
}

module.exports = {
  DurableAgentLoop,
  defaultStatePath,
  parseArgs,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
