#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawn, execFileSync, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = os.homedir();
const USER = os.userInfo().username;

function findStatusPath() {
  // Tests point this at a tmp path so live-wrapper runs can't pollute the real
  // Antigravity dashboard data with fake tasks/savedTokens.
  if (process.env.HERMES_YOLO_STATUS_PATH) return process.env.HERMES_YOLO_STATUS_PATH;
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
const cwdHash = crypto.createHash('md5').update(process.cwd()).digest('hex').substring(0, 8);
const LOCK_PATH = process.env.HERMES_YOLO_LOCK_PATH || `/tmp/hermes-yolo-${cwdHash}.lock`;
const LOG_PATH = process.env.HERMES_YOLO_LOG_PATH || `/tmp/hermes-yolo-${cwdHash}.log`;
const HERMES_ENV_PATH = process.env.HERMES_ENV_PATH || path.join(HOME, '.hermes', '.env');
const HERMES_CONFIG_PATH = process.env.HERMES_CONFIG_PATH || path.join(HOME, '.hermes', 'config.yaml');

// All thresholds overridable via env vars.
const HERMES_BIN = process.env.HERMES_BIN || path.join(HOME, '.local/bin/hermes');
const DEFAULT_TOOLSETS = process.env.HERMES_YOLO_TOOLSETS || 'terminal,file,web,code_execution,memory,clarify';

function parseEnvFile(filePath = HERMES_ENV_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const parsed = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function mergedHermesEnv(env = process.env, envFilePath = HERMES_ENV_PATH) {
  const localEnvPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'hermes-mobile', '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];
  let merged = Object.assign({}, parseEnvFile(envFilePath));
  for (const localPath of localEnvPaths) {
    if (fs.existsSync(localPath)) {
      merged = Object.assign(merged, parseEnvFile(localPath));
    }
  }
  return Object.assign(merged, env);
}

function hasZaiKey(env = process.env) {
  return Boolean(env.Z_AI_API_KEY || env.ZAI_API_KEY);
}

function hasOpenRouterKey(env = process.env) {
  return Boolean(env.OPENROUTER_API_KEY);
}

function configuredProviderIds(configPath = HERMES_CONFIG_PATH) {
  if (!configPath || !fs.existsSync(configPath)) return [];
  const text = fs.readFileSync(configPath, 'utf8');
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
    if (match) ids.push(match[1]);
  }
  return ids;
}

function chooseZaiProvider(configuredIds = configuredProviderIds()) {
  const preferred = ['zai-coding-glm', 'zai-coding-nothink'];
  const id = preferred.find((candidate) => configuredIds.includes(candidate));
  return id ? `custom:${id}` : 'zai';
}

function findOllamaBinary() {
  const candidates = [
    process.env.OLLAMA_BIN,
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
    '/Applications/Ollama.app/Contents/Resources/ollama',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    return execSync('command -v ollama', { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function listOllamaModels() {
  const ollamaBin = findOllamaBinary();
  if (!ollamaBin) return [];
  try {
    return execFileSync(ollamaBin, ['list'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function chooseLocalModel(availableModels = listOllamaModels()) {
  const candidates = [
    'qwen2.5:3b-64k',
    'qwen3:8b-agent-64k',
    'qwen3:8b-64k',
    'qwen3:8b-agent-32k',
    'qwen3:8b',
    'qwen2.5:3b',
  ];
  return candidates.find((model) => availableModels.includes(model)) || 'qwen2.5:3b-64k';
}

function defaultModelRoute(env = process.env, options = {}) {
  if (env.HERMES_YOLO_PROVIDER || env.HERMES_YOLO_MODEL) {
    return {
      provider: env.HERMES_YOLO_PROVIDER || 'custom:ollama-local-64k',
      model: env.HERMES_YOLO_MODEL || chooseLocalModel(options.availableModels),
    };
  }

  if (hasZaiKey(env)) {
    return {
      provider: chooseZaiProvider(options.configuredProviderIds),
      model: 'glm-5.2',
    };
  }

  if (hasOpenRouterKey(env)) {
    return {
      provider: 'custom:openrouter-glm52',
      model: 'z-ai/glm-5.2',
    };
  }

  return {
    provider: 'custom:ollama-local-64k',
    model: chooseLocalModel(options.availableModels),
  };
}

const ROUTE_ENV = mergedHermesEnv();
const DEFAULT_ROUTE = defaultModelRoute(ROUTE_ENV);
const DEFAULT_PROVIDER = DEFAULT_ROUTE.provider;
const DEFAULT_MODEL = DEFAULT_ROUTE.model;

const EXTRA_ARGS = process.env.HERMES_YOLO_NO_DEFAULT_ARGS
  ? []
  : ['--provider', DEFAULT_PROVIDER, '--model', DEFAULT_MODEL, '--yolo', '--accept-hooks', '--toolsets', DEFAULT_TOOLSETS];

const TIMEOUT_MS = parseInt(process.env.HERMES_YOLO_TIMEOUT_MS || (120 * 60 * 1000), 10);
const heartbeatMsRaw = parseInt(process.env.HERMES_YOLO_HEARTBEAT_MS || '', 10);
const HEARTBEAT_MS = Number.isFinite(heartbeatMsRaw) ? Math.max(100, heartbeatMsRaw) : 15000;
const CPU_SAMPLE_INTERVAL_MS = parseInt(process.env.HERMES_YOLO_CPU_SAMPLE_MS || 30000, 10);
const CPU_THRESHOLD = parseFloat(process.env.HERMES_YOLO_CPU_THRESHOLD || 90);
const CPU_STUCK_SAMPLES = parseInt(process.env.HERMES_YOLO_CPU_STUCK_SAMPLES || 0, 10);
const CPU_WATCHDOG_ENABLED = CPU_STUCK_SAMPLES > 0;

const DEFAULT_READY_PROMPT = 'Reply with exactly HERMES-YOLO-READY';
const args = process.argv.slice(2);
const promptText = args.join(' ') || DEFAULT_READY_PROMPT;
const HERMES_COMMANDS = new Set([
  'chat', 'model', 'fallback', 'secrets', 'migrate', 'gateway', 'proxy', 'lsp',
  'setup', 'postinstall', 'whatsapp', 'whatsapp-cloud', 'slack', 'send', 'login',
  'logout', 'auth', 'status', 'cron', 'webhook', 'portal', 'kanban', 'hooks',
  'doctor', 'security', 'dump', 'debug', 'backup', 'checkpoints', 'import',
  'config', 'pairing', 'skills', 'bundles', 'plugins', 'photon', 'curator',
  'memory', 'tools', 'computer-use', 'mcp', 'sessions', 'insights', 'claw',
  'version', 'update', 'uninstall', 'acp', 'profile', 'completion', 'dashboard',
  'desktop', 'gui', 'logs', 'prompt-size'
]);

function buildChildPromptArgs(rawArgs, prompt = rawArgs.join(' ') || DEFAULT_READY_PROMPT, options = {}) {
  if (options.forceOneshot) return ['-z', prompt || DEFAULT_READY_PROMPT];
  if (process.env.HERMES_YOLO_INTERACTIVE === '1') return rawArgs;
  if (rawArgs.length === 0) {
    return ['-z', DEFAULT_READY_PROMPT];
  }
  if (rawArgs[0].startsWith('-') || HERMES_COMMANDS.has(rawArgs[0])) return rawArgs;
  return ['-z', prompt];
}

function isOneshotArgs(childArgs) {
  return Array.isArray(childArgs) && childArgs[0] === '-z';
}

// One-shot (-z) runs never read stdin, so the child can run detached in its own
// process group; that lets the wrapper kill the ENTIRE agent tree with one group
// signal when the terminal closes. Passthrough subcommands (chat, doctor, ...)
// keep full TTY inheritance and stay in the foreground group so stdin works.
function buildChildStdio(childArgs) {
  return isOneshotArgs(childArgs) ? ['ignore', 'inherit', 'inherit'] : 'inherit';
}

// A one-shot agent run prints nothing until its final answer, which can be
// minutes away while it works tools — a bare terminal looks dead meanwhile.
// Progress lines go to stderr so scripted/captured stdout stays clean.
function shouldShowProgress(childArgs, options = {}) {
  const progressEnv = options.progressEnv !== undefined ? options.progressEnv : process.env.HERMES_YOLO_PROGRESS;
  if (progressEnv === '1') return true;
  if (progressEnv === '0') return false;
  const stderrIsTTY = options.stderrIsTTY !== undefined ? options.stderrIsTTY : Boolean(process.stderr.isTTY);
  return stderrIsTTY && isOneshotArgs(childArgs);
}

function readPromptLineFromTty() {
  fs.writeSync(process.stdout.fd, 'hermes-yolo> ');
  const chunks = [];
  const buf = Buffer.alloc(1);
  while (true) {
    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(process.stdin.fd, buf, 0, 1, null);
    } catch (e) {
      if (e && e.code === 'EAGAIN') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        continue;
      }
      throw e;
    }
    if (bytesRead === 0) break;
    const ch = buf.toString('utf8', 0, bytesRead);
    if (ch === '\n' || ch === '\r') break;
    chunks.push(ch);
  }
  return chunks.join('').trim();
}

const wrapperPromptMode = (
  args.length === 0 &&
  process.stdin.isTTY &&
  process.stdout.isTTY &&
  process.env.HERMES_YOLO_INTERACTIVE !== '1'
);
const wrapperPromptText = wrapperPromptMode ? readPromptLineFromTty() : null;
const effectivePromptText = wrapperPromptText || promptText;
const childPromptArgs = buildChildPromptArgs(args, effectivePromptText, {
  forceOneshot: wrapperPromptMode,
});

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

if (require.main === module) {
// --- Singleton lock: refuse second instance, clear stale locks ---
if (fs.existsSync(LOCK_PATH)) {
  const lockPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
  let alive = false;
  try { process.kill(lockPid, 0); alive = true; } catch (e) {}
  if (alive) {
    let state = '';
    try {
      state = execSync(`ps -o state= -p ${lockPid}`, { encoding: 'utf8' }).trim();
    } catch (e) {}

    if (state.includes('T') || state.includes('Z')) {
      console.warn(`\x1b[33m[hermes-yolo]\x1b[0m Found stale/suspended hermes-yolo process (PID ${lockPid}, state: ${state}). Cleaning it up.`);
      try {
        const childrenStr = execSync(`pgrep -P ${lockPid}`, { encoding: 'utf8' }).trim();
        if (childrenStr) {
          const children = childrenStr.split(/\s+/).map(p => parseInt(p, 10)).filter(Boolean);
          for (const childPid of children) {
            // Direct children may be detached group LEADERS — SIGKILLing just
            // the leader strands its group members; reap each as a full group.
            killTree(childPid, { processGroup: true });
          }
        }
      } catch (e) {}
      try { process.kill(lockPid, 'SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(LOCK_PATH); } catch (e) {}
    } else {
      console.error(`\x1b[31m[hermes-yolo]\x1b[0m Another hermes-yolo is already running (PID ${lockPid}, state: ${state}). Exiting.`);
      console.error(`If you're sure it's stale, remove ${LOCK_PATH} and retry.`);
      process.exit(2);
    }
  } else {
    console.error(`\x1b[33m[hermes-yolo]\x1b[0m Clearing stale lock from dead PID ${lockPid}.`);
    // A SIGKILLed wrapper (jetsam) never runs its kill handlers, leaving its
    // detached one-shot agent alive with no terminal and no watchdog. Its pid is
    // the lock file's second line — reap that orphaned group, but only after
    // confirming the pid still looks like a hermes process (guards pid reuse).
    try {
      const lockLines = fs.readFileSync(LOCK_PATH, 'utf8').split(/\r?\n/);
      const orphanPid = parseInt((lockLines[1] || '').trim(), 10);
      if (orphanPid) {
        let orphanCmd = '';
        try {
          orphanCmd = execSync(`ps -p ${orphanPid} -o command=`, { encoding: 'utf8' }).trim();
        } catch (e) {}
        if (orphanCmd.includes('hermes')) {
          console.warn(`\x1b[33m[hermes-yolo]\x1b[0m Reaping orphaned agent (PID ${orphanPid}) left by dead wrapper ${lockPid}.`);
          killTree(orphanPid, { processGroup: true });
        }
      }
    } catch (e) {}
    try { fs.unlinkSync(LOCK_PATH); } catch (e) {}
  }
}

// Clean up any other suspended/zombie hermes/hermes-yolo processes owned by the user
if (process.env.HERMES_YOLO_NO_SWEEP !== '1') {
try {
  const psOutput = execSync(`ps -axo pid,state,command`, { encoding: 'utf8' });
  const lines = psOutput.split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      const pid = parseInt(parts[0], 10);
      const state = parts[1];
      const command = parts.slice(2).join(' ');
      if (pid && pid !== process.pid && (state.includes('T') || state.includes('Z'))) {
        if (command.includes('hermes-yolo-wrapper.js') || command.includes('/hermes ')) {
          console.warn(`\x1b[33m[hermes-yolo]\x1b[0m Cleaning up unrelated suspended/zombie process (PID ${pid}, state: ${state}, cmd: ${command}).`);
          try { process.kill(pid, 'SIGKILL'); } catch (e) {}
        }
      }
    }
  }
} catch (e) {}
}

fs.writeFileSync(LOCK_PATH, String(process.pid));

// --- Pre-flight reliability check (Intelligence) ---
const realScriptPath = fs.realpathSync(__filename);
const REPO_DIR = path.dirname(realScriptPath);
let auditScore = null;
let auditFindings = [];
if (process.env.HERMES_YOLO_PREFLIGHT === '1') {
  try {
    const auditPath = path.join(REPO_DIR, 'tools', 'hermes-productivity-audit.js');
    if (fs.existsSync(auditPath)) {
      console.log('\x1b[35m[Hermes YOLO Wrapper]\x1b[0m Bootstrapping safety envelope...');
      const { collect } = require(auditPath);
      // run without sending smoke or webhook posts to keep start-up fast and offline-safe
      const audit = collect({ sendSmoke: false, testPublicWebhook: false, remotes: [] });
      auditScore = audit.telemetry.productivityScore;
      auditFindings = audit.findings;
    }
  } catch (e) {
    log(`AUDIT_LOAD_ERROR: ${e.message}`);
  }

  if (auditScore !== null) {
    console.log(`\x1b[35m[Hermes YOLO Wrapper]\x1b[0m Local gateway score: ${auditScore}/100`);
    const criticalOrHigh = auditFindings.filter(f => f.severity === 'critical' || f.severity === 'high');
    if (criticalOrHigh.length > 0) {
      console.warn(`\x1b[33m[hermes-yolo] WARNING:\x1b[0m Found ${criticalOrHigh.length} critical/high gateway reliability issues:`);
      for (const f of criticalOrHigh) {
        console.warn(`  - [${f.severity.toUpperCase()}] ${f.title}: ${f.evidence}`);
      }
    }
  }
}

log(`START pid=${process.pid} bin=${HERMES_BIN} extraArgs=${JSON.stringify(EXTRA_ARGS)} args=${JSON.stringify(childPromptArgs)} timeout=${TIMEOUT_MS}ms cpuWatchdog=${CPU_WATCHDOG_ENABLED ? 'enabled' : 'disabled'} cpuThreshold=${CPU_THRESHOLD}% stuckSamples=${CPU_STUCK_SAMPLES}@${CPU_SAMPLE_INTERVAL_MS}ms`);

updateStatus(data => {
  data.savedTokens += 50000;
  const watcher = data.agents.find(a => a.id === 'antigravity-coder-1');
  if (watcher) {
    watcher.status = 'RUNNING';
    watcher.tasks.push({
      id: `task-hermes-yolo-${Date.now()}`,
      name: `Hermes YOLO Run: "${effectivePromptText.substring(0, 50)}${effectivePromptText.length > 50 ? '...' : ''}"`,
      status: 'RUNNING'
    });
  }
  data.chatMessages.push({ sender: 'user', text: `hermes-yolo ${childPromptArgs.join(' ')}` });
  data.termHistory.push(`$ hermes-yolo ${childPromptArgs.join(' ')}`);
  data.termHistory.push(`[Hermes YOLO Wrapper] Spawned ${HERMES_BIN} ${EXTRA_ARGS.join(' ')}`);
});

// Run with HERMES_YOLO=1 and HERMES_ACCEPT_HOOKS=1 env set.
const env = Object.assign({}, ROUTE_ENV, {
  HERMES_YOLO: '1',
  HERMES_ACCEPT_HOOKS: '1'
});

const childIsOneshot = isOneshotArgs(childPromptArgs);
const childStdio = buildChildStdio(childPromptArgs);
const child = spawn(HERMES_BIN, [...EXTRA_ARGS, ...childPromptArgs], {
  stdio: childStdio,
  env,
  detached: childIsOneshot,
});
log(`SPAWNED childPid=${child.pid} oneshot=${childIsOneshot} detached=${childIsOneshot}`);

// Record the child pid alongside ours so a future invocation can reap an
// orphaned detached agent even if THIS wrapper is SIGKILLed (jetsam) and never
// runs its handlers. parseInt on the first line keeps old readers working.
if (childIsOneshot && child.pid) {
  try { fs.appendFileSync(LOCK_PATH, `\n${child.pid}`); } catch (e) {}
}

const showProgress = shouldShowProgress(childPromptArgs) && Boolean(child.pid);
const startedAt = Date.now();
const elapsedSec = () => Math.round((Date.now() - startedAt) / 1000);
let heartbeat = null;
if (showProgress) {
  process.stderr.write(`\x1b[35m[hermes-yolo]\x1b[0m agent started (pid ${child.pid}, provider ${DEFAULT_PROVIDER}, model ${DEFAULT_MODEL}) — answer prints when the run finishes; Ctrl+C cancels. Log: ${LOG_PATH}\n`);
  heartbeat = setInterval(() => {
    process.stderr.write(`\x1b[35m[hermes-yolo]\x1b[0m still working… ${elapsedSec()}s elapsed\n`);
  }, HEARTBEAT_MS);
}

child.on('error', (err) => {
  log(`SPAWN_ERROR ${err.code} ${err.message}`);
  console.error(`\x1b[31m[hermes-yolo]\x1b[0m Failed to spawn ${HERMES_BIN}: ${err.message}`);
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
  console.error(`\n\x1b[31m[hermes-yolo watchdog]\x1b[0m Killing child (${reason})`);
  killTree(child.pid, { processGroup: childIsOneshot });
  try { child.kill('SIGKILL'); } catch (e) {}
}

// Snapshot descendants FIRST (while the parent chain is still walkable), then
// group-kill: the group signal catches processes that left the walkable tree,
// and the snapshot catches ones that left the process group (setsid tools) —
// killing the group first would let those reparent to pid 1 and evade the walk.
function killTree(rootPid, options = {}) {
  const descendants = getDescendantPids(rootPid);
  if (options.processGroup) {
    try { process.kill(-rootPid, 'SIGKILL'); } catch (e) {}
  }
  for (const pid of descendants) {
    try { process.kill(pid, 'SIGKILL'); } catch (e) {}
  }
}

// Helper to recursively find descendant PIDs (handles child CLI agents spinning sub-processes)
function getDescendantPids(parentPid) {
  const pids = [parentPid];
  let index = 0;
  while (index < pids.length) {
    const p = pids[index];
    try {
      const childrenStr = execSync(`pgrep -P ${p}`, { encoding: 'utf8' }).trim();
      if (childrenStr) {
        const children = childrenStr.split(/\s+/).map(x => parseInt(x, 10)).filter(Boolean);
        for (const childPid of children) {
          if (!pids.includes(childPid)) {
            pids.push(childPid);
          }
        }
      }
    } catch (e) {}
    index++;
  }
  return pids;
}

// Helper to sum CPU across a list of PIDs
function getAggregateCpu(pids) {
  let totalCpu = 0;
  for (const pid of pids) {
    try {
      const cpuStr = execSync(`ps -p ${pid} -o %cpu=`, { encoding: 'utf8' }).trim();
      const cpu = parseFloat(cpuStr);
      if (Number.isFinite(cpu)) {
        totalCpu += cpu;
      }
    } catch (e) {}
  }
  return totalCpu;
}

// Hard timeout
const timeoutHandle = setTimeout(
  () => killChild(`hard timeout (${TIMEOUT_MS}ms)`),
  TIMEOUT_MS
);

// Stuck-loop watchdog with descendant support. Disabled by default because
// sustained high CPU is expected while local Ollama models are actively working.
let highCpuSamples = 0;
const watchdog = CPU_WATCHDOG_ENABLED ? setInterval(() => {
  if (killed || child.killed) return;
  
  const descendants = getDescendantPids(child.pid);
  const cpu = getAggregateCpu(descendants);
  
  if (cpu > CPU_THRESHOLD) {
    highCpuSamples += 1;
    log(`watchdog cpu=${cpu}% descendants=${descendants.length} sample=${highCpuSamples}/${CPU_STUCK_SAMPLES}`);
    if (highCpuSamples >= CPU_STUCK_SAMPLES) {
      killChild(`stuck-loop: aggregate CPU >${CPU_THRESHOLD}% for ${CPU_STUCK_SAMPLES} consecutive samples (${CPU_STUCK_SAMPLES * CPU_SAMPLE_INTERVAL_MS / 1000}s)`);
    }
  } else if (highCpuSamples > 0) {
    log(`watchdog cpu=${cpu}% — reset stuck-counter (was ${highCpuSamples})`);
    highCpuSamples = 0;
  }
}, CPU_SAMPLE_INTERVAL_MS) : null;

child.on('close', (code, signal) => {
  clearTimeout(timeoutHandle);
  if (watchdog) clearInterval(watchdog);
  if (heartbeat) clearInterval(heartbeat);
  releaseLock();
  log(`EXIT code=${code} signal=${signal} killed=${killed} reason=${killReason || ''}`);
  if (showProgress && !killed) {
    process.stderr.write(signal
      ? `\x1b[31m[hermes-yolo]\x1b[0m child killed by signal ${signal} after ${elapsedSec()}s\n`
      : `\x1b[35m[hermes-yolo]\x1b[0m done in ${elapsedSec()}s (exit ${code ?? 0})\n`);
  }

  updateStatus(data => {
    const watcher = data.agents.find(a => a.id === 'antigravity-coder-1');
    if (watcher) {
      watcher.tasks.forEach(t => {
        if (t.name.startsWith('Hermes YOLO Run:') && t.status === 'RUNNING') {
          t.status = killed ? 'KILLED' : 'COMPLETED';
        }
      });
    }
    data.chatMessages.push({
      sender: 'spark',
      text: killed
        ? `hermes-yolo killed by wrapper: ${killReason}. Exit code ${code}.`
        : `Successfully completed Hermes YOLO task: "${effectivePromptText}". Resolved with status code ${code}. Saved 50,000 tokens via active caching.`
    });
    data.termHistory.push(`[Hermes YOLO Wrapper] Process completed with code ${code}${killed ? ` (killed: ${killReason})` : ''}.`);
    data.termHistory.push('');
  });

  process.exit(killed ? 124 : (code ?? 0));
});

// Forward wrapper-level signals
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => {
    log(`wrapper received ${sig} — killing agent tree (group=${childIsOneshot})`);
    killTree(child.pid, { processGroup: childIsOneshot });
    try { child.kill('SIGKILL'); } catch (e) {}
    releaseLock();
    log(`SIGNAL_EXIT sig=${sig}`);
    process.exit(1);
  });
});

// Keep Ctrl+Z coherent: a detached agent never sees the terminal's SIGTSTP, so
// stop/resume its whole group in lockstep with the wrapper — otherwise the
// agent runs on unwatched while the wrapper (and its timeout/CPU watchdog
// timers) sits frozen in state T.
process.on('SIGTSTP', () => {
  log('wrapper received SIGTSTP — stopping agent group');
  if (childIsOneshot && child.pid) { try { process.kill(-child.pid, 'SIGSTOP'); } catch (e) {} }
  process.kill(process.pid, 'SIGSTOP');
});
process.on('SIGCONT', () => {
  log('wrapper received SIGCONT — resuming agent group');
  if (childIsOneshot && child.pid) { try { process.kill(-child.pid, 'SIGCONT'); } catch (e) {} }
});

process.on('exit', releaseLock);
} else {
module.exports = {
  buildChildPromptArgs,
  buildChildStdio,
  defaultModelRoute,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  isOneshotArgs,
  mergedHermesEnv,
  parseEnvFile,
  shouldShowProgress,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT
};
}
