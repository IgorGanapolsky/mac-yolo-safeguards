#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const CONNECTION = 'hermes-coco-readonly';
const MIN_CORTEX_VERSION = '1.1.27';
const HOME = os.homedir();
const DEFAULT_SNOWFLAKE_HOME = path.join(HOME, '.hermes', 'snowflake');
const DEFAULT_RECEIPT_DIR = path.join(HOME, '.hermes', 'receipts', 'coco-yolo');
const DEFAULT_LATEST_RECEIPT = path.join(DEFAULT_RECEIPT_DIR, 'latest.json');
const DEFAULT_HISTORY_RECEIPT = path.join(DEFAULT_RECEIPT_DIR, 'history.jsonl');
const DEFAULT_ACP_TIMEOUT_MS = 2 * 60 * 1000;

const CORTEX_COMMANDS = new Set([
  'exec', 'connections', 'mcp', 'profile', 'skill', 'ctx', 'conversations', 'resume',
  'search', 'analyst', 'agents', 'lineage', 'airflow', 'completion', 'versions',
  'update', 'worktree', 'acp',
]);

const BLOCKED_FLAGS = new Set([
  '--bypass',
  '--dangerously-allow-all-tool-calls',
  '--no-sql-read-only',
  '--mcp',
  '--auto-update',
  '--connection',
  '-c',
  '--model',
  '-m',
  '--config-file',
  '--print',
  '-p',
  '--input-format',
  '--output-format',
]);

const HEADLESS_COMMANDS = new Set(['exec', '--goal']);

