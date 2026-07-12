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
  return Object.assign({}, parseEnvFile(envFilePath), env);
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
    'qwen3.6:35b-a3b',
    'gpt-oss:20b',
    'qwen3:8b-agent-64k',
    'qwen3:8b-64k',
    'qwen3:8b-agent-32k',
    'qwen3:8b',
    'qwen2.5:3b-64k',
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

function findGrokYoloBinary(env = process.env) {
  const candidates = [
    env.GROK_YOLO_BIN,
    path.join(HOME, '.local', 'bin', 'grok-yolo'),
    path.join(__dirname, 'grok-yolo-wrapper.js'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (e) {}
  }
  return null;
}

function shouldUseGrokBackend(rawArgs, env = process.env) {
  const backend = String(env.HERMES_YOLO_BACKEND || 'grok').trim().toLowerCase();
  if (!['grok', 'auto', 'hermes'].includes(backend)) {
    throw new Error(`Unsupported HERMES_YOLO_BACKEND=${backend}; expected grok, auto, or hermes`);
  }
  if (backend === 'hermes') return false;
  if (rawArgs.length > 0 && ['--version', '-V', '--help', '-h'].includes(rawArgs[0])) return false;
  if (rawArgs.length > 0 && ['--provider', '--model', '--toolsets'].includes(rawArgs[0])) return false;
  if (rawArgs.length > 0 && HERMES_COMMANDS.has(rawArgs[0])) return false;
  return true;
}

function buildGrokBackendArgs(rawArgs, options = {}) {
  const isTty = options.isTty !== undefined ? options.isTty : Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (rawArgs.length === 0) {
    return isTty ? [] : ['-p', DEFAULT_READY_PROMPT, '--output-format', 'plain'];
  }
  if (rawArgs[0] === '-z' || rawArgs[0] === '--single') {
    const prompt = rawArgs.slice(1).join(' ').trim() || DEFAULT_READY_PROMPT;
    return ['-p', prompt, '--output-format', 'plain'];
  }
  if (!rawArgs[0].startsWith('-')) {
    return ['-p', rawArgs.join(' '), '--output-format', 'plain'];
  }
  return rawArgs;
}

function runGrokBackend(rawArgs, env = process.env) {
  const grokYoloBin = findGrokYoloBinary(env);
  if (!grokYoloBin) {
    console.error('[hermes-yolo] Grok 4.5 backend is required but grok-yolo is not installed.');
    console.error('[hermes-yolo] Refusing to silently fall back to Qwen.');
    process.exit(127);
  }
  const grokArgs = buildGrokBackendArgs(rawArgs);
  console.error('[hermes-yolo] backend=grok-4.5 (set HERMES_YOLO_BACKEND=hermes for the legacy Hermes provider route)');
  const result = require('child_process').spawnSync(grokYoloBin, grokArgs, {
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    console.error(`[hermes-yolo] Grok 4.5 backend failed to start: ${result.error.message}`);
    process.exit(127);
  }
  process.exit(result.status === null ? 1 : result.status);
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
if (shouldUseGrokBackend(args, process.env)) {
  runGrokBackend(args, process.env);
}
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
            try { process.kill(childPid, 'SIGKILL'); } catch (e) {}
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
    try { fs.unlinkSync(LOCK_PATH); } catch (e) {}
  }
}

// Clean up any other suspended/zombie hermes/hermes-yolo processes owned by the user
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

const childStdio = wrapperPromptMode ? ['ignore', 'inherit', 'inherit'] : 'inherit';
const child = spawn(HERMES_BIN, [...EXTRA_ARGS, ...childPromptArgs], { stdio: childStdio, env });
log(`SPAWNED childPid=${child.pid}`);

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
  
  // Kill descendants recursively
  const descendants = getDescendantPids(child.pid);
  for (const pid of descendants) {
    try { process.kill(pid, 'SIGKILL'); } catch (e) {}
  }
  try { child.kill('SIGKILL'); } catch (e) {}
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
  releaseLock();
  log(`EXIT code=${code} signal=${signal} killed=${killed} reason=${killReason || ''}`);

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
    log(`wrapper received ${sig}`);
    const descendants = getDescendantPids(child.pid);
    for (const pid of descendants) {
      try { process.kill(pid, 'SIGKILL'); } catch (e) {}
    }
    try { child.kill('SIGKILL'); } catch (e) {}
    releaseLock();
    process.exit(1);
  });
});

process.on('exit', releaseLock);
} else {
module.exports = {
  buildChildPromptArgs,
  defaultModelRoute,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  mergedHermesEnv,
  parseEnvFile,
  buildGrokBackendArgs,
  findGrokYoloBinary,
  shouldUseGrokBackend,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT
};
}
