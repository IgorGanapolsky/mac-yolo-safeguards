#!/usr/bin/env node
'use strict';

/**
 * tools/capture-guard-snapshot.js — records a redacted snapshot of this Mac's process table in
 * exactly the shape the kill/spare decisions read, so it can become a golden-set test case.
 *
 * Inputs the decisions read:
 *   ps -axo pid=,ppid=,rss=,etime=,tty=,command=   (agent guard parsePs, system-care Cool Down Fans)
 *   ps -axo pid=,time=                              (agent guard readCpuTimes -> trackIdle)
 *   launchctl list                                  (pids that a LaunchAgent runs)
 *
 * Usage: node tools/capture-guard-snapshot.js [--out file.json] [--samples 2] [--interval-sec 5]
 */

const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const MAX_COMMAND_LEN = 400;
const PLACEHOLDER = '<redacted>';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pure. Home dir -> /Users/user, owner names dropped, secret-looking arguments replaced.
// Executable names and script paths stay.
function redactCommand(command, { home = os.homedir(), names = [] } = {}) {
  let out = command;
  if (home && home !== '/') out = out.split(home).join('/Users/user');
  out = out.replace(/\/Users\/(?!user(\/|\s|$))[^/\s]+/g, '/Users/user');
  for (const name of names.filter((n) => n && n.length > 2)) out = out.replace(new RegExp(escapeRe(name), 'gi'), 'user');
  out = out.replace(/\bigor[a-z]*\b/gi, 'user');
  // Flag values: --api-key X, --token X, --password X, -H "Authorization: ..."
  out = out.replace(/(--?[\w-]*(?:key|token|secret|passw(?:or)?d|auth|credential|cookie)[\w-]*)([ =])("[^"]*"|'[^']*'|\S+)/gi, `$1$2${PLACEHOLDER}`);
  out = out.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>');
  out = out.replace(/[A-Za-z0-9._-]+@(?:<ip>|[A-Za-z][A-Za-z0-9-]*\.[A-Za-z0-9.-]+)/g, '<email>');
  const tokens = out.split(/(\s+)/);
  const clean = tokens.map((t) => {
    if (/^\s*$/.test(t)) return t;
    if (/(^|[?&;:,'"])[\w.-]*(key|token|secret|passw(or)?d|auth|credential|bearer)[\w.-]*=/i.test(t)) return t.replace(/=.*$/, `=${PLACEHOLDER}`);
    if (/sk-[A-Za-z0-9_-]{6,}|ghp_|gho_|ghs_|github_pat_|xox[bapr]-|AKIA[0-9A-Z]{8,}|AIza[0-9A-Za-z_-]{10,}|eyJ[A-Za-z0-9_-]{10,}/.test(t)) return PLACEHOLDER;
    if (/[^\s@/]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(t)) return t.replace(/[^\s@/'"]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g, '<email>');
    if (/^[A-Za-z0-9+_=-]{32,}$/.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return PLACEHOLDER;
    return t;
  });
  out = clean.join('');
  // The repo is public: no links, work folders, project names, document names or session ids.
  out = out.replace(/https?:\/\/[^\s"']+/g, 'https://redacted.invalid');
  out = out.replace(/\/Users\/user\/(?:workspace|Documents|Desktop|Downloads|Projects|code|src|dev)\/[^\s"']*/g, '/Users/user/work/project');
  out = out.replace(/\b(?:eci|psn|stockservice|realestate|tencent|helix|nexus|dist03)[\w.-]*/gi, 'project');
  out = out.replace(/[^\s"'/]+\.(?:pptx|docx|xlsx|pdf|key|numbers|pages|png|jpe?g|heic|mov|mp4|eml|msg|csv|txt|md)\b/gi, (m) => `file.${m.split('.').pop().toLowerCase()}`);
  out = out.replace(/\bcse_[A-Za-z0-9]+/g, 'cse_id');
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '00000000-0000-4000-8000-000000000000');
  return out.length > MAX_COMMAND_LEN ? out.slice(0, MAX_COMMAND_LEN) : out;
}

// Pure. One redacted ps line per process, same columns the guards parse.
function redactPs(text, opts) {
  const lines = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    lines.push(`${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]} ${redactCommand(m[6], opts)}`);
  }
  return lines;
}

function etimeToSeconds(etime) {
  const [daysPart, clock] = etime.includes('-') ? etime.split('-') : [0, etime];
  const parts = clock.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  return Number(daysPart) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function readCpu() {
  const out = {};
  const text = execFileSync('/bin/ps', ['-axo', 'pid=,time='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+([\d:-]+)(?:\.(\d+))?/);
    if (m) out[m[1]] = etimeToSeconds(m[2]) + Number(`0.${m[3] || 0}`);
  }
  return out;
}

function readLaunchdPids() {
  try {
    const out = execFileSync('/bin/launchctl', ['list'], { encoding: 'utf8' });
    return out.split('\n').map((l) => Number(l.split('\t')[0])).filter((n) => n > 0);
  } catch {
    return [];
  }
}

function sleepSec(sec) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sec * 1000);
}

function capture({ samples = 2, intervalSec = 5 } = {}) {
  const names = [os.userInfo().username, os.hostname().split('.')[0]];
  const psText = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,etime=,tty=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const ps = redactPs(psText, { names });
  const cpuSamples = [];
  for (let i = 0; i < samples; i += 1) {
    if (i > 0) sleepSec(intervalSec);
    cpuSamples.push({ atSec: i * intervalSec, cpu: readCpu() });
  }
  return { ps, cpuSamples, launchdPids: readLaunchdPids() };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
  const snap = capture({ samples: Number(arg('--samples', 2)), intervalSec: Number(arg('--interval-sec', 5)) });
  const json = JSON.stringify(snap);
  const out = arg('--out', null);
  if (out) fs.writeFileSync(out, json + '\n');
  else process.stdout.write(json + '\n');
}

module.exports = { redactCommand, redactPs, capture };
