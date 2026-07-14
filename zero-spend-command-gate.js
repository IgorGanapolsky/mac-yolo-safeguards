#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BLOCKED_EXIT = 73;
const LOCAL_PROVIDER = 'custom:ollama-local-64k';
const DEFAULT_COMMANDS = [
  'hermes-yolo',
  'grok-yolo',
  'meta-yolo',
  'coco-yolo',
  '9router-yolo',
  'ali-yolo',
  'amp-yolo',
  'bob-yolo',
  'ibm-yolo',
  'gemini-yolo',
  'grok',
  'cortex',
  'bob',
  'qwen',
  'gemini',
  'amp',
  'parallel',
  'parallel-cli',
];
const PAID_CREDENTIAL_ENV = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'META_MODEL_API_KEY',
  'NVIDIA_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'PARALLEL_API_KEY',
  'SNOWFLAKE_PASSWORD',
  'SNOWFLAKE_PAT',
  'SNOWFLAKE_TOKEN',
  'XAI_API_KEY',
  'ZAI_API_KEY',
  'Z_AI_API_KEY',
];
const LOCAL_MODEL_CANDIDATES = [
  'qwen3:8b-agent-64k',
  'qwen3:8b-64k',
  'qwen3.5:9b',
  'qwen3:8b-agent-32k',
  'qwen3:8b',
  'qwen2.5-coder:14b-64k',
  'qwen2.5:3b-64k',
  'qwen2.5:3b',
];

function homeDir(env = process.env) {
  return env.HOME || os.homedir();
}

function locations(env = process.env) {
  const home = homeDir(env);
  const stateDir = env.HERMES_ZERO_SPEND_STATE_DIR || path.join(home, '.hermes', 'zero-spend');
  return {
    home,
    stateDir,
    marker: env.HERMES_ZERO_SPEND_MARKER || path.join(home, '.hermes', 'NO_PAID_SPEND'),
    manifest: env.HERMES_ZERO_SPEND_MANIFEST || path.join(stateDir, 'manifest.json'),
    installedGate: env.HERMES_ZERO_SPEND_GATE || path.join(stateDir, 'zero-spend-command-gate.js'),
    originalsDir: path.join(stateDir, 'originals'),
    receiptDir: env.HERMES_ZERO_SPEND_RECEIPT_DIR || path.join(home, '.hermes', 'receipts', 'zero-spend'),
    hermesEnv: path.join(home, '.hermes', '.env'),
    localHermesHome: path.join(stateDir, 'hermes-home'),
    managedDir: path.join(stateDir, 'managed'),
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writePrivateFile(filePath, content, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { mode });
  fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, mode);
}

function safeMode(filePath) {
  try {
    return fs.statSync(filePath).mode & 0o777;
  } catch {
    return null;
  }
}

function markerActive(env = process.env) {
  if (env.HERMES_ZERO_SPEND === '0') return false;
  if (env.HERMES_ZERO_SPEND === '1') return true;
  return fs.existsSync(locations(env).marker);
}

function commandNames(env = process.env) {
  const configured = String(env.HERMES_ZERO_SPEND_COMMANDS || '').trim();
  if (!configured) return DEFAULT_COMMANDS;
  return [...new Set(configured.split(',').map((value) => value.trim()).filter(Boolean))];
}

function pathEntries(env = process.env) {
  return String(env.PATH || '').split(path.delimiter).filter(Boolean);
}

