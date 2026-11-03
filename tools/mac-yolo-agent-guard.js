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
 *   clean      stop process storms and extra copies of orphaned MCP servers (dry run unless
 *              --execute); live sessions and the MCP servers and hooks they launched are never touched
 *   blame      memory by owner (agent or app), measured as physical footprint, biggest first
 *   pressure   memory pressure verdict, swap read-back rate included; when not normal, the
 *              same cleanup (dry run unless --execute). The watch loop checks every minute,
 *              stops stranded agents at warn, and stops storms only after two criticals.
 *   watch      tracer: when 2+ Claude processes vanish in one tick, save what was running,
 *              what had just started, and any pkill/killall calls the shims logged
 *   incidents  list saved kill incidents
 *   kill-check what the pkill/killall shims ask before every call: exit 3 refuses a kill of a
 *              live agent, or of anything it launched, from outside that agent's process tree
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
const ORPHAN_MIN_AGE_SEC = 600;
const PRESSURE_CHECK_TICKS = 60;
const RELIEVE_COOLDOWN_MS = 10 * 60 * 1000;
const PRESSURE_LOG = path.join(LOG_DIR, 'pressure.jsonl');
// 2026-11-03: the Mac froze with the kernel level normal and 71% free, while it read
// 155-400 pages a second back from swap (load average 46 on 18 cores, CPU 77% idle).
// A freeze is the read-back rate, not how much sits in swap.
const SWAPIN_WARN_PER_SEC = 256;
const SWAPIN_CRITICAL_PER_SEC = 1024;
const STRANDED_MIN_IDLE_SEC = 30 * 60;
const IDLE_SESSION_MIN_SEC = 2 * 3600;
// process.execPath points into a versioned Homebrew Cellar folder that an upgrade deletes.
const STABLE_NODE = ['/opt/homebrew/bin/node', '/usr/local/bin/node'].find((p) => fs.existsSync(p)) || process.execPath;

// Never signal Electron/Chromium helpers, installed apps, terminals, transports, or local
// inference. Only apps under /Applications and /System count as apps: Homebrew's Python
// also runs from a Python.app bundle, and the 2026-11-01 storm ran under it. macOS's own
// services under /System, /usr/libexec and /sbin run dozens of identical copies by design.
const NEVER_RE = /^\/(System|usr\/libexec|usr\/sbin|sbin)\/|^\/Applications\/.*?\.app\/Contents\/|Helper|Renderer|WindowServer|sshd|Tailscale|tailscaled|Terminal|ghostty|Finder|Dock|llama-server|ollama|Ollama|litellm/;
const KILLER_RE = /(^|[/ ])(pkill|killall|kill)( |$)|osascript.*\bquit\b|launchctl +(bootout|kickstart +-k|kill)/;