function redact(value) {
  return String(value == null ? '' : value)
    .replaceAll(HOME, '~')
    .replace(/\b(?:ghp_|github_pat_|xai-|sk-)[A-Za-z0-9_.-]{12,}\b/gi, '[REDACTED]')
    .replace(/\b((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s"']+/gi, '$1[REDACTED]')
    .slice(0, 1200);
}

function randomId(length = 20) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function findExecutable(name, candidates, env = process.env) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  const found = spawnSync('/bin/zsh', ['-lc', `command -v ${name}`], {
    encoding: 'utf8',
    timeout: 3000,
    env,
  });
  return found.status === 0 && found.stdout.trim() ? found.stdout.trim() : null;
}

function findCortexBinary(env = process.env) {
  return findExecutable('cortex', [
    env.CORTEX_BIN,
    path.join(HOME, '.local', 'bin', 'cortex'),
    '/opt/homebrew/bin/cortex',
    '/usr/local/bin/cortex',
  ], env);
}

function findSnowBinary(env = process.env) {
  return findExecutable('snow', [
    env.SNOW_BIN,
    path.join(HOME, '.local', 'bin', 'snow'),
    '/opt/homebrew/bin/snow',
    '/usr/local/bin/snow',
  ], env);
}

function parseCortexVersion(output) {
  const match = String(output || '').match(/Cortex Code v(\d+\.\d+\.\d+)/i);
  return match ? match[1] : null;
}

function versionAtLeast(actual, minimum = MIN_CORTEX_VERSION) {
  if (!actual) return false;
  const left = actual.split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

function buildCocoEnv(env = process.env) {
  return {
    ...env,
    SNOWFLAKE_HOME: env.SNOWFLAKE_HOME || DEFAULT_SNOWFLAKE_HOME,
    CORTEX_CLIENT_READ_ONLY: '1',
    COCO_YOLO: '1',
  };
}

function unsafeArgument(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (HEADLESS_COMMANDS.has(arg) || BLOCKED_FLAGS.has(arg)) return arg;
    for (const flag of BLOCKED_FLAGS) {
      if (flag.startsWith('--') && arg.startsWith(`${flag}=`)) return flag;
    }
  }
  return null;
}

function assertSafeArgs(args) {
  const blocked = unsafeArgument(args);
  if (!blocked) return;
  if (HEADLESS_COMMANDS.has(blocked)) {
    throw new Error(
      `${blocked} is disabled: this Cortex subscription does not expose a verified read-only headless path; use the interactive CoCo session`,
    );
  }
  throw new Error(`${blocked} is managed by coco-yolo and cannot be overridden`);
}

function buildCortexArgs(userArgs = []) {
  assertSafeArgs(userArgs);
  return [
    '--connection', CONNECTION,
    '--sql-read-only',
    '--no-mcp',
    '--no-auto-update',
    ...userArgs,
  ];
}

function isPromptInvocation(userArgs = []) {
  return userArgs.length > 0 && !userArgs[0].startsWith('-') && !CORTEX_COMMANDS.has(userArgs[0]);
}

function promptFromArgs(userArgs = []) {
  return userArgs.join(' ').trim();
}

function permissionDenial(options = []) {
  const rejected = options.find((option) => option.kind === 'reject_always')
    || options.find((option) => option.kind === 'reject_once');
  return rejected
    ? { outcome: 'selected', optionId: rejected.optionId }
    : { outcome: 'cancelled' };
}

class AcpClient {
  constructor(options = {}) {
    this.binary = options.binary;
    this.args = options.args || [];
    this.cwd = options.cwd || process.cwd();
    this.env = options.env || process.env;
    this.timeoutMs = options.timeoutMs || DEFAULT_ACP_TIMEOUT_MS;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.updates = [];
    this.agentText = '';
    this.toolCalls = [];
    this.permissionRequestsDenied = 0;
    this.child = null;
    this.closed = false;
  }

  start() {
    this.child = spawn(this.binary, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8000);
    });
    this.child.on('error', (error) => this.rejectAll(error));
    this.child.on('close', (code, signal) => {
      this.closed = true;
      this.rejectAll(new Error(`Cortex ACP exited before completing (code=${code}, signal=${signal || 'none'})`));
    });
    return this;
  }

  consume(chunk) {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const raw = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!raw) continue;
      let message;
      try {
        message = JSON.parse(raw);
      } catch (error) {
        this.rejectAll(new Error(`Cortex ACP emitted invalid JSON: ${redact(raw)}`));
        continue;
      }
      this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (Object.hasOwn(message, 'id') && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`ACP ${pending.method} failed: ${redact(message.error.message || JSON.stringify(message.error))}`));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'session/update') {
      const update = message.params && message.params.update ? message.params.update : {};
      this.updates.push(update.sessionUpdate || 'unknown');
      if (update.sessionUpdate === 'agent_message_chunk' && update.content && update.content.type === 'text') {
        this.agentText += update.content.text || '';
      }
      if (update.sessionUpdate === 'tool_call') {
        this.toolCalls.push({
          kind: update.kind || 'other',
          title: update.title || 'tool',
          status: update.status || 'pending',
        });
      }
      return;
    }
    if (Object.hasOwn(message, 'id') && message.method === 'session/request_permission') {
      this.permissionRequestsDenied += 1;
      this.respond(message.id, { outcome: permissionDenial(message.params && message.params.options || []) });
      return;
    }
    if (Object.hasOwn(message, 'id') && message.method) {
      this.respondError(message.id, -32601, `Client capability not available: ${message.method}`);
    }
  }

  request(method, params) {
    if (!this.child || this.closed) return Promise.reject(new Error('Cortex ACP process is not running'));
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params) {
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  respond(id, result) {
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  }

  respondError(id, code, message) {
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop() {
    if (!this.child || this.closed) return;
    try { this.child.stdin.end(); } catch {}
    try { this.child.kill('SIGTERM'); } catch {}
    await new Promise((resolve) => {
      if (this.closed) return resolve();
      const timer = setTimeout(() => {
        try { this.child.kill('SIGKILL'); } catch {}
        resolve();
      }, 1500);
      this.child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

function findPlanMode(session) {
  const modes = session && session.modes;
  const available = modes && Array.isArray(modes.availableModes) ? modes.availableModes : [];
  const legacyMode = available.find((mode) => mode.id === 'plan')
    || available.find((mode) => /plan|architect/i.test(`${mode.id || ''} ${mode.name || ''}`))
    || null;
  if (legacyMode) return { kind: 'mode', id: legacyMode.id, value: legacyMode.id };
  const configOptions = session && Array.isArray(session.configOptions) ? session.configOptions : [];
  const modeConfig = configOptions.find((option) => option.id === 'mode' || option.category === 'mode');
  const planOption = modeConfig && Array.isArray(modeConfig.options)
    ? modeConfig.options.find((option) => option.value === 'plan')
      || modeConfig.options.find((option) => /plan|architect/i.test(`${option.value || ''} ${option.name || ''}`))
    : null;
  return modeConfig && planOption
    ? { kind: 'config', id: modeConfig.id, value: planOption.value }
    : null;
}

async function runAcpPrompt(prompt, options = {}) {
  if (!String(prompt || '').trim()) throw new Error('ACP prompt must not be empty');
  const env = buildCocoEnv(options.env || process.env);
  const binary = options.binary || findCortexBinary(env);
  if (!binary) throw new Error('Cortex Code binary not found');
  const cwd = path.resolve(options.cwd || process.cwd());
  const client = new AcpClient({
    binary,
    args: ['acp', 'serve', '--connection', CONNECTION, '--workdir', cwd],
    cwd,
    env,
    timeoutMs: options.timeoutMs || Number(env.COCO_YOLO_ACP_TIMEOUT_MS || DEFAULT_ACP_TIMEOUT_MS),
  }).start();
  try {
    const initialized = await client.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: 'hermes-coco', title: 'Hermes CoCo read-only bridge', version: '1.0.0' },
    });
    if (!initialized || initialized.protocolVersion !== 1) {
      throw new Error(`Unsupported ACP protocol version: ${initialized && initialized.protocolVersion}`);
    }
    const session = await client.request('session/new', { cwd, mcpServers: [] });
    const planMode = findPlanMode(session);
    if (!planMode) throw new Error('Cortex ACP did not expose a read-only plan mode');
    if (planMode.kind === 'mode') {
      await client.request('session/set_mode', { sessionId: session.sessionId, modeId: planMode.value });
    } else {
      await client.request('session/set_config_option', {
        sessionId: session.sessionId,
        configId: planMode.id,
        value: planMode.value,
      });
    }
    const promptResult = await client.request('session/prompt', {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: String(prompt) }],
    });
    return {
      text: client.agentText.trim(),
      stopReason: promptResult && promptResult.stopReason || null,
      protocolVersion: initialized.protocolVersion,
      agentName: initialized.agentInfo && initialized.agentInfo.name || 'cortex-code',
      sessionId: session.sessionId,
      mode: planMode.value,
      toolCalls: client.toolCalls,
      permissionRequestsDenied: client.permissionRequestsDenied,
      updates: client.updates,
      stderr: redact(client.stderr),
    };
  } catch (error) {
    const diagnostic = client.stderr ? ` (${redact(client.stderr)})` : '';
    throw new Error(`${error.message}${diagnostic}`);
  } finally {
    await client.stop();
  }
}