function findExecutable(name, env = process.env) {
  for (const directory of pathEntries(env)) {
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function underHome(filePath, env = process.env) {
  const relative = path.relative(homeDir(env), filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolvesTo(filePath, target) {
  try {
    return fs.realpathSync(filePath) === fs.realpathSync(target);
  } catch {
    return false;
  }
}

function backupName(name, originalPath) {
  const suffix = Buffer.from(originalPath).toString('hex').slice(0, 16);
  return `${name}-${suffix}`;
}

function installCommand(name, manifest, env = process.env) {
  const loc = locations(env);
  const previous = manifest.commands[name];
  if (previous && resolvesTo(previous.shimPath, loc.installedGate)) return previous;

  const discovered = findExecutable(name, env);
  const localShim = path.join(loc.home, '.local', 'bin', name);
  const shimPath = discovered && underHome(discovered, env) ? discovered : localShim;
  fs.mkdirSync(path.dirname(shimPath), { recursive: true, mode: 0o700 });

  let original = previous && previous.original ? previous.original : null;
  if (!original && discovered && !resolvesTo(discovered, loc.installedGate)) {
    if (discovered !== shimPath) {
      original = discovered;
    } else if (fs.lstatSync(discovered).isSymbolicLink()) {
      original = fs.realpathSync(discovered);
      fs.unlinkSync(discovered);
    } else {
      const backup = path.join(loc.originalsDir, backupName(name, discovered));
      if (!fs.existsSync(backup)) fs.renameSync(discovered, backup);
      else fs.unlinkSync(discovered);
      original = backup;
    }
  }

  try { fs.unlinkSync(shimPath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.symlinkSync(loc.installedGate, shimPath);

  return {
    name,
    shimPath,
    original,
    policy: name === 'hermes-yolo' ? 'local-only' : 'blocked',
  };
}

function copyGate(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  if (path.resolve(source) !== path.resolve(destination)) {
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.copyFileSync(source, temporary);
    fs.chmodSync(temporary, 0o700);
    fs.renameSync(temporary, destination);
  }
  fs.chmodSync(destination, 0o700);
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function localConfig(model) {
  const quotedModel = yamlQuote(model);
  return [
    'model:',
    '  provider: custom:ollama-local-64k',
    `  default: ${quotedModel}`,
    '  base_url: http://127.0.0.1:11434/v1',
    '  context_length: 65536',
    'providers:',
    '  ollama-local-64k:',
    '    name: Ollama Local Zero Spend',
    '    api: http://127.0.0.1:11434/v1',
    '    base_url: http://127.0.0.1:11434/v1',
    '    api_key: ollama',
    `    default_model: ${quotedModel}`,
    `    model: ${quotedModel}`,
    '    transport: chat_completions',
    '    discover_models: true',
    '    context_length: 65536',
    '    models:',
    `      ${quotedModel}:`,
    '        context_length: 65536',
    'fallback_providers:',
    '  - provider: custom:ollama-local-64k',
    `    model: ${quotedModel}`,
    '    base_url: http://127.0.0.1:11434/v1',
    'agent:',
    '  disabled_toolsets:',
    '    - web',
    '    - browser',
    '    - computer_use',
    '',
  ].join('\n');
}

function managedEnv() {
  return `${PAID_CREDENTIAL_ENV.map((name) => `${name}=`).join('\n')}\n`;
}

function envAssignment(filePath, key) {
  try {
    const line = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : null;
  } catch {
    return null;
  }
}

function setEnvAssignment(filePath, key, value) {
  let lines = [];
  try { lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/); } catch {}
  let replaced = false;
  const next = [];
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      if (!replaced && value !== null) next.push(`${key}=${value}`);
      replaced = true;
    } else if (line || next.length > 0) {
      next.push(line);
    }
  }
  if (!replaced && value !== null) next.push(`${key}=${value}`);
  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  writePrivateFile(filePath, next.length > 0 ? `${next.join('\n')}\n` : '');
}

function installPolicyFiles(model, manifest, env = process.env) {
  const loc = locations(env);
  fs.mkdirSync(loc.localHermesHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(loc.managedDir, { recursive: true, mode: 0o700 });
  const config = localConfig(model);
  writePrivateFile(path.join(loc.localHermesHome, 'config.yaml'), config);
  writePrivateFile(path.join(loc.localHermesHome, '.env'), '# zero-spend profile: no provider credentials\n');
  writePrivateFile(path.join(loc.managedDir, 'config.yaml'), config);
  writePrivateFile(path.join(loc.managedDir, '.env'), managedEnv());
  if (!Object.hasOwn(manifest, 'previousManagedDir')) {
    manifest.previousManagedDir = envAssignment(loc.hermesEnv, 'HERMES_MANAGED_DIR');
  }
  setEnvAssignment(loc.hermesEnv, 'HERMES_MANAGED_DIR', loc.managedDir);
}

function install(env = process.env) {
  const loc = locations(env);
  const model = chooseLocalModel(env);
  if (!model) throw new Error('zero-spend install requires a verified local Ollama model');
  fs.mkdirSync(loc.stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(loc.originalsDir, { recursive: true, mode: 0o700 });
  copyGate(__filename, loc.installedGate);

  const previous = readJson(loc.manifest, {});
  const manifest = {
    schema: 'hermes-zero-spend/manifest-v1',
    installedAt: new Date().toISOString(),
    gate: loc.installedGate,
    marker: loc.marker,
    commands: previous.commands || {},
  };
  if (Object.hasOwn(previous, 'previousManagedDir')) {
    manifest.previousManagedDir = previous.previousManagedDir;
  }
  for (const name of commandNames(env)) {
    manifest.commands[name] = installCommand(name, manifest, env);
  }
  installPolicyFiles(model, manifest, env);
  manifest.localModel = model;
  writePrivateFile(loc.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  writePrivateFile(loc.marker, `${JSON.stringify({
    schema: 'hermes-zero-spend/policy-v1',
    enabledAt: new Date().toISOString(),
    policy: 'no-paid-provider-or-metered-token-execution',
  })}\n`);
  return status(env);
}

function disable(env = process.env) {
  const loc = locations(env);
  const manifest = readJson(loc.manifest, {});
  try { fs.unlinkSync(loc.marker); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (envAssignment(loc.hermesEnv, 'HERMES_MANAGED_DIR') === loc.managedDir) {
    setEnvAssignment(
      loc.hermesEnv,
      'HERMES_MANAGED_DIR',
      Object.hasOwn(manifest, 'previousManagedDir') ? manifest.previousManagedDir : null,
    );
  }
  return status(env);
}

function status(env = process.env) {
  const loc = locations(env);
  const manifest = readJson(loc.manifest, { commands: {} });
  const commands = Object.values(manifest.commands || {}).map((entry) => ({
    name: entry.name,
    policy: entry.policy,
    installed: resolvesTo(entry.shimPath, loc.installedGate),
    originalAvailable: Boolean(entry.original && fs.existsSync(entry.original)),
  }));
  return {
    schema: 'hermes-zero-spend/status-v1',
    active: markerActive(env),
    markerMode: safeMode(loc.marker),
    manifestMode: safeMode(loc.manifest),
    gateMode: safeMode(loc.installedGate),
    localConfigMode: safeMode(path.join(loc.localHermesHome, 'config.yaml')),
    managedConfigMode: safeMode(path.join(loc.managedDir, 'config.yaml')),
    managedEnvMode: safeMode(path.join(loc.managedDir, '.env')),
    globalHermesPolicyActive: envAssignment(loc.hermesEnv, 'HERMES_MANAGED_DIR') === loc.managedDir,
    localModel: manifest.localModel || null,
    commandCount: commands.length,
    commands,
  };
}

function invocationName(env = process.env) {
  return env.HERMES_ZERO_SPEND_INVOKED_AS || path.basename(process.argv[1] || 'zero-spend-command-gate');
}

function manifestEntry(name, env = process.env) {
  const manifest = readJson(locations(env).manifest, { commands: {} });
  return manifest.commands && manifest.commands[name] || null;
}

function findOllama(env = process.env) {
  const candidates = [
    env.OLLAMA_BIN,
    findExecutable('ollama', env),
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
    '/Applications/Ollama.app/Contents/Resources/ollama',
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  }) || null;
}

function installedLocalModels(env = process.env) {
  if (env.HERMES_ZERO_SPEND_LOCAL_MODELS) {
    return env.HERMES_ZERO_SPEND_LOCAL_MODELS.split(',').map((value) => value.trim()).filter(Boolean);
  }
  const ollama = findOllama(env);
  if (!ollama) return [];
  const result = spawnSync(ollama, ['list'], {
    encoding: 'utf8',
    timeout: 5000,
    env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function chooseLocalModel(env = process.env) {
  const installed = installedLocalModels(env);
  return LOCAL_MODEL_CANDIDATES.find((model) => installed.includes(model)) || null;
}

function localOnlyEnv(env, model) {
  const childEnv = { ...env };
  for (const name of PAID_CREDENTIAL_ENV) childEnv[name] = '';
  const loc = locations(env);
  Object.assign(childEnv, {
    HERMES_ZERO_SPEND: '1',
    HERMES_HOME: loc.localHermesHome,
    HERMES_ENV_PATH: path.join(loc.localHermesHome, '.env'),
    HERMES_CONFIG_PATH: path.join(loc.localHermesHome, 'config.yaml'),
    HERMES_MANAGED_DIR: path.join(loc.localHermesHome, 'managed-disabled'),
    HERMES_YOLO_BACKEND: 'hermes',
    HERMES_YOLO_PROVIDER: LOCAL_PROVIDER,
    HERMES_YOLO_MODEL: model,
    HERMES_YOLO_TOOLSETS: 'terminal,file,code_execution,memory,clarify',
  });
  return childEnv;
}

function writeReceipt(command, outcome, details = {}, env = process.env) {
  const loc = locations(env);
  const receipt = {
    schema: 'hermes-zero-spend/receipt-v1',
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    command,
    policy: command === 'hermes-yolo' ? 'local-only' : 'blocked',
    outcome,
    originalSpawned: Boolean(details.originalSpawned),
    model: details.model || null,
    exitCode: details.exitCode,
  };
  fs.mkdirSync(loc.receiptDir, { recursive: true, mode: 0o700 });
  writePrivateFile(path.join(loc.receiptDir, 'latest.json'), `${JSON.stringify(receipt)}\n`);
  const history = path.join(loc.receiptDir, 'history.jsonl');
  fs.appendFileSync(history, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  fs.chmodSync(history, 0o600);
  return receipt;
}

function spawnOriginal(entry, args, env = process.env) {
  if (!entry || !entry.original || !fs.existsSync(entry.original)) {
    console.error('[zero-spend] original command is unavailable; refusing fallback');
    return 127;
  }
  const result = spawnSync(entry.original, args, { stdio: 'inherit', env });
  if (result.error) {
    console.error(`[zero-spend] command failed to start: ${result.error.code || 'spawn_error'}`);
    return 127;
  }
  return result.status == null ? 1 : result.status;
}

function runCommand(name, args, env = process.env) {
  const entry = manifestEntry(name, env);
  if (!markerActive(env)) return spawnOriginal(entry, args, env);

  if (name !== 'hermes-yolo') {
    writeReceipt(name, 'blocked', { originalSpawned: false, exitCode: BLOCKED_EXIT }, env);
    console.error(`[zero-spend] ${name} blocked before provider execution (zero paid spend is active)`);
    return BLOCKED_EXIT;
  }

  const model = chooseLocalModel(env);
  if (!model) {
    writeReceipt(name, 'blocked', { originalSpawned: false, exitCode: 69 }, env);
    console.error('[zero-spend] hermes-yolo blocked: no verified local Ollama model is installed');
    return 69;
  }
  const exitCode = spawnOriginal(entry, args, localOnlyEnv(env, model));
  writeReceipt(name, exitCode === 0 ? 'local-pass' : 'local-fail', {
    originalSpawned: true,
    model,
    exitCode,
  }, env);
  return exitCode;
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (argv[0] === '--install') {
    console.log(JSON.stringify(install(env), null, 2));
    return 0;
  }
  if (argv[0] === '--disable') {
    console.log(JSON.stringify(disable(env), null, 2));
    return 0;
  }
  if (argv[0] === '--status' || argv[0] === '--zero-spend-status') {
    console.log(JSON.stringify(status(env), null, 2));
    return 0;
  }
  return runCommand(invocationName(env), argv, env);
}

if (require.main === module) process.exitCode = main();

module.exports = {
  BLOCKED_EXIT,
  DEFAULT_COMMANDS,
  LOCAL_MODEL_CANDIDATES,
  LOCAL_PROVIDER,
  PAID_CREDENTIAL_ENV,
  chooseLocalModel,
  commandNames,
  disable,
  findExecutable,
  install,
  installPolicyFiles,
  installedLocalModels,
  invocationName,
  localOnlyEnv,
  localConfig,
  locations,
  main,
  markerActive,
  runCommand,
  status,
  writePrivateFile,
};
