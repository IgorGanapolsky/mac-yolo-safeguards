#!/usr/bin/env node
// connector.js — runs on the USER's Mac. Dials OUT to the relay (long-poll over 443),
// reads local Claude Code / Hermes sessions, and answers requests routed from the
// browser. No inbound ports, no Tailscale, no VPN. This is what the customer installs
// (one command); everything else they do in a browser.
//
//   RELAY_URL=https://relay.yourdomain.com  node connector.js pair ABCD-1234   # once
//   RELAY_URL=https://relay.yourdomain.com  node connector.js run              # daemon
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const RELAY = (process.env.RELAY_URL || 'http://127.0.0.1:9099').replace(/\/+$/, '');
const STATE = process.env.CONNECTOR_STATE || path.join(os.homedir(), '.hermes', 'connector.json');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

function req(method, urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(RELAY + urlPath);
    const mod = u.protocol === 'https:' ? https : http;
    const data = bodyObj ? JSON.stringify(bodyObj) : null;
    const r = mod.request(u, { method, timeout: 30000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (resp) => { let b = ''; resp.on('data', (c) => (b += c)); resp.on('end', () => { try { resolve({ code: resp.statusCode, json: JSON.parse(b || '{}') }); } catch { resolve({ code: resp.statusCode, json: {} }); } }); });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (data) r.write(data); r.end();
  });
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 }); }
function deviceId() { const s = loadState(); if (s.deviceId) return s.deviceId; const id = crypto.randomBytes(8).toString('hex'); saveState({ ...s, deviceId: id }); return id; }

// --- Read local sessions (same logic as the dashboard, trimmed) ---
function contentToText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === 'string' ? b : b && b.type === 'text' ? b.text : b && b.type === 'tool_use' ? `⚙️ ${b.name}` : '')).filter(Boolean).join('\n');
  return '';
}
function listSessions() {
  const out = [];
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch { return { sessions: [] }; }
  const files = [];
  for (const d of dirs) { const p = path.join(PROJECTS, d); let fs2 = []; try { fs2 = fs.readdirSync(p); } catch { continue; } for (const f of fs2) if (f.endsWith('.jsonl')) { try { files.push({ fp: path.join(p, f), m: fs.statSync(path.join(p, f)).mtimeMs }); } catch {} } }
  files.sort((a, b) => b.m - a.m);
  for (const { fp } of files.slice(0, 200)) {
    let title = '', ai = '', cwd = '', branch = '', n = 0;
    try { for (const line of fs.readFileSync(fp, 'utf8').split('\n')) { if (!line.trim()) continue; let d; try { d = JSON.parse(line); } catch { continue; } if (d.type === 'ai-title') ai = d.title || ai; if (d.type === 'user' || d.type === 'assistant') { n++; if (d.cwd) cwd = d.cwd; if (d.gitBranch) branch = d.gitBranch; if (d.type === 'user' && !title && typeof (d.message || {}).content === 'string') title = d.message.content.slice(0, 120); } } } catch {}
    out.push({ id: path.basename(fp, '.jsonl'), title: ai || title || '(untitled)', project: cwd ? path.basename(cwd) : '', branch, msgCount: n });
  }
  return { sessions: out };
}
function readThread(id) {
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch { return { error: 'no projects' }; }
  for (const d of dirs) { const fp = path.join(PROJECTS, d, id + '.jsonl'); if (fs.existsSync(fp)) { const msgs = []; for (const line of fs.readFileSync(fp, 'utf8').split('\n')) { if (!line.trim()) continue; let x; try { x = JSON.parse(line); } catch { continue; } if (x.type === 'user' || x.type === 'assistant') { const t = contentToText((x.message || {}).content); if (t.trim()) msgs.push({ role: x.type, text: t }); } } return { messages: msgs }; } }
  return { error: 'not found' };
}
function handle(op, args) {
  if (op === 'sessions') return listSessions();
  if (op === 'thread') return readThread((args || {}).id);
  return { error: 'unknown op' };
}

async function pair(code) {
  const r = await req('POST', '/v1/pair/redeem', { code, deviceId: deviceId() });
  if (r.code !== 200) { console.error('pair failed:', r.json.error || r.code); process.exit(1); }
  saveState({ ...loadState(), token: r.json.deviceToken, accountId: r.json.accountId });
  console.log('paired. token stored in', STATE, '(chmod 600). run: node connector.js run');
}

async function run() {
  const token = loadState().token;
  if (!token) { console.error('not paired. run: node connector.js pair <CODE>'); process.exit(1); }
  console.log('connector running — dialing out to', RELAY, '(no inbound ports, no Tailscale)');
  let backoff = 500;
  for (;;) {
    try {
      const r = await req('GET', '/v1/connector/poll?token=' + encodeURIComponent(token));
      backoff = 500;
      const request = r.json && r.json.request;
      if (request) {
        const result = handle(request.op, request.args);
        await req('POST', '/v1/connector/reply', { token, id: request.id, result });
      }
    } catch (e) {
      await new Promise((s) => setTimeout(s, backoff));
      backoff = Math.min(backoff * 2, 30000); // exponential backoff so drops reconnect silently
    }
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'pair' && arg) pair(arg);
else if (cmd === 'run') run();
else { console.log('usage: node connector.js pair <CODE>   |   node connector.js run'); process.exit(cmd ? 1 : 0); }
module.exports = { handle, listSessions, readThread };