function summarizeUserArgs(userArgs = []) {
  if (userArgs.length === 0) return { kind: 'interactive', argCount: 0, requestId: randomId() };
  const first = userArgs[0];
  return {
    kind: CORTEX_COMMANDS.has(first) ? 'cortex-command' : first.startsWith('-') ? 'flag-command' : 'prompt',
    argCount: userArgs.length,
    command: CORTEX_COMMANDS.has(first) ? first : undefined,
    requestId: randomId(),
  };
}

function safeCommandSummary(args = []) {
  const safe = [];
  let positionalSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--connection' || arg === '--workdir' || arg === '-w' || arg === '--profile' || arg === '--session-name') {
      safe.push(arg, arg === '--connection' ? CONNECTION : '<value>');
      index += 1;
    } else if (!arg.startsWith('-') && !positionalSeen) {
      if (CORTEX_COMMANDS.has(arg)) safe.push(arg);
      else {
        safe.push('<prompt>');
        positionalSeen = true;
      }
    } else if (!arg.startsWith('-')) {
      safe.push(positionalSeen ? '<prompt-part>' : arg);
    } else {
      safe.push(arg);
    }
  }
  return safe;
}

function parseConnectionRole(output) {
  const match = String(output || '').match(/\|\s*Role\s*\|\s*([^|\r\n]+?)\s*\|/i);
  return match ? match[1].trim() : null;
}

