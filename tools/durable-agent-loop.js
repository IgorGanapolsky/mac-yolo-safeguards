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
    this._abortController = null;
    this._tickPromise = null;

    if (this.statePath) {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  _appendState(record) {
    if (!this.statePath) return;
    const line = JSON.stringify(record) + '\n';
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Fail closed if statePath is a directory or otherwise non-file.
    try {
      const st = fs.lstatSync(this.statePath);
      if (!st.isFile()) {
        throw new Error(`statePath is not a regular file: ${this.statePath}`);
      }
    } catch (lstatErr) {
      if (lstatErr.code !== 'ENOENT') {
        throw new Error(`Checkpoint persistence failed for ${this.statePath}: ${lstatErr.message}`);
      }
    }

    const mode = fs.existsSync(this.statePath) ? 'a' : 'w';
    let fd;
    try {
      fd = fs.openSync(this.statePath, mode, 0o600);
    } catch (openErr) {
      throw new Error(`Checkpoint persistence failed for ${this.statePath}: ${openErr.message}`);
    }
    try {
      fs.appendFileSync(fd, line, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch (err) {
      try { fs.closeSync(fd); } catch {}
      throw new Error(`Checkpoint persistence failed for ${this.statePath}: ${err.message}`);
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
  }

  failureRateExceeded() {
    // Allow a small window to fill so rapid ticks don't all fall outside it.
    // A failure counts if it occurred within the most recent failureWindowTicks.
    const recentCount = this.failureHistory.length;
    return recentCount > Math.max(0, this.maxFailuresPerWindow);
  }

  async executeWork(tickIndex, signal) {
    if (!this.workFn) {
      return { status: 'noop', message: 'no workFn configured' };
    }
    const key = this.makeIdempotencyKey(tickIndex);
    if (this.shouldSkipDuplicate(key)) {
      this.skipped += 1;
      return { status: 'skipped', idempotencyKey: key, reason: 'already completed' };
    }
    if (signal?.aborted) {
      throw Object.assign(new Error('tick aborted by watchdog'), { name: 'AbortError' });
    }
    const result = await this.workFn({
      tick: tickIndex,
      idempotencyKey: key,
      name: this.name,
      signal,
    });
    if (signal?.aborted) {
      throw Object.assign(new Error('tick aborted by watchdog'), { name: 'AbortError' });
    }
    return { status: 'ok', idempotencyKey: key, result };
  }

  async tick() {
    const tickIndex = this.ticks;
    this.ticks += 1;
    this.lastTickAt = Date.now();
    const checkpoint = this._readLatestCheckpoint() || { completedKeys: [] };
    const key = this.makeIdempotencyKey(tickIndex);
    let outcome;
    const signal = this._abortController?.signal;
    try {
      outcome = await this.executeWork(tickIndex, signal);
      if (signal?.aborted) {
        throw Object.assign(new Error('tick aborted by watchdog'), { name: 'AbortError' });
      }
      if (outcome.status === 'ok') {
        this.successes += 1;
        checkpoint.completedKeys = [...new Set([...checkpoint.completedKeys, key])].slice(-1000);
      }
    } catch (error) {
      this._recordFailure(error);
      outcome = { status: 'error', error: error.message || String(error), idempotencyKey: key };
    }

    // Persist a sentinel for aborted ticks so recovery can detect the cancellation,
    // but do not mark the key completed so the work can be retried.
    if (outcome.status === 'error' && /tick aborted by watchdog|aborted/i.test(outcome.error)) {
      this._appendState({
        type: 'aborted',
        ts: nowIso(),
        name: this.name,
        tick: tickIndex,
        idempotencyKey: key,
        stats: this.stats(),
      });
      this.lastResult = outcome;
      return outcome;
    }

    try {
      this._appendState({
        type: 'checkpoint',
        ts: nowIso(),
        name: this.name,
        tick: tickIndex,
        outcome,
        completedKeys: checkpoint.completedKeys,
        stats: this.stats(),
      });
    } catch (appendErr) {
      // Checkpoint failure is a loop failure; stop so side effects are not repeated.
      this._recordFailure(appendErr);
      this.stop();
      throw appendErr;
    }

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

  async _watchdog() {
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
      // Abort in-flight work and stop. Caller is responsible for restart.
      if (this._abortController) {
        this._abortController.abort();
      }
      this.stop();
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

    const scheduleNext = () => {
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
      this.timer = setTimeout(runTick, this.intervalMs);
    };

    const runTick = async () => {
      if (!this.running) return;
      const controller = new AbortController();
      this._abortController = controller;
      const tickPromise = this.tick();
      this._tickPromise = tickPromise;
      try {
        await tickPromise;
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.stop();
          throw err;
        }
        // Watchdog triggered abort; loop already stopped. Do not schedule more work.
        return;
      } finally {
        if (this._tickPromise === tickPromise) {
          this._tickPromise = null;
        }
        if (this._abortController === controller) {
          this._abortController = null;
        }
      }
      scheduleNext();
    };

    this.watchdogTimer = setTimeout(() => this._watchdog(), Math.min(5_000, this.watchdogTimeoutMs));
    runTick();
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
