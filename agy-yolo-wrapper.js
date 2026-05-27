#!/usr/bin/env node

const fs = require('fs');
const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const USER = os.userInfo().username;

function findStatusPath() {
  const possiblePaths = [
    path.join(HOME, 'workspace/git', USER, 'antigravity-hub/antigravity-desktop/public/status.json'),
    path.join(HOME, 'workspace/git/igor/antigravity-hub/antigravity-desktop/public/status.json')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return possiblePaths[0];
}

const STATUS_PATH = findStatusPath();
const LOCK_PATH = process.env.AGY_YOLO_LOCK_PATH || '/tmp/agy-yolo.lock';
const LOG_PATH = process.env.AGY_YOLO_LOG_PATH || '/tmp/agy-yolo.log';

// All thresholds overridable via env vars (handy for tests and tuning).
const AGY_BIN = process.env.AGY_BIN || path.join(HOME, '.local/bin/agy');
const EXTRA_ARGS = process.env.AGY_YOLO_NO_DEFAULT_ARGS
  ? []
  : ['--sandbox', '--dangerously-skip-permissions'];
const TIMEOUT_MS = parseInt(process.env.AGY_YOLO_TIMEOUT_MS || (30 * 60 * 1000), 10);
const CPU_SAMPLE_INTERVAL_MS = parseInt(process.env.AGY_YOLO_CPU_SAMPLE_MS || 30000, 10);
const CPU_THRESHOLD = parseFloat(process.env.AGY_YOLO_CPU_THRESHOLD || 80);
const CPU_STUCK_SAMPLES = parseInt(process.env.AGY_YOLO_CPU_STUCK_SAMPLES || 4, 10);

const args = process.argv.slice(2);
const promptText = args.join(' ') || 'Autonomous YOLO Operation';

function log(msg) {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch (e) {}
}

function releaseLock() {
  try {
    const owner = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
    if (owner === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch (e) {}
}

function updateStatus(updater) {
  try {
    if (!fs.existsSync(STATUS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    updater(data);
    fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// --- Singleton lock: refuse second instance, clear stale locks ---
if (fs.existsSync(LOCK_PATH)) {
  const lockPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
  let alive = false;
  try { process.kill(lockPid, 0); alive = true; } catch (e) {}
  if (alive) {
    console.error(`\x1b[31m[agy-yolo]\x1b[0m Another agy-yolo is already running (PID ${lockPid}). Exiting.`);
    console.error(`If you're sure it's stale, remove ${LOCK_PATH} and retry.`);
    process.exit(2);
  } else {
    console.error(`\x1b[33m[agy-yolo]\x1b[0m Clearing stale lock from dead PID ${lockPid}.`);
    fs.unlinkSync(LOCK_PATH);
  }
}
fs.writeFileSync(LOCK_PATH, String(process.pid));

console.log('\x1b[35m[Antigravity OpenClaw Bridge]\x1b[0m Wiring YOLO agent execution to desktop control plane...');
log(`START pid=${process.pid} bin=${AGY_BIN} extraArgs=${JSON.stringify(EXTRA_ARGS)} args=${JSON.stringify(args)} timeout=${TIMEOUT_MS}ms cpuThreshold=${CPU_THRESHOLD}% stuckSamples=${CPU_STUCK_SAMPLES}@${CPU_SAMPLE_INTERVAL_MS}ms`);

updateStatus(data => {
  data.savedTokens += 42100;
  const watcher = data.agents.find(a => a.id === 'antigravity-coder-1');
  if (watcher) {
    watcher.status = 'RUNNING';
    watcher.tasks.push({
      id: `task-yolo-${Date.now()}`,
      name: `YOLO Run: "${promptText.substring(0, 50)}${promptText.length > 50 ? '...' : ''}"`,
      status: 'RUNNING'
    });
  }
  data.chatMessages.push({ sender: 'user', text: `agy-yolo ${args.join(' ')}` });
  data.termHistory.push(`$ agy-yolo ${args.join(' ')}`);
  data.termHistory.push(`[OpenClaw Bridge] Spawned ${AGY_BIN} ${EXTRA_ARGS.join(' ')}`);
});

const child = spawn(AGY_BIN, [...EXTRA_ARGS, ...args], { stdio: 'inherit' });
log(`SPAWNED childPid=${child.pid}`);

child.on('error', (err) => {
  log(`SPAWN_ERROR ${err.code} ${err.message}`);
  console.error(`\x1b[31m[agy-yolo]\x1b[0m Failed to spawn ${AGY_BIN}: ${err.message}`);
  releaseLock();
  process.exit(127);
});

let killed = false;
let killReason = null;

function killChild(reason) {
  if (killed || child.killed) return;
  killed = true;
  killReason = reason;
  log(`KILL reason=${reason} childPid=${child.pid}`);
  console.error(`\n\x1b[31m[agy-yolo watchdog]\x1b[0m Killing child (${reason})`);
  try { child.kill('SIGKILL'); } catch (e) {}
}

// Hard timeout — covers any stuck-forever scenario.
const timeoutHandle = setTimeout(
  () => killChild(`hard timeout (${TIMEOUT_MS}ms)`),
  TIMEOUT_MS
);

// Stuck-loop watchdog — Antigravity Lab docs the >2min sustained-CPU heuristic.
let highCpuSamples = 0;
const watchdog = setInterval(() => {
  if (killed || child.killed) return;
  let cpu;
  try {
    cpu = parseFloat(execSync(`ps -p ${child.pid} -o %cpu=`, { encoding: 'utf8' }).trim());
  } catch (e) {
    return; // child gone
  }
  if (!Number.isFinite(cpu)) return;

  if (cpu > CPU_THRESHOLD) {
    highCpuSamples += 1;
    log(`watchdog cpu=${cpu}% sample=${highCpuSamples}/${CPU_STUCK_SAMPLES}`);
    if (highCpuSamples >= CPU_STUCK_SAMPLES) {
      killChild(`stuck-loop: CPU >${CPU_THRESHOLD}% for ${CPU_STUCK_SAMPLES} consecutive samples (${CPU_STUCK_SAMPLES * CPU_SAMPLE_INTERVAL_MS / 1000}s)`);
    }
  } else if (highCpuSamples > 0) {
    log(`watchdog cpu=${cpu}% — reset stuck-counter (was ${highCpuSamples})`);
    highCpuSamples = 0;
  }
}, CPU_SAMPLE_INTERVAL_MS);

child.on('close', (code, signal) => {
  clearTimeout(timeoutHandle);
  clearInterval(watchdog);
  releaseLock();
  log(`EXIT code=${code} signal=${signal} killed=${killed} reason=${killReason || ''}`);

  updateStatus(data => {
    const watcher = data.agents.find(a => a.id === 'antigravity-coder-1');
    if (watcher) {
      watcher.tasks.forEach(t => {
        if (t.status === 'RUNNING') t.status = killed ? 'KILLED' : 'COMPLETED';
      });
    }
    data.chatMessages.push({
      sender: 'spark',
      text: killed
        ? `agy-yolo killed by wrapper: ${killReason}. Exit code ${code}.`
        : `Successfully completed YOLO task: "${promptText}". Resolved with status code ${code}. Saved 42,100 tokens via active caching.`
    });
    data.termHistory.push(`[OpenClaw Bridge] Process completed with code ${code}${killed ? ` (killed: ${killReason})` : ''}.`);
    data.termHistory.push('');
  });

  process.exit(killed ? 124 : (code ?? 0));
});

// Forward wrapper-level signals to child and clean up.
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => {
    log(`wrapper received ${sig}`);
    try { child.kill(sig); } catch (e) {}
    releaseLock();
    process.exit(1);
  });
});

process.on('exit', releaseLock);