function fileMode(filePath) {
  try {
    return fs.statSync(filePath).mode & 0o777;
  } catch {
    return null;
  }
}

function cocoDoctor(options = {}) {
  const env = buildCocoEnv(options.env || process.env);
  const runner = options.runner || spawnSync;
  const cortexBinary = options.cortexBinary || findCortexBinary(env);
  const snowBinary = options.snowBinary || findSnowBinary(env);
  const configPath = path.join(env.SNOWFLAKE_HOME, 'config.toml');
  const connectionPath = path.join(env.SNOWFLAKE_HOME, 'connections.toml');
  const base = {
    schema: 'coco-yolo/doctor-v1',
    connection: CONNECTION,
    snowflakeHome: env.SNOWFLAKE_HOME.replace(HOME, '~'),
    cortexBinary: cortexBinary ? path.basename(cortexBinary) : null,
    snowBinary: snowBinary ? path.basename(snowBinary) : null,
    minimumCortexVersion: MIN_CORTEX_VERSION,
    sqlReadOnly: true,
    mcpEnabledInsideCoco: false,
    silentFallbackAllowed: false,
    headlessExecVerified: false,
    headlessBlocker: 'subscription_headless_mode_not_available_and_no_verified_sql_read_only_exec_flag',
    configMode: fileMode(configPath),
    connectionsMode: fileMode(connectionPath),
    cachedMachineLocalAuth: true,
  };
  if (!cortexBinary) return { ...base, ready: false, blocker: 'cortex_binary_missing' };
  if (!snowBinary) return { ...base, ready: false, blocker: 'snow_cli_missing' };

  const versionProbe = runner(cortexBinary, ['--version'], {
    encoding: 'utf8', timeout: 10000, env,
  });
  const version = parseCortexVersion(`${versionProbe.stdout || ''}\n${versionProbe.stderr || ''}`);
  const versionReady = versionAtLeast(version);
  if (!versionReady) {
    return { ...base, ready: false, blocker: 'cortex_update_required', version, versionReady };
  }

  const acpProbe = runner(cortexBinary, ['acp', 'serve', '--help'], {
    encoding: 'utf8', timeout: 10000, env,
  });
  const acpCommandAvailable = acpProbe.status === 0;

  const connectionProbe = runner(snowBinary, ['connection', 'test', '-c', CONNECTION], {
    encoding: 'utf8', timeout: 30000, env,
  });
  const connectionOutput = `${connectionProbe.stdout || ''}\n${connectionProbe.stderr || ''}`;
  const effectiveRole = parseConnectionRole(connectionOutput);
  const connectionReady = connectionProbe.status === 0;
  const ready = connectionReady && acpCommandAvailable;
  return {
    ...base,
    ready,
    blocker: !connectionReady ? 'snowflake_connection_failed' : !acpCommandAvailable ? 'cortex_acp_unavailable' : null,
    version,
    versionReady,
    connectionReady,
    headlessTransport: 'acp',
    acpCommandAvailable,
    acpReadOnlyMode: 'plan',
    effectiveRole,
    principalLeastPrivilege: Boolean(effectiveRole) && effectiveRole !== 'ACCOUNTADMIN',
    policyBoundary: effectiveRole === 'ACCOUNTADMIN'
      ? 'sql_read_only_client_policy_not_least_privilege_principal'
      : 'sql_read_only_client_policy_plus_restricted_principal',
    error: connectionReady ? null : redact(connectionOutput),
  };
}

