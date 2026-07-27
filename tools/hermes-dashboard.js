#!/usr/bin/env node
// hermes-dashboard - a local, self-hosted web UI to browse and continue your
// Claude Code / Hermes agent chat threads from any browser on your network,
// plus live fleet status (gateway liveliness + the runaway-loop governance angle).
//
// Zero npm dependencies (Node built-ins only). Reads ~/.claude/projects/*/*.jsonl.
// Nothing leaves the machine; no telemetry; read-only over your sessions.
//
//   node tools/hermes-dashboard.js            # serves on http://127.0.0.1:8787
//   PORT=9000 HOST=0.0.0.0 node tools/...      # LAN-accessible (phone on same wifi/Tailscale)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = parseInt(process.env.HERMES_DASH_PORT || process.env.PORT || '8787', 10);
const HOST = process.env.HERMES_DASH_HOST || process.env.HOST || '127.0.0.1';
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const GATEWAY = process.env.FLEET_GATEWAY_URL || 'http://127.0.0.1:4010/health/liveliness';

// --- Offline failover: the resolver that picks the best-available Hermes instance so
// work continues when the user's primary (local) machine is offline. Priority order =
// array order; "active" = the highest-priority instance currently answering its health
// check. Configure a cloud/VPS fallback by setting HERMES_FAILOVER_VPS_URL (its base;
// we probe <base>/health). Override the whole list with HERMES_INSTANCES (JSON array of
// {label,kind,url,health}). Primary intent: when local dies, the relay/resume targets
// the next healthy instance automatically instead of the session going dead.
// Read a key from ~/.hermes/.env so the always-on launchd instance can pick up a VPS URL
// without editing the plist — just add HERMES_FAILOVER_VPS_URL=... to that file and restart.
function envFallback(key) {
  if (process.env[key]) return process.env[key];
  try {
    const f = path.join(os.homedir(), '.hermes', '.env');
    const m = fs.readFileSync(f, 'utf8').split('\n').reverse()
      .map((l) => l.match(new RegExp('^' + key + '=(.*)$'))).find(Boolean);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}

function instanceRegistry() {
  const raw = envFallback('HERMES_INSTANCES');
  if (raw) { try { return JSON.parse(raw); } catch {} }
  const list = [
    { label: 'local', kind: 'local', url: 'http://127.0.0.1:4010', health: 'http://127.0.0.1:4010/health/liveliness' },
    { label: 'mini', kind: 'tailscale', url: 'http://100.94.135.78:11436', health: 'http://100.94.135.78:11436/api/tags' },
  ];
  const vps = envFallback('HERMES_FAILOVER_VPS_URL');
  if (vps) {
    const base = vps.replace(/\/+$/, '');
    list.push({ label: 'vps', kind: 'vps', url: base, health: base + '/health' });
  }
  return list;
}

function httpPing(u, timeoutMs) {
  return new Promise((resolve) => {
    let mod, req;
    try { mod = u.startsWith('https:') ? require('https') : require('http'); }
    catch { return resolve(false); }
    try {
      req = mod.get(u, { timeout: timeoutMs }, (r) => {
        r.resume();
        resolve(r.statusCode >= 200 && r.statusCode < 500); // reachable (even 4xx = host is up)
      });
    } catch { return resolve(false); }
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function resolveInstances() {
  const reg = instanceRegistry();
  const checked = await Promise.all(reg.map(async (i) => ({
    ...i, up: await httpPing(i.health, 3000),
  })));
  const active = checked.find((i) => i.up) || null;
  return {
    instances: checked.map((i) => ({ ...i, active: !!active && i.label === active.label })),
    active: active ? { label: active.label, kind: active.kind, url: active.url } : null,
    allDown: !active,
  };
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Flatten a Claude message content (string | array of blocks) to readable text.
function contentToText(c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((b) => {
      if (typeof b === 'string') return b;
      if (!b || typeof b !== 'object') return '';
      if (b.type === 'text') return b.text || '';
      if (b.type === 'thinking') return '';
      if (b.type === 'tool_use') return `⚙️ ${b.name || 'tool'}(${JSON.stringify(b.input || {}).slice(0, 200)})`;
      if (b.type === 'tool_result') {
        const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        return `↳ ${String(t).slice(0, 400)}`;
      }
      return '';
    }).filter(Boolean).join('\n');
  }
  return '';
}

// Parse one .jsonl session into {meta, messages}. Tolerant of malformed lines.
function parseSession(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const messages = [];
  let title = '', aiTitle = '', cwd = '', branch = '', lastTs = '', firstTs = '';
  const prLinks = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const t = d.type;
    if (t === 'ai-title' && d.title) aiTitle = d.title;
    if (t === 'pr-link' && d.url) prLinks.push(d.url);
    if (t === 'user' || t === 'assistant') {
      const m = d.message || {};
      const text = contentToText(m.content);
      const ts = d.timestamp || '';
      if (ts) { if (!firstTs) firstTs = ts; lastTs = ts; }
      if (d.cwd) cwd = d.cwd;
      if (d.gitBranch) branch = d.gitBranch;
      // ignore pure tool-noise turns for the title
      if (t === 'user' && !title && typeof m.content === 'string' && m.content.trim() && !m.content.startsWith('<')) {
        title = m.content.trim().slice(0, 120);
      }
      if (text.trim()) messages.push({ role: t, text, ts });
    }
  }
  const st = fs.statSync(file);
  return {
    meta: {
      id: path.basename(file, '.jsonl'),
      project: cwd ? path.basename(cwd) : path.basename(path.dirname(file)),
      cwd, branch,
      title: aiTitle || title || '(untitled session)',
      msgCount: messages.length,
      lastTs: lastTs || st.mtime.toISOString(),
      prLinks: [...new Set(prLinks)].slice(0, 8),
      mtime: st.mtimeMs,
      resume: cwd ? `cd ${cwd} && claude --resume ${path.basename(file, '.jsonl')}` : `claude --resume ${path.basename(file, '.jsonl')}`,
    },
    messages,
  };
}

function listFiles() {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS); } catch { return out; }
  for (const dir of dirs) {
    const p = path.join(PROJECTS, dir);
    let files = [];
    try { files = fs.readdirSync(p); } catch { continue; }
    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        const fp = path.join(p, f);
        try { out.push({ fp, mtime: fs.statSync(fp).mtimeMs }); } catch {}
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function fileById(id) {
  for (const { fp } of listFiles()) if (path.basename(fp, '.jsonl') === id) return fp;
  return null;
}

// --- Governance layer: see live agents, spot the ones burning budget, stop them ---
// SAFETY: only processes whose command matches AGENT_RE are ever listed or killable.
// The kill endpoint re-verifies the pid is a current agent before signalling, sends
// SIGTERM (not SIGKILL), and never accepts an arbitrary pid. Localhost-bound by default.
const AGENT_RE = /(\bclaude\b|-yolo\b|hermes-yolo|opencode|kimi|litellm|hermes-dashboard|hermes-relay|tinker|\bcodex\b|cursor-agent)/i;
const HOT_CPU = 60;        // sustained %CPU above this = flagged "hot / burning"
const LONG_SECS = 3 * 3600; // running longer than this = flagged "long-running"

function etimeToSecs(e) { // ps etime: [[DD-]HH:]MM:SS
  const p = e.split('-'); let days = 0, rest = e;
  if (p.length === 2) { days = parseInt(p[0], 10) || 0; rest = p[1]; }
  const t = rest.split(':').map((n) => parseInt(n, 10) || 0);
  let s = 0; for (const n of t) s = s * 60 + n;
  return s + days * 86400;
}

function liveAgents() {
  return new Promise((resolve) => {
    execFile('/bin/ps', ['-axo', 'pid=,ppid=,pcpu=,pmem=,etime=,command='], { maxBuffer: 8 << 20 },
      (err, out) => {
        if (err) return resolve([]);
        const rows = [];
        const self = String(process.pid);
        for (const line of out.split('\n')) {
          const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
          if (!m) continue;
          const [, pid, ppid, pcpu, pmem, etime, command] = m;
          if (pid === self) continue;                 // never list/kill ourselves
          if (!AGENT_RE.test(command)) continue;
          if (/hermes-dashboard/.test(command) && pid === self) continue;
          const secs = etimeToSecs(etime);
          const cpu = parseFloat(pcpu) || 0;
          const flags = [];
          if (cpu >= HOT_CPU) flags.push('hot');
          if (secs >= LONG_SECS) flags.push('long-running');
          rows.push({
            pid: +pid, ppid: +ppid, cpu, mem: parseFloat(pmem) || 0, etime, secs,
            command: command.length > 160 ? command.slice(0, 160) + '…' : command,
            flags,
          });
        }
        rows.sort((a, b) => (b.flags.length - a.flags.length) || (b.cpu - a.cpu));
        resolve(rows);
      });
  });
}

async function killAgent(pid) {
  const n = parseInt(pid, 10);
  if (!Number.isInteger(n) || n <= 1) return { ok: false, error: 'invalid pid' };
  const live = await liveAgents();
  const target = live.find((r) => r.pid === n);
  if (!target) return { ok: false, error: 'pid is not a currently-running agent (refused)' };
  try { process.kill(n, 'SIGTERM'); return { ok: true, pid: n, sent: 'SIGTERM', command: target.command }; }
  catch (e) {
    // Full stack stays server-side only; the HTTP client gets a safe, generic message.
    console.error('[hermes-dashboard] killAgent failed:', e && e.stack || e);
    return { ok: false, error: 'failed to signal process' };
  }
}

function gatewayStatus() {
  return new Promise((resolve) => {
    const req = http.get(GATEWAY, { timeout: 3000 }, (r) => {
      let b = ''; r.on('data', (c) => (b += c));
      r.on('end', () => resolve({ up: r.statusCode === 200, detail: b.slice(0, 60).trim() }));
    });
    req.on('error', () => resolve({ up: false, detail: 'no response' }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false, detail: 'timeout' }); });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  try {
    if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', PAGE);
    if (url.pathname === '/api/sessions') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const files = listFiles();
      // Parse the most-recent 250 for titles; enough to be responsive over ~3k sessions.
      const rows = [];
      for (const { fp } of files.slice(0, 250)) {
        const s = parseSession(fp);
        if (!s) continue;
        const m = s.meta;
        if (q && !(`${m.title} ${m.project} ${m.branch}`.toLowerCase().includes(q))) continue;
        rows.push(m);
      }
      return send(200, 'application/json', JSON.stringify({ total: files.length, shown: rows.length, sessions: rows }));
    }
    if (url.pathname === '/api/thread') {
      const id = url.searchParams.get('id') || '';
      const fp = fileById(id);
      if (!fp) return send(404, 'application/json', '{"error":"not found"}');
      return send(200, 'application/json', JSON.stringify(parseSession(fp)));
    }
    if (url.pathname === '/api/instances') {
      return send(200, 'application/json', JSON.stringify(await resolveInstances()));
    }
    if (url.pathname === '/api/active') {
      // The endpoint the relay/resume should target right now (failover-aware).
      const r = await resolveInstances();
      return send(r.active ? 200 : 503, 'application/json', JSON.stringify(r.active || { error: 'all instances offline' }));
    }
    if (url.pathname === '/api/live') {
      return send(200, 'application/json', JSON.stringify({ agents: await liveAgents() }));
    }
    if (url.pathname === '/api/kill' && req.method === 'POST') {
      const pid = url.searchParams.get('pid');
      const r = await killAgent(pid);
      return send(r.ok ? 200 : 400, 'application/json', JSON.stringify(r));
    }
    if (url.pathname === '/api/fleet') {
      const gw = await gatewayStatus();
      const files = listFiles();
      return send(200, 'application/json', JSON.stringify({
        gateway: gw, sessionCount: files.length,
        newest: files[0] ? new Date(files[0].mtime).toISOString() : null,
        host: os.hostname(),
      }));
    }
    return send(404, 'text/plain', 'not found');
  } catch (e) {
    // Full stack stays server-side only; the HTTP client gets a safe, generic message.
    console.error('[hermes-dashboard] request failed:', e && e.stack || e);
    return send(500, 'application/json', JSON.stringify({ error: 'internal error' }));
  }
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hermes Sessions</title><style>
:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--acc:#4d9fff;--u:#2ea043;--a:#8957e5}
@media(prefers-color-scheme:light){:root{--bg:#f6f8fa;--card:#fff;--bd:#d0d7de;--fg:#1f2328;--mut:#656d76;--acc:#0969da}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
header{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--bd);padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:5}
header h1{font-size:16px;margin:0;font-weight:600}
#fleet{font-size:12px;color:var(--mut);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
.up{background:var(--u)}.down{background:#f85149}
input{flex:1;min-width:160px;background:var(--bg);border:1px solid var(--bd);color:var(--fg);border-radius:6px;padding:7px 10px;font-size:14px}
#live{background:var(--card);border-bottom:1px solid var(--bd);padding:8px 16px;font-size:12px;display:none;max-height:22vh;overflow-y:auto}
#live.show{display:block}
#live h3{margin:0 0 6px;font-size:12px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.agent{display:flex;gap:10px;align-items:center;padding:5px 0;border-top:1px solid var(--bd);flex-wrap:wrap}
.agent code{font-family:ui-monospace,monospace;flex:1;min-width:200px;color:var(--fg);opacity:.85}
.agent .flag{font-size:10px;font-weight:700;border-radius:8px;padding:1px 7px;background:#f8514922;color:#f85149;border:1px solid #f8514955}
.kill{background:#f85149;color:#fff;border:0;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600}
.kill:hover{background:#da3633}
main{display:flex;height:calc(100vh - 54px)}
#list{width:min(420px,42%);overflow:auto;border-right:1px solid var(--bd)}
#thread{flex:1;overflow:auto;padding:16px}
.s{padding:11px 14px;border-bottom:1px solid var(--bd);cursor:pointer}
.s:hover{background:var(--card)}.s.sel{background:var(--card);border-left:3px solid var(--acc)}
.s .t{font-weight:600;margin-bottom:3px}.s .m{font-size:12px;color:var(--mut);display:flex;gap:8px;flex-wrap:wrap}
.badge{font-size:11px;background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:0 7px}
.msg{margin:0 0 14px;padding:10px 12px;border-radius:8px;border:1px solid var(--bd);white-space:pre-wrap;word-break:break-word}
.msg.user{background:color-mix(in srgb,var(--u) 8%,var(--card))}.msg.assistant{background:var(--card)}
.msg .role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);margin-bottom:4px}
.msg.user .role{color:var(--u)}.msg.assistant .role{color:var(--a)}
#head{margin-bottom:14px}#head h2{margin:0 0 4px;font-size:16px}
.resume{background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:12px;margin:8px 0;cursor:pointer;position:relative}
.resume:hover{border-color:var(--acc)}.resume::after{content:"click to copy";position:absolute;right:8px;top:8px;font-size:10px;color:var(--mut)}
a{color:var(--acc)}.empty{color:var(--mut);padding:40px;text-align:center}
</style></head><body>
<header>
  <h1>⚡ Hermes Sessions</h1>
  <div id="failover" style="font-size:12px;display:flex;gap:6px;align-items:center"></div>
  <div id="fleet">loading…</div>
  <input id="q" placeholder="search sessions (title, project, branch)…">
</header>
<div id="live"><h3>live agents — stop the ones burning budget</h3><div id="agents"></div></div>
<main><div id="list"><div class="empty">loading sessions…</div></div>
<div id="thread"><div class="empty">Select a session to view and continue it.</div></div></main>
<script>
let sel=null;
async function fleet(){try{const f=await (await fetch('/api/fleet')).json();
  document.getElementById('fleet').innerHTML=
    '<span><span class="dot '+(f.gateway.up?'up':'down')+'"></span>gateway :4010 '+(f.gateway.up?'live':'down')+'</span>'+
    '<span>'+f.sessionCount+' sessions</span><span>'+f.host+'</span>';}catch(e){}}
async function load(q){const r=await (await fetch('/api/sessions?q='+encodeURIComponent(q||''))).json();
  const el=document.getElementById('list');
  if(!r.sessions.length){el.innerHTML='<div class="empty">no matches</div>';return;}
  el.innerHTML=r.sessions.map(s=>'<div class="s" data-id="'+s.id+'"><div class="t">'+esc(s.title)+
    '</div><div class="m"><span class="badge">'+esc(s.project)+'</span>'+
    (s.branch?'<span class="badge">'+esc(s.branch)+'</span>':'')+
    '<span>'+s.msgCount+' msgs</span><span>'+new Date(s.lastTs).toLocaleString()+'</span></div></div>').join('')+
    (r.total>r.shown?'<div class="empty" style="font-size:12px">showing '+r.shown+' most-recent of '+r.total+' · refine with search</div>':'');
  [...el.querySelectorAll('.s')].forEach(d=>d.onclick=()=>open(d.dataset.id,d));}
async function open(id,node){if(sel)sel.classList.remove('sel');node.classList.add('sel');sel=node;
  const t=document.getElementById('thread');t.innerHTML='<div class="empty">loading…</div>';
  const s=await (await fetch('/api/thread?id='+id)).json();const m=s.meta;
  t.innerHTML='<div id="head"><h2>'+esc(m.title)+'</h2><div class="m" style="color:var(--mut);font-size:12px">'+
    esc(m.project)+(m.branch?' · '+esc(m.branch):'')+' · '+m.msgCount+' messages</div>'+
    '<div class="resume" onclick="navigator.clipboard.writeText(this.dataset.c);this.style.borderColor=\\'var(--u)\\'" data-c="'+esc(m.resume)+'">'+esc(m.resume)+'</div>'+
    (m.prLinks.length?'<div style="font-size:12px">'+m.prLinks.map(u=>'<a href="'+esc(u)+'" target="_blank">'+esc(u.replace(/^https?:\\/\\//,''))+'</a>').join(' · ')+'</div>':'')+'</div>'+
    s.messages.map(x=>'<div class="msg '+x.role+'"><div class="role">'+x.role+'</div>'+esc(x.text)+'</div>').join('');
  t.scrollTop=0;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
let qt;document.getElementById('q').oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>load(e.target.value),250);};
async function live(){try{const r=await (await fetch('/api/live')).json();const box=document.getElementById('live'),el=document.getElementById('agents');
  if(!r.agents.length){box.classList.remove('show');return;}box.classList.add('show');
  el.innerHTML=r.agents.map(a=>'<div class="agent">'+
    a.flags.map(f=>'<span class="flag">'+f+'</span>').join('')+
    '<code>pid '+a.pid+' · '+a.cpu+'% cpu · '+a.etime+' · '+esc(a.command)+'</code>'+
    '<button class="kill" onclick="kill('+a.pid+',this)">Kill</button></div>').join('');}catch(e){}}
async function kill(pid,btn){if(!confirm('Send SIGTERM to pid '+pid+'?'))return;btn.disabled=true;btn.textContent='…';
  const r=await (await fetch('/api/kill?pid='+pid,{method:'POST'})).json();
  if(r.ok){btn.textContent='killed';}else{btn.disabled=false;btn.textContent='Kill';alert('Refused: '+(r.error||'unknown'));}
  setTimeout(live,800);}
async function failover(){try{const r=await (await fetch('/api/instances')).json();const el=document.getElementById('failover');
  el.innerHTML='<span style="color:var(--mut)">serving:</span>'+r.instances.map(i=>
    '<span class="badge" title="'+esc(i.kind)+' · '+esc(i.url)+'" style="'+
    (i.active?'border-color:var(--u);color:var(--u);font-weight:700':(i.up?'':'opacity:.45;text-decoration:line-through'))+'">'+
    (i.active?'▶ ':'')+esc(i.label)+'</span>').join('<span style="color:var(--mut)">→</span>')+
    (r.allDown?'<span class="flag" style="font-size:11px;background:#f8514922;color:#f85149;border:1px solid #f8514955;border-radius:8px;padding:1px 7px">ALL OFFLINE</span>':'');}catch(e){}}
fleet();load('');live();failover();setInterval(fleet,15000);setInterval(live,8000);setInterval(failover,10000);
</script></body></html>`;

server.listen(PORT, HOST, () => {
  console.log(`hermes-dashboard: http://${HOST === '0.0.0.0' ? os.hostname() + '.local' : HOST}:${PORT}`);
  console.log(`  reading sessions from ${PROJECTS}`);
});
