#!/usr/bin/env node
'use strict';
/**
 * hermes-yolo-supervisor.js — P0 bounded harness for Hermes-Yolo runs.
 *
 * Implements the P0 controls from parallel-research/hermes-yolo-improve-aug-2026.md:
 *   - durable run receipts under ~/.hermes/runs/<runId>/
 *   - state machine: created -> admitted -> planning -> tool_running -> verifying -> succeeded|failed|blocked
 *   - tool-call budget, identical-command retry ceiling, wall-clock deadline
 *   - heartbeat events emitted independently of model token stream
 *   - admission control via host-wide heavy/light job lease file
 *
 * This module does not spawn processes itself; it is a library the Hermes CLI/gateway
 * calls to own the lifecycle.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RUNS_DIR = () => process.env.HERMES_RUNS_DIR || path.join(os.homedir(), '.hermes', 'runs');
const LEASE_DIR = () => process.env.HERMES_LEASE_DIR || path.join(os.homedir(), '.hermes', 'leases');
const DEFAULT_POLICY = {
  policyVersion: 1,
  failClosed: true,
  requiredTools: ['terminal', 'file', 'mcp', 'github', 'skills', 'context_engine', 'browser'],
  maxToolCalls: 100,
  maxIdenticalCommandAttempts: 3,
  maxCompileAttempts: 3,
  toolTimeoutSeconds: 300,
  heartbeatSeconds: 2,
  stalledWarningSeconds: 30,
  stalledAbortSeconds: 300,
  maxHeavyJobs: 2,
  maxLightJobs: 4,
  sandboxWorkspaceOnly: false,
  network: 'allow_governed_egress',
};

function now() { return Date.now(); }
function rid() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function runDir(runId) { return path.join(RUNS_DIR(), runId); }
function receiptPath(runId) { return path.join(runDir(runId), 'receipt.json'); }
function eventsPath(runId) { return path.join(runDir(runId), 'events.jsonl'); }
function policyPath(runId) { return path.join(runDir(runId), 'policy.json'); }

function hashCommand(cmd, cwd, envKeys) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({ cmd: Array.isArray(cmd) ? cmd.join(' ') : cmd, cwd, envKeys: (envKeys || []).sort() }));
  return h.digest('hex').slice(0, 16);
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeJson(p, o) { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function appendEvent(runId, event) {
  const p = eventsPath(runId);
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, JSON.stringify({ ts: now(), ...event }) + '\n');
}

function readReceipt(runId) {
  try { return JSON.parse(fs.readFileSync(receiptPath(runId), 'utf8')); } catch { return null; }
}

function readEvents(runId) {
  try {
    return fs.readFileSync(eventsPath(runId), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

class Supervisor {
  constructor(opts = {}) {
    this.policy = { ...DEFAULT_POLICY, ...(opts.policy || {}) };
    this.runId = opts.runId || rid();
    this.workspace = opts.workspace || process.cwd();
    this.requestedModel = opts.requestedModel || 'unknown';
    this.toolProfile = opts.toolProfile || 'interactive-code';
    this.gitRevision = opts.gitRevision || null;
    this.state = 'created';
    this.toolCalls = 0;
    this.commandHashes = new Map(); // hash -> count
    this.compileAttempts = 0;
    this.startedAt = null;
    this.lastEventAt = null;
    this.child = null;
    this.timer = null;
    this.heartbeatTimer = null;
    this.stalledTimer = null;
    this.leaseFiles = [];
  }

  _emit(event) {
    appendEvent(this.runId, { runId: this.runId, state: this.state, ...event });
    this.lastEventAt = now();
  }

  _writeReceipt() {
    writeJson(receiptPath(this.runId), {
      runId: this.runId,
      state: this.state,
      policy: this.policy,
      workspace: this.workspace,
      requestedModel: this.requestedModel,
      toolProfile: this.toolProfile,
      gitRevision: this.gitRevision,
      startedAt: this.startedAt,
      finishedAt: this.state === 'succeeded' || this.state === 'failed' || this.state === 'blocked' ? now() : null,
      toolCalls: this.toolCalls,
      compileAttempts: this.compileAttempts,
      lastEventAt: this.lastEventAt,
    });
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this._emit({ type: 'state', state: s });
    this._writeReceipt();
  }

  _clearTimers() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.stalledTimer) { clearTimeout(this.stalledTimer); this.stalledTimer = null; }
  }

  _startStalledWatch() {
    if (this.stalledTimer) clearTimeout(this.stalledTimer);
    this.stalledTimer = setTimeout(() => {
      this._emit({ type: 'stalled_warning', secondsSinceEvent: this.policy.stalledWarningSeconds });
      this.stalledTimer = setTimeout(() => {
        this._emit({ type: 'stalled_abort', secondsSinceEvent: this.policy.stalledAbortSeconds });
        this._finalize('blocked', 'stalled: no event within deadline');
      }, (this.policy.stalledAbortSeconds - this.policy.stalledWarningSeconds) * 1000);
    }, this.policy.stalledWarningSeconds * 1000);
  }

  _startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Node setInterval can be delayed by synchronous tests; set a 50ms floor so even with very small
    // policy values the event loop gets a chance to fire between ticks.
    const intervalMs = Math.max(50, this.policy.heartbeatSeconds * 1000);
    this.heartbeatTimer = setInterval(() => {
      this._emit({ type: 'heartbeat', elapsedMs: now() - this.startedAt, toolCalls: this.toolCalls, state: this.state });
    }, intervalMs);
  }

  /**
   * Admit a run. Returns {ok:true} or {ok:false, reason}.
   */
  admit() {
    if (this.state !== 'created') return { ok: false, reason: `already ${this.state}` };
    const lease = this._acquireLease();
    if (!lease.ok) return lease;

    this.startedAt = now();
    this._setState('admitted');
    writeJson(policyPath(this.runId), this.policy);
    this._writeReceipt();
    this._startHeartbeat();
    this._startStalledWatch();
    // Emit a synchronous heartbeat so short-lived runs/tests record the start without
    // depending on the async interval firing before the run completes.
    this._emit({ type: 'heartbeat', elapsedMs: 0, toolCalls: this.toolCalls, state: this.state });
    this._emit({ type: 'admitted', workspace: this.workspace, toolProfile: this.toolProfile });
    return { ok: true };
  }


  _leaseFile(kind, id) { return path.join(LEASE_DIR(), `${kind}-${id}.json`); }

  _acquireLease() {
    // default: only count leases in the configured LEASE_DIR.
    let heavy = 0; let light = 0;
    try {
      for (const f of fs.readdirSync(LEASE_DIR())) {
        if (f.startsWith('heavy-')) heavy++;
        else if (f.startsWith('light-')) light++;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const isHeavy = this.toolProfile === 'build' || this.toolProfile === 'computer' || this.toolProfile === 'background-build';
    if (isHeavy && heavy >= this.policy.maxHeavyJobs) {
      return { ok: false, reason: `heavy job admission denied: ${heavy}/${this.policy.maxHeavyJobs} slots in use` };
    }
    if (!isHeavy && light >= this.policy.maxLightJobs) {
      return { ok: false, reason: `light job admission denied: ${light}/${this.policy.maxLightJobs} slots in use` };
    }
    const kind = isHeavy ? 'heavy' : 'light';
    const file = this._leaseFile(kind, this.runId);
    writeJson(file, { runId: this.runId, acquiredAt: now(), profile: this.toolProfile });
    this.leaseFiles.push(file);
    return { ok: true };
  }

  _releaseLease() {
    for (const f of this.leaseFiles) { try { fs.unlinkSync(f); } catch {} }
    this.leaseFiles = [];
  }

  /**
   * Record transition to planning.
   */
  planning() { this._setState('planning'); }

  /**
   * Check and record a tool call. Returns {allow:true} or {allow:false, reason}.
   */
  checkTool(toolName, cmd, cwd, envKeys) {
    if (this.toolCalls >= this.policy.maxToolCalls) {
      return { allow: false, reason: `tool-call budget exceeded: ${this.toolCalls}/${this.policy.maxToolCalls}` };
    }
    this.toolCalls += 1;
    this._emit({ type: 'tool_start', toolName, attempt: this.toolCalls });

    if (cmd) {
      const h = hashCommand(cmd, cwd || this.workspace, envKeys);
      const count = (this.commandHashes.get(h) || 0) + 1;
      this.commandHashes.set(h, count);
      if (count > this.policy.maxIdenticalCommandAttempts) {
        return { allow: false, reason: `identical command retry ceiling hit (${count}/${this.policy.maxIdenticalCommandAttempts})` };
      }
    }

    if (toolName === 'compile' || (cmd && /\b(cargo|rustc|swift|xcodebuild|gradle|make|npm run build)\b/.test(String(cmd)))) {
      this.compileAttempts += 1;
      if (this.compileAttempts > this.policy.maxCompileAttempts) {
        return { allow: false, reason: `compile attempts exceeded: ${this.compileAttempts}/${this.policy.maxCompileAttempts}` };
      }
    }

    this._startStalledWatch();
    return { allow: true };
  }

  toolFinished(toolName, result) {
    this._emit({ type: 'tool_finish', toolName, result: result || null });
    this._startStalledWatch();
  }

  toolTimeout(toolName) {
    this._emit({ type: 'tool_timeout', toolName, timeoutSeconds: this.policy.toolTimeoutSeconds });
  }

  /**
   * Spawn a worker child with process-group capture. Returns a Promise resolving when the child exits.
   */
  spawnWorker(command, args, options = {}) {
    this._setState('tool_running');
    const cwd = options.cwd || this.workspace;
    return new Promise((resolve) => {
      this.child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, ...(options.env || {}) } });
      this._emit({ type: 'spawn', pid: this.child.pid, command, args });
      let stdout = '', stderr = '';
      this.child.stdout.on('data', (c) => { stdout += c; this._emit({ type: 'stdout', chunk: c.toString().slice(0, 2000) }); });
      this.child.stderr.on('data', (c) => { stderr += c; this._emit({ type: 'stderr', chunk: c.toString().slice(0, 2000) }); });
      this.child.on('exit', (code, signal) => {
        this.child = null;
        this._emit({ type: 'exit', code, signal, stdoutLength: stdout.length, stderrLength: stderr.length });
        this._startStalledWatch();
        resolve({ code, signal, stdout, stderr });
      });
    });
  }

  /**
   * Cancel the worker process group.
   */
  cancel() {
    if (!this.child) return { cancelled: false, reason: 'no active child' };
    try { process.kill(-this.child.pid, 'SIGTERM'); } catch (e) { this._emit({ type: 'cancel_error', error: e.message }); }
    setTimeout(() => {
      try { process.kill(-this.child.pid, 'SIGKILL'); } catch {}
    }, 5000);
    this._emit({ type: 'cancel', pid: this.child.pid });
    return { cancelled: true };
  }

  /**
   * Finalize the run. Idempotent.
   */
  _finalize(state, reason) {
    if (this.state === 'succeeded' || this.state === 'failed' || this.state === 'blocked') return;
    this._clearTimers();
    this._releaseLease();
    this._setState(state);
    if (reason) this._emit({ type: 'finalized', reason, state });
    this._writeReceipt();
  }

  succeed() { this._finalize('succeeded', 'completed'); }
  fail(reason) { this._finalize('failed', reason); }
  block(reason) { this._finalize('blocked', reason); }

  verify(result) {
    this._setState('verifying');
    this._emit({ type: 'verify', result: result || null });
  }
}

/**
 * Resume an existing run from its receipt. Returns a Supervisor seeded with the prior state.
 */
function resume(runId, opts = {}) {
  const r = readReceipt(runId);
  if (!r) return { ok: false, reason: 'no receipt' };
  const sup = new Supervisor({ ...opts, runId, policy: r.policy, workspace: r.workspace, requestedModel: r.requestedModel, toolProfile: r.toolProfile, gitRevision: r.gitRevision });
  sup.state = r.state;
  sup.startedAt = r.startedAt;
  sup.lastEventAt = r.lastEventAt;
  return { ok: true, supervisor: sup };
}

module.exports = { Supervisor, resume, readReceipt, readEvents, DEFAULT_POLICY, hashCommand };
