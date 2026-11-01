#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-agent-guard.js — keeps AI agent processes from starving the Mac,
 * and records who kills Claude Code sessions.
 *
 * 2026-11-01 incident: Claude Code sessions died with exit 143 (SIGTERM) at 10:22,
 * 10:31 and 11:03 — every claude process on the Mac in the same instant — while a
 * looping CLI wrapper piled up ~390 processes (6.4 GB). The HUD's "Free Agent RAM"
 * only shut down simulators, and nothing recorded who sent the signal. Without root,
 * macOS cannot name a signal's sender, so this guard does the next best thing:
 *
 *   status     agent processes by kind, process storms, recent kill incidents
 *   clean      stop process storms (dry run unless --execute); live sessions are never touched
 *   watch      tracer: when 2+ Claude processes vanish in one tick, save what was running,
 *              what had just started, and any pkill/killall calls the shims logged
 *   incidents  list saved kill incidents
 *   install    copy itself to ~/.local/share/mac-yolo-safeguards, load the watch LaunchAgent,
 *              and put pkill/killall shims in ~/.local/bin that log callers, then run the real tool
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const LOG_DIR = process.env.MAC_YOLO_AGENT_GUARD_DIR || path.join(HOME, 'Library', 'Logs', 'mac-yolo');
const INCIDENT_DIR = path.join(LOG_DIR, 'agent-kills');
const SHIM_LOG = path.join(LOG_DIR, 'kill-calls.log');
const INSTALL_DIR = path.join(HOME, '.local', 'share', 'mac-yolo-safeguards');
const SHIM_DIR = path.join(HOME, '.local', 'bin');
const LAUNCH_LABEL = 'com.igor.mac-yolo-agent-guard';
const REAPER_LOGS = [path.join(HOME, '.hermes', 'logs', 'mac-yolo-operations.jsonl')];

const STORM_MIN_COPIES = 40;
const WATCH_INTERVAL_MS = 1000;
const WATCH_RING_TICKS = 5;
const MIN_VANISHED = 2;

// Never signal Electron/Chromium helpers, installed apps, terminals, transports, or local
// inference. Only apps under /Applications and /System count as apps: Homebrew's Python
// also runs from a Python.app bundle, and the 2026-11-01 storm ran under it.
const NEVER_RE = /^\/(Applications|System)\/.*?\.app\/Contents\/|Helper|Renderer|WindowServer|sshd|Tailscale|tailscaled|Terminal|ghostty|Finder|Dock|llama-server|ollama|Ollama|litellm/;
const KILLER_RE = /(^|[/ ])(pkill|killall|kill)( |$)|osascript.*\bquit\b|launchctl +(bootout|kickstart +-k|kill)/;

function classify(command) {
  if (/claude-code\/[^/]+\/[^/]+\/claude\.app\/Contents\/MacOS\/claude( |$)/.test(command)) return 'claude-session';
  if (/(^|\/)claude mcp serve/.test(command)) return 'claude-mcp-serve';
  if (/(^|\/)claude(\.exe)?( |$)/.test(command)) return 'claude-cli';
  if (/(^|\/)codex( |$)/.test(command)) return 'codex';
  if (/cursor-agent|(^|\/)agent .*cursor/i.test(command)) return 'cursor-agent';
  if (/(python[0-9.]*|node)( |$).*mcp/i.test(command) || /(^|\/)[^ ]*mcp[^ /]*( |$)/i.test(command)) return 'mcp-server';
  return null;
}

// A process that is someone's live agent session, or the wrapper that owns its process
// group. Reapers must never signal these.
function isLiveAgentProcess(command) {
  const kind = classify(command);
  return (
    kind === 'claude-session' ||
    kind === 'claude-cli' ||
    kind === 'codex' ||
    kind === 'cursor-agent' ||
    /\/Claude\.app\/Contents\/Helpers\/disclaimer /.test(command)
  );
}

