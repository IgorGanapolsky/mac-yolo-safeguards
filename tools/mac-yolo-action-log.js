#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-action-log.js — local audit trail of the app's kill/spare decisions.
 *
 * One JSON line per decision in <dir>/actions.jsonl:
 *   {ts, runId, action, pid, name, decision: kill|spare, reason, cpuPct, rssMB, killed}
 * `name` is the executable basename only: no arguments, paths or user names are written.
 * The file rotates at 5 MB (one older copy kept as actions.jsonl.1). The directory is
 * ~/Library/Application Support/MacYoloSafeguards, or MAC_YOLO_ACTION_LOG_DIR.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_BYTES = 5 * 1024 * 1024;

function logDir(env = process.env) {
  return env.MAC_YOLO_ACTION_LOG_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'MacYoloSafeguards');
}

function exeName(command) {
  return path.basename(String(command || '').split(' ')[0]).slice(0, 80);
}

function cpuByPid() {
  const out = new Map();
  try {
    const text = execFileSync('/bin/ps', ['-axo', 'pid=,pcpu='], { encoding: 'utf8', timeout: 4000, maxBuffer: 8 * 1024 * 1024 });
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+([\d.]+)/);
      if (m) out.set(Number(m[1]), Number(m[2]));
    }
  } catch {
    // cpuPct stays null
  }
  return out;
}

function rotateIfNeeded(file, incomingBytes, maxBytes) {
  try {
    if (fs.statSync(file).size + incomingBytes > maxBytes) fs.renameSync(file, `${file}.1`);
  } catch {
    // no file yet
  }
}

// decisions: [{ proc: {pid, command, rssMB}, decision, reason, killed }]. Never throws.
function logDecisions(action, decisions, { env = process.env, now = Date.now(), maxBytes = MAX_BYTES, cpu = null } = {}) {
  try {
    if (!decisions.length) return 0;
    const dir = logDir(env);
    fs.mkdirSync(dir, { recursive: true });
    const cpus = cpu || cpuByPid();
    const runId = `${now.toString(36)}-${process.pid}`;
    const lines = decisions.map((d) => JSON.stringify({
      ts: new Date(now).toISOString(),
      runId,
      action,
      pid: d.proc.pid,
      name: exeName(d.proc.command),
      decision: d.decision,
      reason: d.reason,
      cpuPct: cpus.has(d.proc.pid) ? cpus.get(d.proc.pid) : null,
      rssMB: d.proc.rssMB,
      killed: Boolean(d.killed),
    }));
    const file = path.join(dir, 'actions.jsonl');
    const body = `${lines.join('\n')}\n`;
    rotateIfNeeded(file, Buffer.byteLength(body), maxBytes);
    fs.appendFileSync(file, body);
    return lines.length;
  } catch {
    return 0;
  }
}

function readEntries(env = process.env) {
  const dir = logDir(env);
  const entries = [];
  for (const f of ['actions.jsonl.1', 'actions.jsonl']) {
    try {
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
        if (line) entries.push(JSON.parse(line));
      }
    } catch {
      // missing or partial line
    }
  }
  return entries;
}

function actionStats({ days = 7, env = process.env, now = Date.now() } = {}) {
  const since = now - days * 86400000;
  const rows = readEntries(env).filter((e) => Date.parse(e.ts) >= since);
  const kills = rows.filter((e) => e.decision === 'kill');
  const freed = rows.filter((e) => e.killed).reduce((s, e) => s + (e.rssMB || 0), 0);
  return {
    days,
    runs: new Set(rows.map((e) => e.runId)).size,
    kills: kills.length,
    killed: rows.filter((e) => e.killed).length,
    spares: rows.filter((e) => e.decision === 'spare').length,
    mbFreed: Math.round(freed),
  };
}

module.exports = { logDecisions, actionStats, logDir, exeName, MAX_BYTES };