function classify(command) {
  if (/claude-code\/[^/]+\/[^/]+\/claude\.app\/Contents\/MacOS\/claude( |$)/.test(command)) return 'claude-session';
  if (/(^|\/)claude mcp serve/.test(command)) return 'claude-mcp-serve';
  if (/(^|\/)claude(\.exe)?( |$)/.test(command)) return 'claude-cli';
  if (/(^|\/)codex( |$)/.test(command)) return 'codex';
  if (/cursor-agent|(^|\/)agent .*cursor/i.test(command)) return 'cursor-agent';
  if (/(^|\/)grok(\.real)?( |$)/.test(command)) return 'grok';
  if (/(^|\/)pool(\.real)?( |$)/.test(command)) return 'poolside';
  if (/\/Gemini\.app\/Contents\/Helpers\/agy( |$)/.test(command)) return 'gemini-agent';
  if (/(^|\/)omp( |$)/.test(command)) return 'omp';
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
    kind === 'grok' ||
    kind === 'poolside' ||
    kind === 'gemini-agent' ||
    kind === 'omp' ||
    /^\/Applications\/Claude\.app\/Contents\/MacOS\/Claude( |$)/.test(command) ||
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

function indexByPid(procs) {
  return new Map(procs.map((p) => [p.pid, p]));
}

// The nearest live agent session above this process, at most maxHops parents up.
function liveAgentAncestor(proc, byPid, maxHops = Infinity) {
  let cur = byPid.get(proc.ppid);
  for (let hops = 1; cur && hops <= maxHops && cur.pid > 1; hops += 1) {
    if (isLiveAgentProcess(cur.command)) return cur;
    cur = byPid.get(cur.ppid);
  }
  return null;
}

// MCP servers and hooks a live session launched (directly, or through npx/uvx/a shell).
// Killing one breaks that session's tools mid-task, so reapers must leave them alone.
// The 2026-11-01 storm nested hundreds of levels deep, so three hops never reaches it.
const DEPENDENCY_HOPS = 3;
function isAgentDependency(proc, byPid) {
  return Boolean(liveAgentAncestor(proc, byPid, DEPENDENCY_HOPS));
}

// An MCP server whose session is gone: launchd adopted it (ppid 1) and no LaunchAgent
// runs it. One copy of each may be a server someone started on purpose with nohup, so
// only extra copies of the same command line count, and the newest copy is kept.
function findOrphanMcpServers(procs, { launchdPids = new Set(), minAgeSec = ORPHAN_MIN_AGE_SEC } = {}) {
  const groups = new Map();
  for (const p of procs) {
    if (p.ppid !== 1 || launchdPids.has(p.pid) || p.ageSec < minAgeSec) continue;
    if (p.kind !== 'mcp-server' && p.kind !== 'claude-mcp-serve') continue;
    if (isProtected(p)) continue;
    if (!groups.has(p.command)) groups.set(p.command, []);
    groups.get(p.command).push(p);
  }
  const orphans = [];
  for (const members of groups.values()) {
    members.sort((a, b) => a.ageSec - b.ageSec);
    orphans.push(...members.slice(1));
  }
  return orphans;
}

// One agent running several copies of the same MCP server: Codex starts a full set per
// thread, so seven open threads hold seven copies of every server. Report only; these
// belong to a live agent and are never signalled.
const FANOUT_MIN_COPIES = 3;
function findMcpFanOut(procs, minCopies = FANOUT_MIN_COPIES) {
  const byPid = indexByPid(procs);
  const groups = new Map();
  for (const p of procs) {
    if (p.kind !== 'mcp-server' && p.kind !== 'claude-mcp-serve') continue;
    const agent = liveAgentAncestor(p, byPid, DEPENDENCY_HOPS);
    if (!agent) continue;
    const key = `${agent.pid}\0${p.command}`;
    if (!groups.has(key)) groups.set(key, { agent, command: p.command, copies: 0, rssMB: 0 });
    const g = groups.get(key);
    g.copies += 1;
    g.rssMB += p.rssMB;
  }
  return [...groups.values()]
    .filter((g) => g.copies >= minCopies)
    .map((g) => ({ agentPid: g.agent.pid, agent: g.agent.command.slice(0, 120), command: g.command.slice(0, 160), copies: g.copies, rssMB: g.rssMB }))
    .sort((a, b) => b.rssMB - a.rssMB);
}

function launchdJobPids() {
  try {
    const out = execFileSync('/bin/launchctl', ['list'], { encoding: 'utf8' });
    return new Set(out.split('\n').map((l) => Number(l.split('\t')[0])).filter((n) => n > 0));
  } catch {
    return new Set();
  }
}

// A storm is one command line running in many copies at once — a wrapper that
// re-invokes itself, or a retry loop with no backoff. Live sessions and the tools
// they launched never count.
function findStorms(procs, minCopies = STORM_MIN_COPIES) {
  const byPid = indexByPid(procs);
  const groups = new Map();
  for (const p of procs) {
    if (isProtected(p) || isAgentDependency(p, byPid)) continue;
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

// Cumulative paging counters from vm_stat. Two readings give a rate.
function parseVmStat(text, at = Date.now()) {
  const num = (label) => {
    const m = text.match(new RegExp(`^${label}:\\s+(\\d+)`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const size = text.match(/page size of (\d+) bytes/);
  return { at, pageSize: size ? Number(size[1]) : 16384, swapins: num('Swapins'), swapouts: num('Swapouts'), decompressions: num('Decompressions') };
}

function readVmCounters() {
  try {
    return parseVmStat(execFileSync('/usr/bin/vm_stat', { encoding: 'utf8', timeout: 5000 }));
  } catch {
    return null;
  }
}

// Pure. Per-second paging between two vm_stat readings.
function pagingRates(prev, cur) {
  if (!prev || !cur || prev.swapins === null || cur.swapins === null) return null;
  const seconds = (cur.at - prev.at) / 1000;
  if (seconds <= 0) return null;
  // Floor, so 255.5 pages a second stays under the 256 warn line.
  const perSec = (key) => Math.max(0, Math.floor((cur[key] - prev[key]) / seconds));
  const swapInsPerSec = perSec('swapins');
  return {
    seconds: Math.round(seconds),
    swapInsPerSec,
    swapInMBps: Number(((swapInsPerSec * cur.pageSize) / 1048576).toFixed(1)),
    swapOutsPerSec: perSec('swapouts'),
    decompressionsPerSec: perSec('decompressions'),
  };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// paging: rates the caller already measured (the watch loop's last minute). Without
// them, take two vm_stat readings sampleMs apart.
function memorySnapshot({ paging, sampleMs = 2000 } = {}) {
  if (paging === undefined) {
    const first = readVmCounters();
    sleepMs(sampleMs);
    paging = pagingRates(first, readVmCounters());
  }
  const read = (key) => {
    try {
      return execFileSync('/usr/sbin/sysctl', ['-n', key], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  const swap = read('vm.swapusage').match(/total = ([\d.]+)M\s+used = ([\d.]+)M/);
  // os.freemem() counts only never-used pages, which macOS keeps near zero on purpose.
  // memory_pressure's figure counts what the kernel could hand out right now.
  let freeMemoryPct = null;
  try {
    const out = execFileSync('/usr/bin/memory_pressure', ['-Q'], { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/free percentage: (\d+)%/);
    if (m) freeMemoryPct = Number(m[1]);
  } catch {
    freeMemoryPct = Number(((os.freemem() / os.totalmem()) * 100).toFixed(1));
  }
  return {
    pressureLevel: Number(read('kern.memorystatus_vm_pressure_level')) || null,
    swapUsedMB: swap ? Math.round(Number(swap[2])) : null,
    swapUsedPct: swap ? Math.round((Number(swap[2]) * 100) / Number(swap[1])) : null,
    ramMB: Math.round(os.totalmem() / 1048576),
    freeMemoryPct,
    paging,
  };
}

// Pure. The kernel's level (1 normal, 2 warn, 4 critical) and a low free figure raise the
// level, and so does reading pages back from swap fast: that is what freezes apps, and the
// kernel can report normal while it happens. Swap size alone is never pressure, because
// macOS adds swap files as it needs them and leaves cold pages there.
function assessPressure(memory) {
  const reasons = [];
  let level = 'normal';
  const raise = (to, why) => {
    reasons.push(why);
    if (to === 'critical' || level === 'normal') level = to;
  };
  if (memory.pressureLevel === 4) raise('critical', 'kernel reports critical memory pressure');
  else if (memory.pressureLevel === 2) raise('warn', 'kernel reports memory pressure warning');
  if (memory.freeMemoryPct !== null && memory.freeMemoryPct < 10) raise('critical', `only ${memory.freeMemoryPct}% memory free`);
  else if (memory.freeMemoryPct !== null && memory.freeMemoryPct < 20) raise('warn', `only ${memory.freeMemoryPct}% memory free`);
  const paging = memory.paging;
  if (paging) {
    const swapping = `reading ${paging.swapInMBps} MB/s back from swap (${paging.swapInsPerSec} pages/s over ${paging.seconds}s)`;
    if (paging.swapInsPerSec >= SWAPIN_CRITICAL_PER_SEC) raise('critical', swapping);
    else if (paging.swapInsPerSec >= SWAPIN_WARN_PER_SEC) raise('warn', swapping);
  }
  if (memory.swapUsedMB !== null && memory.ramMB && memory.swapUsedMB > memory.ramMB * 0.75) {
    reasons.push(`${memory.swapUsedMB} MB in swap on ${memory.ramMB} MB of RAM`);
  }
  return { level, reasons };
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

const AGENT_NAMES = {
  'claude-session': 'Claude',
  'claude-cli': 'Claude',
  codex: 'Codex',
  'cursor-agent': 'Cursor',
  grok: 'Grok',
  poolside: 'Poolside',
  'gemini-agent': 'Gemini',
  omp: 'omp',
};

function ownerName(proc) {
  const app = proc.command.match(/^\/(?:System\/)?Applications\/(?:[^/]+\/)*?([^/]+)\.app\//);
  if (AGENT_NAMES[proc.kind]) return AGENT_NAMES[proc.kind];
  if (app) return app[1];
  return path.basename(proc.command.split(' ')[0]);
}

// Who a process's memory belongs to: the nearest live agent or installed app at or above
// it, else the process launchd started. MCP servers count toward the agent that launched
// them, renderers toward their browser, panes toward their terminal multiplexer.
function ownerOf(proc, byPid) {
  let cur = proc;
  for (let hops = 0; hops < 64; hops += 1) {
    if (AGENT_NAMES[cur.kind] || /^\/(System\/)?Applications\/.*?\.app\//.test(cur.command) || /\/Claude\.app\/Contents\//.test(cur.command)) return ownerName(cur);
    const parent = byPid.get(cur.ppid);
    if (!parent || parent.pid <= 1) return ownerName(cur);
    cur = parent;
  }
  return ownerName(proc);
}

// Physical footprint per pid, as Activity Monitor's Memory column shows it. RSS leaves out
// compressed and swapped pages, which on 2026-11-03 hid half of omp's and the browsers' memory.
function readFootprints() {
  try {
    const out = execFileSync('/usr/bin/top', ['-l', '1', '-o', 'mem', '-n', '5000', '-stats', 'pid,mem'], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
    return parseTopFootprints(out);
  } catch {
    return new Map();
  }
}

function parseTopFootprints(text) {
  const units = { B: 1 / 1048576, K: 1 / 1024, M: 1, G: 1024 };
  const out = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+([\d.]+)([BKMG])[+-]?\s*$/);
    if (m) out.set(Number(m[1]), Number(m[2]) * units[m[3]]);
  }
  return out;
}

// Pure. Memory by owner, biggest first, so the one to blame is named by share, not by
// which single process looks largest.
function blame(procs, footprints = new Map(), top = 8) {
  const byPid = indexByPid(procs);
  const owners = new Map();
  let totalMB = 0;
  for (const p of procs) {
    const mb = footprints.has(p.pid) ? footprints.get(p.pid) : p.rssMB;
    const name = ownerOf(p, byPid);
    const o = owners.get(name) || { owner: name, processes: 0, memoryMB: 0 };
    o.processes += 1;
    o.memoryMB += mb;
    owners.set(name, o);
    totalMB += mb;
  }
  const ranked = [...owners.values()]
    .map((o) => ({ ...o, memoryMB: Math.round(o.memoryMB), sharePct: totalMB ? Math.round((o.memoryMB * 100) / totalMB) : 0 }))
    .sort((a, b) => b.memoryMB - a.memoryMB);
  return { totalMB: Math.round(totalMB), measuredBy: footprints.size ? 'footprint' : 'rss', owners: ranked.slice(0, top) };
}

function readCpuTimes() {
  const out = new Map();
  try {
    const text = execFileSync('/bin/ps', ['-axo', 'pid=,time='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+([\d:-]+)(?:\.(\d+))?/);
      if (m) out.set(Number(m[1]), etimeToSeconds(m[2]) + Number(`0.${m[3] || 0}`));
    }
  } catch {
    // leave empty: nothing counts as idle without a reading
  }
  return out;
}

// Pure. For each pid, since when its CPU time has not moved. history is the previous result.
function trackIdle(history, cpuTimes, now = Date.now()) {
  const next = new Map();
  for (const [pid, cpu] of cpuTimes) {
    const prev = history.get(pid);
    next.set(pid, prev && prev.cpu === cpu ? prev : { cpu, since: now });
  }
  return next;
}

const STRANDABLE = new Set(['omp', 'grok', 'poolside', 'codex', 'claude-cli', 'cursor-agent']);

// Pure. A terminal agent nobody can reach: its terminal is gone (launchd adopted it, no tty),
// no LaunchAgent runs it, and it has used no CPU for 30 minutes. No person can be driving it.
// Claude desktop sessions are never in this list; the Claude app owns them. A process
// younger than the idle window reused an old pid, and an agent serving a socket
// (`codex app-server --listen ...`) still has clients even when its CPU is flat.
function findStrandedAgents(procs, idle, { now = Date.now(), launchdPids = new Set(), minIdleSec = STRANDED_MIN_IDLE_SEC } = {}) {
  return procs.filter((p) => {
    const since = idle.get(p.pid);
    return STRANDABLE.has(p.kind) && p.ppid === 1 && p.tty === '??' && !launchdPids.has(p.pid) && p.ageSec >= minIdleSec &&
      !/(^|\s)(app-server|--listen)(\s|=|$)/.test(p.command) && since && now - since.since >= minIdleSec * 1000;
  });
}

// Pure. Claude desktop sessions whose CPU time has not moved for two hours. Reported so the
// person can archive them in the Claude app; never signalled.
function findIdleSessions(procs, idle, { now = Date.now(), minIdleSec = IDLE_SESSION_MIN_SEC, footprints = new Map() } = {}) {
  return procs
    .filter((p) => p.kind === 'claude-session' && idle.get(p.pid) && now - idle.get(p.pid).since >= minIdleSec * 1000)
    .map((p) => ({ pid: p.pid, idleMin: Math.round((now - idle.get(p.pid).since) / 60000), memoryMB: Math.round(footprints.get(p.pid) || p.rssMB), session: (p.command.match(/--resume[= ]([0-9a-f-]{36})/) || [])[1] || null }));
}

function status(procs = listProcesses()) {
  const memory = memorySnapshot();
  return {
    ok: true,
    agents: summarizeAgents(procs),
    blame: blame(procs, readFootprints()),
    storms: findStorms(procs).map(({ pids, ...rest }) => rest),
    orphanMcpServers: findOrphanMcpServers(procs, { launchdPids: launchdJobPids() }).length,
    mcpFanOut: findMcpFanOut(procs),
    memory,
    pressure: assessPressure(memory),
    tracer: { running: tracerRunning(), shimsInstalled: shimsInstalled() },
    recentIncidents: listIncidents(5),
  };
}

function commandOf(pid) {
  try {
    return execFileSync('/bin/ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// A pid can be reused between the scan and the signal. Signal only if it still runs
// the command we decided to stop.
function signalIfSame(pid, command) {
  const now = commandOf(pid);
  return now !== null && now.startsWith(command.slice(0, 160)) && signal(pid, 'SIGTERM');
}

function signal(pid, sig) {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

// Stops storms, extra copies of orphaned MCP servers, and stranded agents (only the watch
// loop can name those, because it needs half an hour of CPU readings). Never apps,
// terminals, live sessions someone can reach, or anything a live session launched.
function clean({ execute = false, minCopies = STORM_MIN_COPIES, procs = listProcesses(), launchdPids = launchdJobPids(), stranded = [] } = {}) {
  const storms = findStorms(procs, minCopies);
  const orphans = findOrphanMcpServers(procs, { launchdPids });
  const summary = (p) => ({ pid: p.pid, rssMB: p.rssMB, ageSec: p.ageSec, command: p.command.slice(0, 160) });
  const orphanSummary = orphans.map(summary);
  const strandedSummary = stranded.map(summary);
  if (!execute) {
    return { ok: true, dryRun: true, wouldStop: storms.map(({ pids, ...rest }) => rest), wouldStopOrphans: orphanSummary, wouldStopStranded: strandedSummary };
  }
  const stopped = storms.map((s) => ({
    command: s.command,
    copies: s.copies,
    rssMB: s.rssMB,
    signalled: s.pids.filter((pid) => signalIfSame(pid, s.command)).length,
  }));
  const stoppedOrphans = orphanSummary.filter((o) => signalIfSame(o.pid, o.command));
  const stoppedStranded = strandedSummary.filter((o) => signalIfSame(o.pid, o.command));
  return { ok: true, dryRun: false, stopped, stoppedOrphans, stoppedStranded };
}

function notify(title, message) {
  try {
    execFileSync('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`], { stdio: 'ignore', timeout: 5000 });
  } catch {
    // no GUI session (CI, ssh)
  }
}

// What to do under memory pressure: say so, name who holds the memory, and stop storms,
// orphaned MCP copies and stranded agents. Apps and reachable sessions are the person's
// call, so they are only named, never closed.
function relieve({ execute = false, memory = memorySnapshot(), procs = listProcesses(), stranded = [], idleSessions = [], footprints = readFootprints() } = {}) {
  const pressure = assessPressure(memory);
  if (pressure.level === 'normal') return { ok: true, pressure, acted: false };
  const result = clean({ execute, procs, stranded });
  const owners = blame(procs, footprints, 5).owners;
  const entry = { at: new Date().toISOString(), pressure, memory, execute, ...result, owners, idleSessions };
  if (execute) logPressure(entry);
  return { ...entry, acted: true };
}

function logPressure(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(PRESSURE_LOG, `${JSON.stringify(entry)}\n`);
  } catch {
    // logging is best effort
  }
}

// Pure. What one pressure check does. Acting runs on every non-normal check, so the second
// critical in a row stops storms at once; only the notification waits out the cooldown.
function pressureActions({ level, criticalChecks, now, lastNotice, stopStranded = false }) {
  if (level === 'normal') return { act: false, stopStorms: false, stopStranded: false, notify: false };
  return { act: true, stopStorms: criticalChecks >= 2, stopStranded, notify: now - lastNotice >= RELIEVE_COOLDOWN_MS };
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
  // One session ending takes its wrapper and its children with it. Count only the
  // processes whose parent did not vanish too, so a session that finished normally
  // is one, and a kill that hits several sessions at once is several.
  const gone = new Set(vanished.map((p) => p.pid));
  const independent = vanished.filter((p) => !gone.has(p.ppid)).length;
  if (independent < minVanished && !(independent && shimCalls.length)) return null;

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
      const memory = memorySnapshot({ paging: pagingRates(lastCounters, readVmCounters()) });
      // Reapers log after they finish signalling, so read their logs a moment later.
      setTimeout(() => {
        incident.reaperHits = reaperHits(incident.vanished.map((p) => p.pid));
        const file = saveIncident(incident, memory);
        console.log(`${incident.at} ${incident.vanished.length} Claude processes vanished together -> ${file}`);
      }, 2000);
    }
    ring.push(current);
    if (ring.length > WATCH_RING_TICKS) ring.shift();
    ticks += 1;
    if (ticks % PRESSURE_CHECK_TICKS !== 0) return;
    // Every minute: paging rate over that minute, and which processes have stopped using CPU.
    const counters = readVmCounters();
    const memory = memorySnapshot({ paging: pagingRates(lastCounters, counters) });
    lastCounters = counters;
    idle = trackIdle(idle, readCpuTimes(), now);
    const pressure = assessPressure(memory);
    // The level is bursty: act on critical only when two checks in a row agree.
    criticalChecks = pressure.level === 'critical' ? criticalChecks + 1 : 0;
    const actions = pressureActions({ level: pressure.level, criticalChecks, now, lastNotice, stopStranded: stopsStranded() });
    if (!actions.act) return;
    const launchdPids = launchdJobPids();
    // Footprints cost a full `top` run, so take them only when a notification will name owners.
    const footprints = actions.notify ? readFootprints() : new Map();
    // Stranded agents have no terminal and no CPU use for half an hour, but an idle agent may
    // still be waiting on the network, so they are only named unless the person opted in.
    // Storms and orphan copies wait for two criticals.
    const stranded = findStrandedAgents(current, idle, { now, launchdPids });
    const idleSessions = findIdleSessions(current, idle, { now, footprints });
    const result = relieve({ execute: actions.stopStorms, memory, procs: current, idleSessions, footprints });
    const strandedResult = clean({ execute: actions.stopStranded, procs: [], launchdPids, stranded });
    if (strandedResult.stoppedStranded && strandedResult.stoppedStranded.length) {
      logPressure({ at: new Date(now).toISOString(), pressure, stoppedStranded: strandedResult.stoppedStranded });
    }
    const stopped = (result.stopped || []).reduce((s, x) => s + x.signalled, 0) + (result.stoppedOrphans || []).length + (strandedResult.stoppedStranded || []).length;
    const holders = result.owners.slice(0, 3).map((o) => `${o.owner} ${(o.memoryMB / 1024).toFixed(1)} GB (${o.sharePct}%)`).join(', ');
    const strandedNote = strandedResult.wouldStopStranded && strandedResult.wouldStopStranded.length ? ` ${strandedResult.wouldStopStranded.length} terminal agents look stranded (no terminal, idle 30 min): PIDs ${strandedResult.wouldStopStranded.map((x) => x.pid).join(', ')}.` : '';
    const idleNote = idleSessions.length ? ` ${idleSessions.length} Claude sessions idle 2h+ (${(idleSessions.reduce((s, x) => s + x.memoryMB, 0) / 1024).toFixed(1)} GB): archive them in Claude.` : '';
    if (!actions.notify && !stopped) return;
    lastNotice = now;
    notify('Mac YOLO: memory ' + pressure.level, `${pressure.reasons.join('; ')}. Most memory: ${holders}.${strandedNote}${idleNote}${stopped ? ` Stopped ${stopped} runaway or stranded processes.` : ''}`);
    console.log(`${new Date(now).toISOString()} memory ${pressure.level}: ${pressure.reasons.join('; ')}; holders ${holders}; idle sessions ${idleSessions.length}; stopped ${stopped}`);
  };
  let ticks = 0;
  let lastNotice = 0;
  let criticalChecks = 0;
  let lastCounters = readVmCounters();
  let idle = new Map();
  tick();
  setInterval(tick, intervalMs);
}

// Stopping stranded agents is opt-in (AGENTS.md: killing processes the person didn't name
// needs consent). `MAC_YOLO_STOP_STRANDED=1 ... install` writes that consent into the plist.
function stopsStranded(env = process.env) {
  return env.MAC_YOLO_STOP_STRANDED === '1';
}

// The live agent, or the Claude app, that owns this process: the nearest one at or above it.
function agentOwner(proc, byPid) {
  for (let cur = proc, hops = 0; cur && cur.pid > 1 && hops < 64; cur = byPid.get(cur.ppid), hops += 1) {
    if (isLiveAgentProcess(cur.command) || /^\/Applications\/Claude\.app\/Contents\/MacOS\/Claude( |$)/.test(cur.command)) return cur;
  }
  return null;
}

function ancestry(pid, byPid) {
  const chain = new Set();
  for (let cur = byPid.get(pid), hops = 0; cur && hops < 64; cur = byPid.get(cur.ppid), hops += 1) chain.add(cur.pid);
  return chain;
}

// Pure. A kill from outside an agent's process tree may not touch that agent, or the
// MCP servers and hooks it launched. 2026-11-01 17:00:55Z: another agent ran
// `pkill -f "python.*dayglass-mcp"` and took down the Claude app's Dayglass server.
function decideKill(targetPids, callerPid, byPid) {
  const callerChain = ancestry(callerPid, byPid);
  const blocked = [];
  for (const pid of targetPids) {
    if (callerChain.has(pid)) continue;
    const proc = byPid.get(pid);
    const owner = proc && agentOwner(proc, byPid);
    if (owner && !callerChain.has(owner.pid)) {
      blocked.push({ pid, command: proc.command.slice(0, 120), owner: owner.command.slice(0, 120) });
    }
  }
  return { refuse: blocked.length > 0, blocked };
}

// Pure. What the real pkill or killall would match, as pgrep arguments or killall names.
function killTargets(tool, args, procs, pgrep) {
  if (tool === 'pkill') {
    // pkill's own options: a leading -SIGNAL, and -I (ask first). pgrep takes the rest.
    const pgrepArgs = args.filter((a, i) => !(i === 0 && /^-(\d+|[A-Z][A-Z0-9]*)$/.test(a)) && a !== '-I');
    return pgrep(pgrepArgs);
  }
  const names = [];
  let regex = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-m') regex = true;
    else if (['-u', '-t', '-c', '-s'].includes(a)) i += 1;
    else if (!a.startsWith('-')) names.push(a);
  }
  // killall -m patterns go to pgrep, which matches process names with the same regex rules; -a keeps ancestors, as killall does.
  if (regex) return [...new Set(names.flatMap((n) => pgrep(['-a', n])))];
  const exe = (p) => path.basename(p.command.split(' ')[0]);
  return procs.filter((p) => names.includes(exe(p))).map((p) => p.pid);
}

function runPgrep(args) {
  try {
    return execFileSync('pgrep', args, { encoding: 'utf8' }).split('\n').map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

// Called by the shims before every pkill/killall. Exit 0 lets the kill run; 3 refuses it.
function killCheck(tool, callerPid, args, env = process.env) {
  if (env.MAC_YOLO_ALLOW_AGENT_KILL === '1') return { refuse: false, blocked: [], override: true };
  const procs = listProcesses();
  const byPid = indexByPid(procs);
  const mine = ancestry(callerPid, byPid);
  mine.add(process.pid);
  const targets = killTargets(tool, args, procs, runPgrep).filter((pid) => !mine.has(pid));
  return decideKill(targets, callerPid, byPid);
}

function shimScript(realBinary, { logDir = LOG_DIR, guardScript = path.join(INSTALL_DIR, 'mac-yolo-agent-guard.js'), node = STABLE_NODE } = {}) {
  const tool = path.basename(realBinary);
  const log = path.join(logDir, 'kill-calls.log');
  return `#!/bin/bash
# Mac YOLO agent guard shim: log who asked, refuse to kill a live agent or anything it
# launched unless the caller is that agent (MAC_YOLO_ALLOW_AGENT_KILL=1 overrides),
# then run the real ${tool} with the same arguments.
tool="$(/usr/bin/basename "$0")"
{
  line="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ) $tool pid=$$ args=$*"
  p=$PPID
  for _ in 1 2 3 4 5 6; do
    [ -z "$p" ] || [ "$p" = 0 ] && break
    line="$line <- $p:$(/bin/ps -o command= -p "$p" 2>/dev/null | /usr/bin/cut -c1-160)"
    p=$(/bin/ps -o ppid= -p "$p" 2>/dev/null | /usr/bin/tr -d ' ')
  done
  /bin/mkdir -p "${logDir}"
  echo "$line" >> "${log}"
} 2>/dev/null
if [ -x "${node}" ] && [ -f "${guardScript}" ]; then
  verdict="$("${node}" "${guardScript}" kill-check "$tool" $$ "$@" 2>/dev/null)"
  if [ $? -eq 3 ]; then
    echo "$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ) REFUSED $tool pid=$$ args=$* $verdict" >> "${log}" 2>/dev/null
    echo "$tool: refused by Mac YOLO agent guard: a live agent owns a matching process. $verdict" >&2
    exit 1
  fi
fi
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
    <string>${STABLE_NODE}</string>
    <string>${scriptPath}</string>
    <string>watch</string>
  </array>
${stopsStranded() ? '  <key>EnvironmentVariables</key>\n  <dict><key>MAC_YOLO_STOP_STRANDED</key><string>1</string></dict>\n' : ''}  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>LowPriorityIO</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
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
  else if (cmd === 'pressure') print(relieve({ execute: rest.includes('--execute') }));
  else if (cmd === 'incidents') print({ ok: true, incidents: listIncidents(20) });
  else if (cmd === 'blame') print({ ok: true, ...blame(listProcesses(), readFootprints(), 12) });
  else if (cmd === 'kill-check') {
    const [tool, callerPid, ...args] = rest;
    const verdict = killCheck(tool, Number(callerPid), args);
    if (verdict.refuse) {
      console.log(verdict.blocked.map((b) => `${b.pid} (${b.command.slice(0, 60)}) belongs to ${b.owner.slice(0, 80)}`).join('; '));
      process.exit(3);
    }
  } else if (cmd === 'watch') watch();
  else if (cmd === 'install') print(install());
  else {
    console.error('usage: mac-yolo-agent-guard [status|blame|clean [--execute]|pressure [--execute]|incidents|watch|install]');
    process.exit(2);
  }
}

module.exports = {
  classify,
  isLiveAgentProcess,
  isAgentDependency,
  liveAgentAncestor,
  indexByPid,
  findOrphanMcpServers,
  assessPressure,
  parseVmStat,
  pagingRates,
  parseTopFootprints,
  blame,
  trackIdle,
  findStrandedAgents,
  stopsStranded,
  pressureActions,
  plist,
  findIdleSessions,
  relieve,
  signalIfSame,
  decideKill,
  killTargets,
  findMcpFanOut,
  killCheck,
  reaperHits,
  parsePs,
  findStorms,
  detectIncident,
  shimScript,
  status,
  clean,
  listIncidents,
};