function isClaude(kind) {
  return kind === 'claude-session' || kind === 'claude-cli' || kind === 'claude-mcp-serve';
}

function etimeToSeconds(etime) {
  const [daysPart, clock] = etime.includes('-') ? etime.split('-') : [0, etime];
  const parts = clock.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  return Number(daysPart) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parsePs(text) {
  const procs = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const command = m[6];
    procs.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      rssMB: Math.round(Number(m[3]) / 1024),
      ageSec: etimeToSeconds(m[4]),
      tty: m[5],
      command,
      kind: classify(command),
    });
  }
  return procs;
}

function listProcesses() {
  const out = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,etime=,tty=,command='], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return parsePs(out).filter((p) => p.pid !== process.pid);
}

function isProtected(proc) {
  return isLiveAgentProcess(proc.command) || proc.tty !== '??' || NEVER_RE.test(proc.command);
}

// A storm is one command line running in many copies at once — a wrapper that
// re-invokes itself, or a retry loop with no backoff. Live sessions never count.
function findStorms(procs, minCopies = STORM_MIN_COPIES) {
  const groups = new Map();
  for (const p of procs) {
    if (isProtected(p)) continue;
    if (!groups.has(p.command)) groups.set(p.command, []);
    groups.get(p.command).push(p);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= minCopies)
    .map(([command, members]) => ({
      command: command.slice(0, 240),
      copies: members.length,
      rssMB: members.reduce((s, p) => s + p.rssMB, 0),
      newestAgeSec: Math.min(...members.map((p) => p.ageSec)),
      pids: members.map((p) => p.pid),
    }))
    .sort((a, b) => b.rssMB - a.rssMB);
}

function summarizeAgents(procs) {
  const byKind = {};
  for (const p of procs) {
    if (!p.kind) continue;
    byKind[p.kind] = byKind[p.kind] || { count: 0, rssMB: 0 };
    byKind[p.kind].count += 1;
    byKind[p.kind].rssMB += p.rssMB;
  }
  return byKind;
}