function buildReceipt(options = {}) {
  return {
    schema: 'coco-yolo/route-receipt-v1',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: options.host || os.hostname(),
    request: options.request || summarizeUserArgs(options.userArgs || []),
    route: {
      selectedBackend: 'snowflake-coco',
      provider: 'snowflake-cortex-code',
      connection: CONNECTION,
      sqlReadOnly: true,
      mcpEnabledInsideCoco: false,
      transport: options.transport || 'terminal',
      silentFallback: false,
      qwenSelected: false,
    },
    execution: {
      status: options.status || 'unknown',
      exitCode: Number.isInteger(options.exitCode) ? options.exitCode : null,
      signal: options.signal || null,
      durationMs: Number(options.durationMs || 0),
      error: options.error ? redact(options.error) : null,
      stopReason: options.stopReason || null,
      readOnlyMode: options.readOnlyMode || null,
      toolCallCount: Number(options.toolCallCount || 0),
      permissionRequestsDenied: Number(options.permissionRequestsDenied || 0),
    },
  };
}

function writeReceipt(receipt, paths = {}) {
  const latestPath = paths.latestPath || process.env.COCO_YOLO_LATEST_RECEIPT_PATH || DEFAULT_LATEST_RECEIPT;
  const historyPath = paths.historyPath || process.env.COCO_YOLO_HISTORY_RECEIPT_PATH || DEFAULT_HISTORY_RECEIPT;
  fs.mkdirSync(path.dirname(latestPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(historyPath), { recursive: true, mode: 0o700 });
  const serialized = `${JSON.stringify(receipt)}\n`;
  const temporary = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, serialized, { mode: 0o600 });
  fs.renameSync(temporary, latestPath);
  fs.appendFileSync(historyPath, serialized, { mode: 0o600 });
  fs.chmodSync(latestPath, 0o600);
  fs.chmodSync(historyPath, 0o600);
  return { latestPath, historyPath };
}

function runCoco(userArgs = [], options = {}) {
  const env = buildCocoEnv(options.env || process.env);
  const binary = options.binary || findCortexBinary(env);
  const started = Date.now();
  if (!binary) {
    const receipt = buildReceipt({
      userArgs, status: 'blocked', exitCode: 127, error: 'Cortex Code binary not found',
    });
    writeReceipt(receipt, options.receiptPaths);
    return { exitCode: 127, receipt, error: 'Cortex Code binary not found' };
  }

  let cortexArgs;
  try {
    cortexArgs = buildCortexArgs(userArgs);
  } catch (error) {
    const receipt = buildReceipt({
      userArgs, status: 'blocked', exitCode: 2, error: error.message,
    });
    writeReceipt(receipt, options.receiptPaths);
    return { exitCode: 2, receipt, error: error.message };
  }

  const runner = options.runner || spawnSync;
  const result = runner(binary, cortexArgs, {
    stdio: options.stdio || 'inherit',
    env,
    cwd: options.cwd || process.cwd(),
  });
  const exitCode = result.error ? 127 : result.status == null ? 1 : result.status;
  const receipt = buildReceipt({
    userArgs,
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
    signal: result.signal || null,
    durationMs: Date.now() - started,
    error: result.error ? result.error.message : null,
  });
  writeReceipt(receipt, options.receiptPaths);
  return { exitCode, receipt, error: result.error ? result.error.message : null };
}

async function runCocoPrompt(userArgs = [], options = {}) {
  const prompt = promptFromArgs(userArgs);
  const started = Date.now();
  try {
    const result = await (options.acpRunner || runAcpPrompt)(prompt, options);
    if (!result.text) throw new Error('Cortex ACP completed without an agent response');
    const receipt = buildReceipt({
      userArgs,
      transport: 'acp',
      status: result.stopReason === 'end_turn' ? 'pass' : 'fail',
      exitCode: result.stopReason === 'end_turn' ? 0 : 1,
      durationMs: Date.now() - started,
      stopReason: result.stopReason,
      readOnlyMode: result.mode,
      toolCallCount: result.toolCalls.length,
      permissionRequestsDenied: result.permissionRequestsDenied,
      error: result.stopReason === 'end_turn' ? null : `ACP stopped with ${result.stopReason || 'unknown reason'}`,
    });
    writeReceipt(receipt, options.receiptPaths);
    return {
      exitCode: receipt.execution.exitCode,
      text: result.text,
      receipt,
      acp: result,
      error: receipt.execution.error,
    };
  } catch (error) {
    const receipt = buildReceipt({
      userArgs,
      transport: 'acp',
      status: 'fail',
      exitCode: 1,
      durationMs: Date.now() - started,
      readOnlyMode: 'plan-required',
      error: error.message,
    });
    writeReceipt(receipt, options.receiptPaths);
    return { exitCode: 1, text: '', receipt, acp: null, error: error.message };
  }
}

