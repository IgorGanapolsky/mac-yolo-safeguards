#!/usr/bin/env node
'use strict';
/**
 * Lists the background jobs on this Mac and lets you pause, resume or stop them:
 * LaunchAgents in ~/Library/LaunchAgents, crontab lines, and loose scripts an agent left
 * running (python/node/bash loops). Jobs that open apps or web pages are flagged, because a
 * loop that reopens a browser every minute takes the Mac away from the person using it.
 *
 *   node tools/mac-yolo-jobs.js list
 *   node tools/mac-yolo-jobs.js pause  launchd:<label> | cron:<n>
 *   node tools/mac-yolo-jobs.js resume launchd:<label> | cron:<n>
 *   node tools/mac-yolo-jobs.js stop   script:<path> | launchd:<label>
 *
 * Every command prints one JSON object.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.MAC_YOLO_JOBS_HOME || os.homedir();
const AGENTS_DIR = path.join(HOME, 'Library', 'LaunchAgents');
const UID = process.getuid();
const DOMAIN = `gui/${UID}`;
const PAUSED_CRON = '#MACYOLO-PAUSED ';
const MIN_PROC_AGE_S = Number(process.env.MAC_YOLO_JOBS_MIN_AGE_S ?? 5 * 60);

const OPENER_PATTERNS = [
  /(^|[\s;&|(`$])open\s+(-[a-zA-Z]+\s+("[^"]*"|'[^']*'|\S+)\s+)*["']?https?:\/\//m,
  /(^|[\s;&|(`$])open\s+(-[gnFW]+\s+)*-a\s/m,
  /\[\s*["']open["']\s*,\s*["'](-a|-g|https?:)/,
  /\bwebbrowser\.open/,
  /tell application "[^"]+"[\s\S]{0,200}?\bactivate\b/,
  /\bshell\.openExternal\(/,
];

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, timeout: 10000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function opensApps(text) {
  return OPENER_PATTERNS.some((re) => re.test(text || ''));
}

function readSmall(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 512 * 1024) return '';
    return fs.readFileSync(file, 'utf8');
  } catch { return ''; }
}

// The files a command runs: the program itself if it is a script, plus any script argument.
function scriptFiles(argv) {
  return argv.filter((a) => a.startsWith('/') && /\.(sh|bash|zsh|py|js|mjs|cjs|rb|pl|applescript|scpt)$|\/bin\/|\/scripts?\//.test(a) && !/^\/(bin|usr|System)\//.test(a));
}

function commandOpensApps(argv) {
  if (opensApps(argv.join(' '))) return true;
  return scriptFiles(argv).some((f) => opensApps(readSmall(f)));
}

function describeSchedule(p) {
  if (typeof p.StartInterval === 'number') {
    const s = p.StartInterval;
    return s % 3600 === 0 ? `every ${s / 3600}h` : s % 60 === 0 ? `every ${s / 60} min` : `every ${s}s`;
  }
  if (p.StartCalendarInterval) return 'on a schedule';
  if (p.KeepAlive) return 'always running';
  if (p.WatchPaths || p.QueueDirectories) return 'when files change';
  if (p.RunAtLoad) return 'at login';
  return 'on demand';
}

// `launchctl list` lines: "<pid|->\t<status>\t<label>"
function parseLaunchctlList(text) {
  const map = {};
  for (const line of text.split('\n').slice(1)) {
    const [pid, status, label] = line.split('\t');
    if (label) map[label.trim()] = { pid: pid === '-' ? null : Number(pid), lastExit: Number(status) };
  }
  return map;
}

// `launchctl print-disabled gui/<uid>` lines: "\t"label" => disabled" (or true on older macOS)
function parseDisabled(text) {
  const set = new Set();
  const re = /"([^"]+)"\s*=>\s*(disabled|true)/g;
  let m;
  while ((m = re.exec(text))) set.add(m[1]);
  return set;
}

function parseEtime(s) {
  const m = String(s).trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3]) * 60 + (+m[4]);
}

function readPlist(file) {
  const r = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.out); } catch { return null; }
}

function launchAgents() {
  let files = [];
  try { files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.plist')); } catch { return []; }
  const loaded = parseLaunchctlList(run('/bin/launchctl', ['list']).out);
  const disabled = parseDisabled(run('/bin/launchctl', ['print-disabled', DOMAIN]).out);
  const jobs = [];
  for (const f of files) {
    const file = path.join(AGENTS_DIR, f);
    const p = readPlist(file);
    if (!p || !p.Label) continue;
    const argv = p.ProgramArguments || (p.Program ? [p.Program] : []);
    const state = loaded[p.Label];
    jobs.push({
      id: `launchd:${p.Label}`,
      kind: 'launchd',
      name: p.Label,
      command: argv.join(' '),
      schedule: describeSchedule(p),
      status: disabled.has(p.Label) ? 'paused' : state ? (state.pid ? 'running' : 'loaded') : 'not loaded',
      pid: state?.pid ?? null,
      opensApps: commandOpensApps(argv),
      plist: file,
    });
  }
  return jobs;
}

function cronLines() {
  const r = run('/usr/bin/crontab', ['-l']);
  if (r.code !== 0) return [];
  return r.out.split('\n');
}

function cronJobs() {
  const jobs = [];
  cronLines().forEach((line, i) => {
    const paused = line.startsWith(PAUSED_CRON);
    const body = paused ? line.slice(PAUSED_CRON.length) : line;
    if (!body.trim() || body.trim().startsWith('#') || /^\s*\w+=/.test(body)) return;
    const parts = body.trim().split(/\s+/);
    const at = parts[0].startsWith('@') ? parts.slice(0, 1) : parts.slice(0, 5);
    const cmd = parts.slice(at.length).join(' ');
    jobs.push({
      id: `cron:${i + 1}`,
      kind: 'cron',
      name: cmd.slice(0, 80),
      command: cmd,
      schedule: at.join(' '),
      status: paused ? 'paused' : 'scheduled',
      pid: null,
      opensApps: opensApps(cmd) || commandOpensApps(cmd.split(/\s+/)),
    });
  });
  return jobs;
}

// MCP servers belong to an open agent session; stopping one breaks that session.
const SKIP_SCRIPT = /node_modules|\.app\/|\/\.vscode|\/\.cursor\/extensions|\/extensions\/|shell-snapshots|mcp/i;
const SCRIPT_INTERPRETER = /(^|\/)(python[\d.]*|Python|node|bash|sh|zsh|ruby|perl|deno|bun|osascript)$/;

function looseScripts(launchdPids) {
  const r = run('/bin/ps', ['-axo', 'pid=,ppid=,etime=,uid=,command=']);
  const byScript = new Map();
  for (const line of r.out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, , etime, uid, command] = m;
    if (Number(uid) !== UID || Number(pid) === process.pid || launchdPids.has(Number(pid))) continue;
    const argv = command.split(/\s+/);
    if (!SCRIPT_INTERPRETER.test(argv[0])) continue;
    const script = argv.slice(1).find((a) => a.startsWith(HOME + '/') && /\.(py|js|mjs|cjs|sh|bash|zsh|rb|pl|applescript)$/.test(a));
    if (!script || SKIP_SCRIPT.test(script)) continue;
    if (parseEtime(etime) < MIN_PROC_AGE_S) continue;
    const job = byScript.get(script) || {
      id: `script:${script}`,
      kind: 'process',
      name: path.basename(script),
      command: command.slice(0, 300),
      schedule: `running for ${etime}`,
      status: 'running',
      pid: Number(pid),
      pids: [],
      opensApps: opensApps(command) || opensApps(readSmall(script)),
      script,
    };
    job.pids.push(Number(pid));
    if (job.pids.length > 1) job.schedule = `${job.pids.length} copies running`;
    byScript.set(script, job);
  }
  return [...byScript.values()];
}

function listJobs() {
  const launchd = launchAgents();
  const launchdPids = new Set(launchd.map((j) => j.pid).filter(Boolean));
  const all = [...launchd, ...cronJobs(), ...looseScripts(launchdPids)];
  const rank = (j) => (j.opensApps && j.status !== 'paused' ? 0 : 1);
  all.sort((a, b) => rank(a) - rank(b) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return all;
}

function find(id) {
  if (id.startsWith('launchd:')) return launchAgents().find((j) => j.id === id);
  if (id.startsWith('cron:')) return cronJobs().find((j) => j.id === id);
  if (id.startsWith('script:')) return looseScripts(new Set()).find((j) => j.id === id);
  return null;
}

function stopPid(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch (e) { if (e.code === 'ESRCH') return true; throw e; }
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    try { process.kill(pid, 0); } catch { return true; }
    spawnSync('/bin/sleep', ['0.1']);
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  return true;
}

function setCronPaused(n, paused) {
  const lines = cronLines();
  const i = n - 1;
  if (!lines[i]) throw new Error('That cron line no longer exists.');
  const isPaused = lines[i].startsWith(PAUSED_CRON);
  if (paused && !isPaused) lines[i] = PAUSED_CRON + lines[i];
  if (!paused && isPaused) lines[i] = lines[i].slice(PAUSED_CRON.length);
  const r = run('/usr/bin/crontab', ['-'], lines.join('\n').replace(/\n*$/, '\n'));
  if (r.code !== 0) throw new Error(r.err.trim() || 'crontab refused the change');
}

function act(action, id) {
  const job = find(id);
  if (!job) return { ok: false, id, problem: 'No such job right now. It may have already stopped.' };
  if (job.kind === 'launchd') {
    if (action === 'pause' || action === 'stop') {
      run('/bin/launchctl', ['bootout', `${DOMAIN}/${job.name}`]);
      if (action === 'pause') run('/bin/launchctl', ['disable', `${DOMAIN}/${job.name}`]);
      return { ok: true, id, action, message: action === 'pause' ? `${job.name} is paused and stays off after restart.` : `${job.name} is stopped until next login.` };
    }
    if (action === 'resume') {
      run('/bin/launchctl', ['enable', `${DOMAIN}/${job.name}`]);
      const r = run('/bin/launchctl', ['bootstrap', DOMAIN, job.plist]);
      const ok = r.code === 0 || /already|in progress/i.test(r.err);
      return { ok, id, action, message: ok ? `${job.name} is running again.` : r.err.trim() };
    }
  }
  if (job.kind === 'cron' && (action === 'pause' || action === 'resume')) {
    setCronPaused(Number(id.slice(5)), action === 'pause');
    return { ok: true, id, action, message: `Cron job ${action === 'pause' ? 'paused' : 'resumed'}.` };
  }
  if (job.kind === 'process' && action === 'stop') {
    for (const pid of job.pids) stopPid(pid);
    return { ok: true, id, action, message: `Stopped ${job.name} (${job.pids.length === 1 ? 'pid ' + job.pid : job.pids.length + ' copies'}). If an agent started it, that agent may start it again.` };
  }
  return { ok: false, id, problem: `Can't ${action} a ${job.kind} job.` };
}

function main(argv) {
  const [cmd, id] = argv;
  try {
    if (!cmd || cmd === 'list') {
      const jobs = listJobs();
      return { ok: true, jobs, opensApps: jobs.filter((j) => j.opensApps && j.status !== 'paused').length };
    }
    if (['pause', 'resume', 'stop'].includes(cmd) && id) return act(cmd, id);
    return { ok: false, problem: 'Usage: list | pause <id> | resume <id> | stop <id>' };
  } catch (e) {
    return { ok: false, problem: e.message };
  }
}

if (require.main === module) {
  const out = main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = 0;
}

module.exports = { opensApps, describeSchedule, parseLaunchctlList, parseDisabled, parseEtime, scriptFiles, main };