function memorySnapshot() {
  const read = (key) => {
    try {
      return execFileSync('/usr/sbin/sysctl', ['-n', key], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  const swap = read('vm.swapusage').match(/total = ([\d.]+)M\s+used = ([\d.]+)M/);
  return {
    pressureLevel: Number(read('kern.memorystatus_vm_pressure_level')) || null,
    swapUsedPct: swap ? Math.round((Number(swap[2]) * 100) / Number(swap[1])) : null,
    freeMemoryPct: Number(((os.freemem() / os.totalmem()) * 100).toFixed(1)),
  };
}

function listIncidents(limit = 10) {
  let files = [];
  try {
    files = fs.readdirSync(INCIDENT_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
  return files.slice(0, limit).map((f) => {
    const inc = JSON.parse(fs.readFileSync(path.join(INCIDENT_DIR, f), 'utf8'));
    return {
      file: path.join(INCIDENT_DIR, f),
      at: inc.at,
      vanished: inc.vanished.length,
      claudeAppAlive: inc.claudeAppAlive,
      suspects: inc.suspects.length,
      killedBy: (inc.reaperHits || []).map((h) => `${h.action} ${h.at}`),
      shimCalls: inc.shimCalls.length,
    };
  });
}

function status(procs = listProcesses()) {
  return {
    ok: true,
    agents: summarizeAgents(procs),
    storms: findStorms(procs).map(({ pids, ...rest }) => rest),
    memory: memorySnapshot(),
    tracer: { running: tracerRunning(), shimsInstalled: shimsInstalled() },
    recentIncidents: listIncidents(5),
  };
}

function signal(pid, sig) {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

function clean({ execute = false, minCopies = STORM_MIN_COPIES } = {}) {
  const storms = findStorms(listProcesses(), minCopies);
  if (!execute) {
    return { ok: true, dryRun: true, wouldStop: storms.map(({ pids, ...rest }) => rest) };
  }
  const stopped = storms.map((s) => ({
    command: s.command,
    copies: s.copies,
    rssMB: s.rssMB,
    signalled: s.pids.filter((pid) => signal(pid, 'SIGTERM')).length,
  }));
  return { ok: true, dryRun: false, stopped };
}

// Our own reapers log the pids they signal. If a vanished pid is in one of those
// logs, the incident names its killer outright.
function reaperHits(vanishedPids, logFiles = REAPER_LOGS) {
  const wanted = new Set(vanishedPids);
  const hits = [];
  for (const file of logFiles) {
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-50);
    } catch {
      continue;
    }
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const matched = (entry.reapedPids || []).filter((pid) => wanted.has(pid));
      if (matched.length) hits.push({ log: file, at: entry.timestamp, action: entry.action, pids: matched });
    }
  }
  return hits;
}

function recentShimCalls(sinceMs) {
  let text = '';
  try {
    text = fs.readFileSync(SHIM_LOG, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter(Boolean)
    .slice(-200)
    .filter((line) => Date.parse(line.slice(0, 20)) >= sinceMs - 1000);
}

// Pure: given the ring of earlier snapshots and the current one, decide whether
// Claude processes vanished together and, if so, build the incident record.
function detectIncident(ring, current, { minVanished = MIN_VANISHED, now = Date.now(), shimCalls = [] } = {}) {
  const prev = ring[ring.length - 1];
  if (!prev) return null;
  const alive = new Set(current.map((p) => p.pid));
  const vanished = prev.filter((p) => isClaude(p.kind) && !alive.has(p.pid));
  if (vanished.length < minVanished) return null;

  const seen = new Map();
  for (const snap of ring) for (const p of snap) seen.set(p.pid, p);
  const oldest = new Set(ring[0].map((p) => p.pid));
  const commandOf = (pid) => (seen.get(pid) || {}).command || null;
  const trim = (p) => ({ pid: p.pid, ppid: p.ppid, kind: p.kind, ageSec: p.ageSec, command: p.command.slice(0, 240) });

  return {
    at: new Date(now).toISOString(),
    vanished: vanished.map(trim),
    claudeAppAlive: current.some((p) => /\/Claude\.app\/Contents\/MacOS\/Claude( |$)/.test(p.command)),
    suspects: [...seen.values()]
      .filter((p) => KILLER_RE.test(p.command))
      .map((p) => ({ ...trim(p), parent: commandOf(p.ppid) })),
    recentlyStarted: [...seen.values()]
      .filter((p) => !oldest.has(p.pid))
      .slice(0, 60)
      .map((p) => ({ ...trim(p), parent: commandOf(p.ppid) })),
    shimCalls,
  };
}

function saveIncident(incident, memory) {
  fs.mkdirSync(INCIDENT_DIR, { recursive: true });
  const file = path.join(INCIDENT_DIR, `${incident.at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...incident, memory }, null, 2)}\n`);
  return file;
}

function watch({ intervalMs = WATCH_INTERVAL_MS, minVanished = MIN_VANISHED } = {}) {
  const ring = [];
  const tick = () => {
    let current;
    try {
      current = listProcesses();
    } catch (err) {
      console.error(`${new Date().toISOString()} ps failed: ${err.message}`);
      return;
    }
    const now = Date.now();
    const incident = detectIncident(ring, current, {
      minVanished,
      now,
      shimCalls: recentShimCalls(now - intervalMs * WATCH_RING_TICKS),
    });
    if (incident) {
      const memory = memorySnapshot();
      // Reapers log after they finish signalling, so read their logs a moment later.
      setTimeout(() => {
        incident.reaperHits = reaperHits(incident.vanished.map((p) => p.pid));
        const file = saveIncident(incident, memory);
        console.log(`${incident.at} ${incident.vanished.length} Claude processes vanished together -> ${file}`);
      }, 2000);
    }
    ring.push(current);
    if (ring.length > WATCH_RING_TICKS) ring.shift();
  };
  tick();
  setInterval(tick, intervalMs);
}

function shimScript(realBinary) {
  return `#!/bin/bash
# Mac YOLO agent guard shim: when asked to stop agent processes, log who asked,
# then run the real ${path.basename(realBinary)} with the same arguments.
case " $* " in
  *claude*|*Claude*|*node*|*codex*|*cursor*|*python*)
    {
      line="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ) ${path.basename(realBinary)} pid=$$ args=$*"
      p=$PPID
      for _ in 1 2 3 4 5 6; do
        [ -z "$p" ] || [ "$p" = 0 ] && break
        line="$line <- $p:$(/bin/ps -o command= -p "$p" 2>/dev/null | /usr/bin/cut -c1-160)"
        p=$(/bin/ps -o ppid= -p "$p" 2>/dev/null | /usr/bin/tr -d ' ')
      done
      /bin/mkdir -p "${LOG_DIR}"
      echo "$line" >> "${SHIM_LOG}"
    } 2>/dev/null
    ;;
esac
exec ${realBinary} "$@"
`;
}

function shimsInstalled() {
  return ['pkill', 'killall'].every((name) => {
    try {
      return fs.readFileSync(path.join(SHIM_DIR, name), 'utf8').includes('Mac YOLO agent guard shim');
    } catch {
      return false;
    }
  });
}

function tracerRunning() {
  try {
    return /"PID" = \d+/.test(execFileSync('/bin/launchctl', ['list', LAUNCH_LABEL], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return false;
  }
}

function plist(scriptPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${scriptPath}</string>
    <string>watch</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${path.join(LOG_DIR, 'agent-guard.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(LOG_DIR, 'agent-guard.log')}</string>
</dict>
</plist>
`;
}

function install() {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const scriptPath = path.join(INSTALL_DIR, 'mac-yolo-agent-guard.js');
  fs.copyFileSync(__filename, scriptPath);

  for (const [name, real] of [['pkill', '/usr/bin/pkill'], ['killall', '/usr/bin/killall']]) {
    const target = path.join(SHIM_DIR, name);
    if (fs.existsSync(target) && !fs.readFileSync(target, 'utf8').includes('Mac YOLO agent guard shim')) {
      throw new Error(`${target} exists and is not ours; leaving it alone`);
    }
    fs.writeFileSync(target, shimScript(real), { mode: 0o755 });
  }

  const plistPath = path.join(HOME, 'Library', 'LaunchAgents', `${LAUNCH_LABEL}.plist`);
  fs.writeFileSync(plistPath, plist(scriptPath));
  const domain = `gui/${process.getuid()}`;
  try {
    execFileSync('/bin/launchctl', ['bootout', `${domain}/${LAUNCH_LABEL}`], { stdio: 'ignore' });
  } catch {
    // not loaded yet
  }
  execFileSync('/bin/launchctl', ['bootstrap', domain, plistPath]);
  return { ok: true, scriptPath, plistPath, shims: [path.join(SHIM_DIR, 'pkill'), path.join(SHIM_DIR, 'killall')] };
}

if (require.main === module) {
  const [cmd = 'status', ...rest] = process.argv.slice(2);
  const print = (obj) => console.log(JSON.stringify(obj, null, 2));
  if (cmd === 'status') print(status());
  else if (cmd === 'clean') print(clean({ execute: rest.includes('--execute') }));
  else if (cmd === 'incidents') print({ ok: true, incidents: listIncidents(20) });
  else if (cmd === 'watch') watch();
  else if (cmd === 'install') print(install());
  else {
    console.error('usage: mac-yolo-agent-guard [status|clean [--execute]|incidents|watch|install]');
    process.exit(2);
  }
}

module.exports = {
  classify,
  isLiveAgentProcess,
  reaperHits,
  parsePs,
  findStorms,
  detectIncident,
  shimScript,
  status,
  clean,
  listIncidents,
};