function usage() {
  return `Usage:
  coco-yolo                         Open dedicated Snowflake Cortex Code
  coco-yolo "analyze HERMES data"   Run one ACP turn in read-only plan mode
  coco-yolo --doctor --json         Verify cached auth and read-only controls
  coco-yolo --dry-run --json PROMPT Show a prompt-free launch plan

SQL read-only mode, connection ${CONNECTION}, disabled in-session MCP, and
disabled auto-update are enforced for the terminal. Prompt arguments use the
official ACP transport, force plan mode, expose no client filesystem/terminal,
and reject every permission request. Exec/print and connection/model overrides
are refused because they are not verified under the same controls.`;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  if (argv.includes('--doctor') || argv.includes('--route-status')) {
    const doctor = cocoDoctor();
    if (argv.includes('--json')) console.log(JSON.stringify(doctor, null, 2));
    else console.log(doctor.ready ? 'coco-yolo: READY' : `coco-yolo: BLOCKED (${doctor.blocker})`);
    return doctor.ready ? 0 : 2;
  }
  if (argv.includes('--dry-run')) {
    const userArgs = argv.filter((arg) => !['--dry-run', '--json'].includes(arg));
    try {
      const binary = findCortexBinary();
      const args = buildCortexArgs(userArgs);
      const output = {
        schema: 'coco-yolo/dry-run-v1',
        ready: Boolean(binary),
        binary: binary ? path.basename(binary) : null,
        connection: CONNECTION,
        sqlReadOnly: true,
        mcpEnabledInsideCoco: false,
        args: safeCommandSummary(args),
      };
      console.log(argv.includes('--json') ? JSON.stringify(output, null, 2) : safeCommandSummary(args).join(' '));
      return binary ? 0 : 2;
    } catch (error) {
      console.error(`[coco-yolo] ${redact(error.message)}`);
      return 2;
    }
  }
  if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-V')) {
    const binary = findCortexBinary();
    if (!binary) {
      console.error('[coco-yolo] Cortex Code binary not found');
      return 127;
    }
    const result = spawnSync(binary, ['--version'], { stdio: 'inherit', env: buildCocoEnv() });
    return result.status == null ? 1 : result.status;
  }

  if (isPromptInvocation(argv)) {
    const result = await runCocoPrompt(argv);
    if (result.text) console.log(result.text);
    if (result.error) console.error(`[coco-yolo] ${redact(result.error)}`);
    return result.exitCode;
  }

  const result = runCoco(argv);
  if (result.error) console.error(`[coco-yolo] ${redact(result.error)}`);
  return result.exitCode;
}

if (require.main === module) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(`[coco-yolo] ${redact(error.message)}`);
      process.exitCode = 1;
    });
}

module.exports = {
  BLOCKED_FLAGS,
  CONNECTION,
  HEADLESS_COMMANDS,
  MIN_CORTEX_VERSION,
  assertSafeArgs,
  AcpClient,
  buildCocoEnv,
  buildCortexArgs,
  buildReceipt,
  cocoDoctor,
  findCortexBinary,
  findSnowBinary,
  findPlanMode,
  isPromptInvocation,
  main,
  parseConnectionRole,
  parseCortexVersion,
  permissionDenial,
  redact,
  runAcpPrompt,
  runCoco,
  runCocoPrompt,
  safeCommandSummary,
  summarizeUserArgs,
  usage,
  versionAtLeast,
  writeReceipt,
};
