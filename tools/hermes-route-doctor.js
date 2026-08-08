#!/usr/bin/env node
'use strict';
// hermes-route-doctor — guards against the 2026-08-06 hermes-yolo regression class.
//
// Three independent failure modes, all seen live that day:
//   1. Env-surface drift: ~/.zshrc, `launchctl getenv`, and the route LaunchAgent
//      can disagree. Terminals read .zshrc while GUI apps (Herdr/Warp panes) read
//      launchctl, so drift silently routes different launch surfaces to different
//      backends. A manual un-persisted `launchctl setenv` is the classic cause.
//   2. Dead route serving garbage: auth-level doctors stay green while the balance
//      or quota is spent (Grok Build 402, DeepSeek daily-cap cooldown). Only a live
//      completion that returns non-empty visible content proves usability.
//   3. Zombie sessions: multi-hour hermes-yolo TUIs accumulate context compactions
//      and degrade into tool-churn that never answers.
//
// Alert-only by default (ntfy push on RED); --heal re-applies the LaunchAgent
// plist values to launchctl. It never edits ~/.zshrc — that stays a human call.
//
// Usage: hermes-route-doctor [--json] [--heal] [--no-probe] [--no-ntfy]
// Exit codes: 0 green · 1 RED (drift or dead route) · 2 zombie warning only

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const ZSHRC_PATH = path.join(HOME, '.zshrc');
const PLIST_PATH = path.join(HOME, 'Library', 'LaunchAgents', 'com.igor.hermes-yolo-route.plist');
const ROUTE_VARS = ['HERMES_YOLO_BACKEND', 'HERMES_YOLO_MODEL', 'HERMES_YOLO_PROVIDER'];
const GATEWAY_URL = process.env.HERMES_GATEWAY_URL || 'http://127.0.0.1:4010';
const NTFY_TOPIC = process.env.HERMES_ROUTE_DOCTOR_NTFY || 'yolo-guard-fdh8ktuw1vtxb5sb';
const MAX_SESSION_HOURS = Number(process.env.HERMES_YOLO_MAX_SESSION_HOURS || 6);
const PROBE_TIMEOUT_MS = 60_000;

// Last export wins, matching zsh semantics for a re-sourced rc file.
function parseZshrcExports(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*export\s+(HERMES_YOLO_[A-Z_]+)=(\S+)/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

// The route plist runs one /bin/sh -c string of `launchctl setenv VAR value` commands.
function parsePlistRouteCommand(text) {
  const values = {};
  const re = /launchctl setenv\s+(HERMES_YOLO_[A-Z_]+)\s+([^\s;<]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) values[m[1]] = m[2];
  return values;
}

// ps etime formats: mm:ss · hh:mm:ss · dd-hh:mm:ss
function parseEtimeToHours(etime) {
  const m = String(etime).trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const minutes = Number(m[3]);
  return days * 24 + hours + minutes / 60;
}

// Drift = two surfaces that both define a var but disagree. A surface missing a
// var is reported separately for BACKEND only (all three must pin it).
function compareSurfaces(surfaces) {
  const problems = [];
  for (const varName of ROUTE_VARS) {
    const defined = Object.entries(surfaces)
      .map(([name, vals]) => [name, vals[varName]])
      .filter(([, v]) => v !== undefined && v !== null && v !== '');
    const distinct = new Set(defined.map(([, v]) => v));
    if (distinct.size > 1) {
      problems.push(`${varName} drift: ${defined.map(([n, v]) => `${n}=${v}`).join(' ')}`);
    }
    if (varName === 'HERMES_YOLO_BACKEND' && defined.length < Object.keys(surfaces).length) {
      const missing = Object.keys(surfaces).filter((n) => !defined.some(([dn]) => dn === n));
      problems.push(`${varName} missing on: ${missing.join(', ')}`);
    }
  }
  return problems;
}

function findZombieSessions(psOutput, maxHours) {
  const zombies = [];
  for (const line of psOutput.split('\n')) {
    if (!/bin\/hermes-yolo(\s|$)/.test(line)) continue;
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+/);
    if (!m) continue;
    const hours = parseEtimeToHours(m[2]);
    if (hours !== null && hours > maxHours) {
      zombies.push({ pid: Number(m[1]), hours: Math.round(hours * 10) / 10 });
    }
  }
  return zombies;
}

