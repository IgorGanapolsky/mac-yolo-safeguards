'use strict';

/**
 * The person's foreground work keeps the Mac. An agent build waits when that
 * work is in front and the machine is hot, then it may start later.
 *
 * Unknown foreground, unreadable load, and a quiet machine stay out of the way.
 * This module never signals a process. The only effects are admit and defer.
 */

const HEADROOM_RATIO = 0.85;

const HUMAN_FRONT = new Set([
  'Xcode',
  'Cursor',
  'Code',
  'Google Chrome',
  'Safari',
  'Arc',
  'Dia',
  'Dayglass',
  'Mail',
  'Microsoft Outlook',
  'Slack',
  'zoom.us',
  'Figma',
  'Notes',
  'Finder',
  'Messages',
  'Microsoft Teams',
  'Preview',
  'Gemini',
  'Claude',
  'Codex',
  'ChatGPT',
  'Ghostty',
  'Terminal',
  'iTerm2',
  'Warp',
  'Alacritty',
  'kitty',
]);

const AGENT_MARKS = [
  '/.local/bin/claude',
  '/claude.app/',
  '/.codex/',
  '/.local/bin/grok',
  '/.local/bin/pool',
  '/.hermes/',
  'cursor-relay',
  'cursor-agent',
  'opencode',
];

const PROTECTED_MARKS = [
  'Xcode.app',
  'Dayglass.app',
  'dayglass serve',
  '-m dayglass',
  'WindowServer',
  'kernel_task',
];

const YIELD_BASE = new Set([
  'cargo',
  'rustc',
  'rustdoc',
  'pytest',
  'tsc',
  'esbuild',
  'swift-frontend',
]);

const BUILD_ARG_TOKENS = [
  'pytest',
  'vitest',
  'jest',
  'webpack',
  'tsc',
  'vite build',
  'next build',
  'swift build',
];

const WAIT_BASE = new Set(['cargo', 'rustc', 'rustdoc', 'pytest', 'tsc', 'esbuild']);

function decide(frontmost, load1, ncpu) {
  if (typeof frontmost !== 'string' || frontmost.length === 0) return 'clear';
  if (!HUMAN_FRONT.has(frontmost)) return 'clear';
  if (typeof load1 !== 'number' || !Number.isFinite(load1)) return 'clear';
  if (typeof ncpu !== 'number' || !Number.isFinite(ncpu) || ncpu < 1) return 'clear';
  if (load1 < ncpu * HEADROOM_RATIO) return 'clear';
  return 'yield';
}

function gate(loadDecision, inBlock, urgent) {
  if (loadDecision === 'yield') return 'yield';
  if (inBlock === true && urgent !== true) return 'yield';
  return 'clear';
}

function clock(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(':');
  if (parts.length !== 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour > 23 || minute > 59 || hour < 0 || minute < 0) return null;
  return { hour, minute };
}

function overrideZone(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let inOverride = false;
  let raw = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## Override')) {
      inOverride = true;
      continue;
    }
    if (inOverride && line.startsWith('## ')) break;
    if (inOverride && line.startsWith('zone:')) {
      raw = line.slice('zone:'.length).trim();
      break;
    }
  }
  if (!raw || !raw.includes('-')) return null;
  const splitAt = raw.indexOf('-');
  const start = clock(raw.slice(0, splitAt));
  const end = clock(raw.slice(splitAt + 1));
  if (!start || !end) return null;
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  if (endMin <= startMin) return null;
  return { start, end };
}

function inFocusBlock(now, start, end, hours) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  if (!start || !end) return false;
  const spanHours = typeof hours === 'number' && Number.isFinite(hours) ? hours : 3;
  const zoneStart = new Date(now.getTime());
  zoneStart.setHours(start.hour, start.minute, 0, 0);
  const zoneEnd = new Date(now.getTime());
  zoneEnd.setHours(end.hour, end.minute, 0, 0);
  const span = zoneEnd.getTime() - zoneStart.getTime();
  if (span <= 0) return false;
  const block = Math.min(spanHours * 60 * 60 * 1000, span);
  const at = now.getTime();
  return at >= zoneStart.getTime() && at < zoneStart.getTime() + block;
}

function basename(comm) {
  const text = String(comm || '');
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return slash === -1 ? text : text.slice(slash + 1);
}

function isBuild(proc) {
  if (!proc || typeof proc !== 'object') return false;
  const base = basename(proc.comm);
  if (YIELD_BASE.has(base) || base.toLowerCase() === 'pytest') return true;
  if (base === 'node' || base.toLowerCase().startsWith('python')) {
    const hay = String(proc.args || '').toLowerCase();
    return BUILD_ARG_TOKENS.some((token) => hay.includes(token));
  }
  return false;
}

function classify(proc, byPid) {
  if (!proc || !Number.isInteger(proc.pid) || proc.pid <= 1 || !isBuild(proc)) return 'ignore';
  const parents = byPid instanceof Map ? byPid : new Map();
  let pid = proc.ppid;
  const seen = new Set();
  let owned = false;
  while (Number.isInteger(pid) && pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    const parent = parents.get(pid);
    if (!parent) break;
    const blob = `${parent.comm || ''} ${parent.args || ''}`;
    if (PROTECTED_MARKS.some((mark) => blob.includes(mark))) return 'protected';
    if (AGENT_MARKS.some((mark) => blob.includes(mark))) owned = true;
    pid = parent.ppid;
  }
  return owned ? 'yield' : 'ignore';
}

function selectTargets(procs, skip) {
  if (!Array.isArray(procs)) return [];
  const byPid = new Map();
  for (const proc of procs) {
    if (proc && Number.isInteger(proc.pid)) byPid.set(proc.pid, proc);
  }
  const skipSet = new Set(Array.isArray(skip) ? skip : []);
  const chosen = [];
  for (const proc of procs) {
    if (!proc || skipSet.has(proc.pid)) continue;
    if (classify(proc, byPid) === 'yield') chosen.push(proc);
  }
  return chosen;
}

function planTick(decision, procs, heldIds, skip) {
  const held = [...new Set((Array.isArray(heldIds) ? heldIds : []).filter((id) => Number.isInteger(id) && id > 1))].sort((a, b) => a - b);
  const ours = new Set(selectTargets(procs, skip).map((proc) => proc.pid));
  if (decision !== 'yield') {
    return { wait: [], ready: held.filter((id) => ours.has(id)) };
  }
  return {
    wait: [...ours].filter((id) => !held.includes(id)).sort((a, b) => a - b),
    ready: [],
  };
}

function commandMayWait(cmd) {
  const text = String(cmd || '').trim().toLowerCase();
  if (!text) return false;
  const base = basename(text.split(/\s+/)[0]);
  if (WAIT_BASE.has(base)) return true;
  return BUILD_ARG_TOKENS.some((token) => text.includes(token));
}

function fmt(load1) {
  return Number.isFinite(load1) ? load1.toFixed(1) : '?';
}

function explain(action, front, load1, ncpu, becauseBlock, cmd) {
  if (action === 'defer' && becauseBlock) return 'a focus block is on, so this build waits';
  if (action === 'defer') return `${front} has the machine (load ${fmt(load1)} of ${ncpu})`;
  if (!commandMayWait(cmd)) return `${cmd || 'this command'} is not an agent build, staying out of the way`;
  if (typeof front !== 'string' || front.length === 0) return 'foreground unknown, staying out of the way';
  if (!HUMAN_FRONT.has(front)) return `${front} is not foreground work, staying out of the way`;
  if (typeof load1 !== 'number' || !Number.isFinite(load1) || typeof ncpu !== 'number' || !Number.isFinite(ncpu) || ncpu < 1) {
    return 'pressure unreadable, staying out of the way';
  }
  return `headroom available (load ${fmt(load1)} of ${ncpu}, ${front})`;
}

function verdict(input) {
  const src = input && typeof input === 'object' ? input : {};
  const front = typeof src.front === 'string' ? src.front : '';
  const load1 = typeof src.load1 === 'number' ? src.load1 : NaN;
  const ncpu = typeof src.ncpu === 'number' ? src.ncpu : NaN;
  const cmd = typeof src.cmd === 'string' ? src.cmd : '';
  const loadDecision = decide(front, load1, ncpu);
  const gated = gate(loadDecision, src.block === true, src.urgent === true);
  const action = commandMayWait(cmd) && gated === 'yield' ? 'defer' : 'admit';
  const becauseBlock = action === 'defer' && loadDecision !== 'yield';
  return {
    action,
    reason: explain(action, front, load1, ncpu, becauseBlock, cmd),
  };
}

module.exports = {
  AGENT_MARKS,
  BUILD_ARG_TOKENS,
  HEADROOM_RATIO,
  HUMAN_FRONT,
  PROTECTED_MARKS,
  WAIT_BASE,
  YIELD_BASE,
  classify,
  commandMayWait,
  decide,
  explain,
  gate,
  inFocusBlock,
  isBuild,
  overrideZone,
  planTick,
  selectTargets,
  verdict,
};