function readSurfaces() {
  const surfaces = { zshrc: {}, launchctl: {}, plist: {} };
  try {
    surfaces.zshrc = parseZshrcExports(fs.readFileSync(ZSHRC_PATH, 'utf8'));
  } catch { /* absent rc file = empty surface */ }
  try {
    surfaces.plist = parsePlistRouteCommand(fs.readFileSync(PLIST_PATH, 'utf8'));
  } catch { /* absent plist = empty surface */ }
  for (const varName of ROUTE_VARS) {
    try {
      const value = execFileSync('launchctl', ['getenv', varName], { encoding: 'utf8' }).trim();
      if (value) surfaces.launchctl[varName] = value;
    } catch { /* unset */ }
  }
  return surfaces;
}

function gatewayKey() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'hermes-fleet', '-a', 'litellm-master', '-w'], { encoding: 'utf8' }).trim();
  } catch {
    return process.env.HERMES_GATEWAY_KEY || 'sk-local';
  }
}

// Usability, not auth: the probe must come back with non-empty visible content.
// Empty content on HTTP 200 is exactly the reasoning-model / clamped-budget
// degradation signature and counts as RED.
async function probeGateway(model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayKey()}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 512,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(body.error || body).slice(0, 200)}` };
    }
    const content = (body.choices?.[0]?.message?.content || '').trim();
    const servedBy = body.model || model;
    if (!content) return { ok: false, servedBy, error: 'empty visible content (reasoning ate the budget or truncated)' };
    return { ok: true, servedBy, content: content.slice(0, 40) };
  } catch (err) {
    return { ok: false, error: `probe failed: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function notify(message) {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: { Title: 'hermes-route-doctor', Priority: 'high' },
      body: message,
    });
  } catch { /* alerting is best-effort; the exit code is the contract */ }
}

function heal(plistValues) {
  const applied = [];
  for (const [varName, value] of Object.entries(plistValues)) {
    execFileSync('launchctl', ['setenv', varName, value]);
    applied.push(`${varName}=${value}`);
  }
  return applied;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const surfaces = readSurfaces();
  const drift = compareSurfaces(surfaces);

  let psOutput = '';
  try {
    psOutput = execFileSync('ps', ['axo', 'pid,etime,command'], { encoding: 'utf8' });
  } catch { /* leave zombie check empty */ }
  const zombies = findZombieSessions(psOutput, MAX_SESSION_HOURS);

  let probe = { ok: true, skipped: true };
  if (!args.has('--no-probe')) {
    const model = surfaces.zshrc.HERMES_YOLO_MODEL || surfaces.launchctl.HERMES_YOLO_MODEL || 'deepseek-v4-flash';
    probe = await probeGateway(model);
  }

  let healed = [];
  if (args.has('--heal') && drift.length && Object.keys(surfaces.plist).length) {
    healed = heal(surfaces.plist);
  }

  const red = drift.length > 0 || !probe.ok;
  const report = { status: red ? 'RED' : zombies.length ? 'WARN' : 'GREEN', drift, zombies, probe, healed, surfaces };

  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`hermes-route-doctor: ${report.status}`);
    for (const d of drift) console.log(`  DRIFT  ${d}`);
    if (!probe.skipped) {
      console.log(probe.ok
        ? `  PROBE  ok — served by ${probe.servedBy}: ${JSON.stringify(probe.content)}`
        : `  PROBE  RED — ${probe.error}`);
    }
    for (const z of zombies) console.log(`  ZOMBIE pid ${z.pid} running ${z.hours}h (> ${MAX_SESSION_HOURS}h) — /new or kill it`);
    for (const h of healed) console.log(`  HEALED launchctl ${h}`);
  }

  if ((red || zombies.length) && !args.has('--no-ntfy')) {
    const lines = [
      red ? 'hermes-yolo route RED' : 'hermes-yolo zombie warning',
      ...drift,
      ...(!probe.ok && !probe.skipped ? [`probe: ${probe.error}`] : []),
      ...zombies.map((z) => `zombie pid ${z.pid} at ${z.hours}h`),
    ];
    await notify(lines.join('\n'));
  }

  process.exitCode = red ? 1 : zombies.length ? 2 : 0;
}

module.exports = { parseZshrcExports, parsePlistRouteCommand, parseEtimeToHours, compareSurfaces, findZombieSessions, ROUTE_VARS };

if (require.main === module) {
  main().catch((err) => {
    console.error(`hermes-route-doctor: crashed: ${err.message}`);
    process.exitCode = 1;
  });
}
