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
  'litellm',
  'snow',
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
const SAFE_MODEL_RECIPES = [
  {
    model: 'qwen3:8b-hermes-20k',
    base: 'qwen3:8b',
    contextLength: 20480,
  },
  {
    model: 'qwen2.5:3b-hermes-20k',
    base: 'qwen2.5:3b',
    contextLength: 20480,
  },
];
const LOCAL_MODEL_CANDIDATES = SAFE_MODEL_RECIPES.map((recipe) => recipe.model);
const QUIESCED_MODEL_LAUNCH_AGENTS = [
  'com.igor.hermes-litellm',
  'com.igor.hermes-competence-probe',
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

function replaceableCommandPath(filePath, env = process.env) {
  const prefixes = [
    homeDir(env),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...String(env.HERMES_ZERO_SPEND_REPLACE_PREFIXES || '').split(path.delimiter).filter(Boolean),
  ];
  return prefixes.some((prefix) => {
    const relative = path.relative(prefix, filePath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  });
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
  const effective = findExecutable(name, env);
  if (
    previous &&
    effective === previous.shimPath &&
    resolvesTo(previous.shimPath, loc.installedGate)
  ) return previous;

  const discovered = effective;
  const localShim = path.join(loc.home, '.local', 'bin', name);
  const shimPath = discovered && replaceableCommandPath(discovered, env) ? discovered : localShim;
  fs.mkdirSync(path.dirname(shimPath), { recursive: true, mode: 0o700 });

  let original = previous && previous.original ? previous.original : null;
  if (discovered && !resolvesTo(discovered, loc.installedGate)) {
    if (discovered !== shimPath) {
      if (!original) original = discovered;
    } else if (fs.lstatSync(discovered).isSymbolicLink()) {
      original = fs.realpathSync(discovered);
      fs.unlinkSync(discovered);
    } else {
      const backup = path.join(loc.originalsDir, backupName(name, discovered));
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(discovered, backup);
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

function modelContextLength(model) {
  return SAFE_MODEL_RECIPES.find((recipe) => recipe.model === model)?.contextLength || 20480;
}

function localConfig(model) {
  const quotedModel = yamlQuote(model);
  const contextLength = modelContextLength(model);
  return [
    'model:',
    '  provider: custom:ollama-local-64k',
    `  default: ${quotedModel}`,
    '  base_url: http://127.0.0.1:11434/v1',
    `  context_length: ${contextLength}`,
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
    `    context_length: ${contextLength}`,
    '    models:',
    `      ${quotedModel}:`,
    `        context_length: ${contextLength}`,
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

function runQuiet(binary, args, env = process.env) {
  return spawnSync(binary, args, {
    encoding: 'utf8',
    timeout: 10000,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function launchctlValue(name, env = process.env) {
  if (process.platform !== 'darwin') return null;
  const result = runQuiet('/bin/launchctl', ['getenv', name], env);
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function routePlist(loc) {
  return path.join(loc.home, 'Library', 'LaunchAgents', 'com.igor.hermes-yolo-route.plist');
}

function guardScript(loc) {
  return path.join(loc.home, '.hermes', 'hermes-yolo-guard.sh');
}

function replaceGuardStable(filePath, stablePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const previous = text.split(/\r?\n/).find((line) => line.startsWith('STABLE=')) || null;
  const next = text.replace(/^STABLE=.*$/m, `STABLE=${JSON.stringify(stablePath)}`);
  if (next === text && !previous) throw new Error('Hermes YOLO guard has no STABLE assignment');
  writePrivateFile(filePath, next, 0o700);
  return previous;
}

function reloadRoutePlist(plist, env = process.env) {
  if (!fs.existsSync(plist) || process.platform !== 'darwin') return;
  const domain = `gui/${process.getuid()}/com.igor.hermes-yolo-route`;
  runQuiet('/bin/launchctl', ['bootout', domain], env);
  const bootstrap = runQuiet('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plist], env);
  if (bootstrap.status !== 0) {
    throw new Error(`failed to reload zero-spend route LaunchAgent (exit ${bootstrap.status})`);
  }
}

function launchAgentPlist(label, env = process.env) {
  return path.join(homeDir(env), 'Library', 'LaunchAgents', `${label}.plist`);
}

function launchAgentLoaded(label, env = process.env) {
  if (process.platform !== 'darwin') return false;
  return runQuiet('/bin/launchctl', ['print', `gui/${process.getuid()}/${label}`], env).status === 0;
}

function launchAgentDisabled(label, env = process.env) {
  if (process.platform !== 'darwin') return false;
  const result = runQuiet('/bin/launchctl', ['print-disabled', `gui/${process.getuid()}`], env);
  if (result.status !== 0) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}"\\s*=>\\s*true`).test(result.stdout || '');
}

function quiesceModelLaunchAgents(manifest, env = process.env) {
  if (process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1') return;
  if (!manifest.previousQuiescedLaunchAgents) {
    manifest.previousQuiescedLaunchAgents = QUIESCED_MODEL_LAUNCH_AGENTS
      .map((label) => ({
        label,
        plist: launchAgentPlist(label, env),
        existed: fs.existsSync(launchAgentPlist(label, env)),
        loaded: launchAgentLoaded(label, env),
        disabled: launchAgentDisabled(label, env),
      }))
      .filter((entry) => entry.existed || entry.loaded);
    writePrivateFile(locations(env).manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  for (const label of QUIESCED_MODEL_LAUNCH_AGENTS) {
    const plist = launchAgentPlist(label, env);
    if (!fs.existsSync(plist) && !launchAgentLoaded(label, env)) continue;
    const disable = runQuiet('/bin/launchctl', ['disable', `gui/${process.getuid()}/${label}`], env);
    if (disable.status !== 0) throw new Error(`failed to disable zero-spend model daemon ${label}`);
    if (launchAgentLoaded(label, env)) {
      const bootout = runQuiet('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${label}`], env);
      if (bootout.status !== 0) throw new Error(`failed to stop zero-spend model daemon ${label}`);
    }
  }
}

function restoreModelLaunchAgents(manifest, env = process.env) {
  if (process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1') return;
  for (const entry of manifest.previousQuiescedLaunchAgents || []) {
    runQuiet('/bin/launchctl', [entry.disabled ? 'disable' : 'enable', `gui/${process.getuid()}/${entry.label}`], env);
    if (entry.loaded && entry.existed && fs.existsSync(entry.plist) && !launchAgentLoaded(entry.label, env)) {
      runQuiet('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, entry.plist], env);
    }
  }
}

function enforceMacPolicy(model, manifest, env = process.env) {
  if (process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1') return;
  const loc = locations(env);
  if (!manifest.previousLaunchctlEnvironment) {
    manifest.previousLaunchctlEnvironment = {
      HERMES_YOLO_PROVIDER: launchctlValue('HERMES_YOLO_PROVIDER', env),
      HERMES_YOLO_MODEL: launchctlValue('HERMES_YOLO_MODEL', env),
      HERMES_YOLO_BACKEND: launchctlValue('HERMES_YOLO_BACKEND', env),
    };
  }
  for (const [name, value] of Object.entries({
    HERMES_YOLO_PROVIDER: LOCAL_PROVIDER,
    HERMES_YOLO_MODEL: model,
    HERMES_YOLO_BACKEND: 'hermes',
  })) {
    const result = runQuiet('/bin/launchctl', ['setenv', name, value], env);
    if (result.status !== 0) throw new Error(`launchctl setenv failed for ${name}`);
  }
  quiesceModelLaunchAgents(manifest, env);

  const plist = routePlist(loc);
  if (fs.existsSync(plist)) {
    if (!manifest.previousRouteProgramArguments) {
      const current = runQuiet('/usr/bin/plutil', ['-extract', 'ProgramArguments', 'json', '-o', '-', plist], env);
      if (current.status === 0) manifest.previousRouteProgramArguments = JSON.parse(current.stdout);
    }
    const command = `launchctl setenv HERMES_YOLO_PROVIDER ${shellQuote(LOCAL_PROVIDER)}; ` +
      `launchctl setenv HERMES_YOLO_MODEL ${shellQuote(model)}; ` +
      'launchctl setenv HERMES_YOLO_BACKEND hermes';
    const update = runQuiet('/usr/bin/plutil', [
      '-replace', 'ProgramArguments', '-json', JSON.stringify(['/bin/sh', '-c', command]), plist,
    ], env);
    if (update.status !== 0) throw new Error('failed to update zero-spend route LaunchAgent');
    reloadRoutePlist(plist, env);
  }

  const guard = guardScript(loc);
  if (fs.existsSync(guard)) {
    const previous = replaceGuardStable(guard, loc.installedGate);
    if (!manifest.previousGuardStable && previous) manifest.previousGuardStable = previous;
    const reinforce = runQuiet('/bin/bash', [guard], env);
    if (reinforce.status !== 0) throw new Error('Hermes YOLO guard failed to reinforce zero-spend gate');
  }
}

function restoreMacPolicy(manifest, env = process.env) {
  if (process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1') return;
  const loc = locations(env);
  for (const name of ['HERMES_YOLO_PROVIDER', 'HERMES_YOLO_MODEL', 'HERMES_YOLO_BACKEND']) {
    const previous = manifest.previousLaunchctlEnvironment && manifest.previousLaunchctlEnvironment[name];
    runQuiet('/bin/launchctl', previous
      ? ['setenv', name, previous]
      : ['unsetenv', name], env);
  }
  const plist = routePlist(loc);
  if (fs.existsSync(plist) && Array.isArray(manifest.previousRouteProgramArguments)) {
    const update = runQuiet('/usr/bin/plutil', [
      '-replace', 'ProgramArguments', '-json', JSON.stringify(manifest.previousRouteProgramArguments), plist,
    ], env);
    if (update.status === 0) reloadRoutePlist(plist, env);
  }
  const guard = guardScript(loc);
  if (fs.existsSync(guard) && manifest.previousGuardStable) {
    const text = fs.readFileSync(guard, 'utf8');
    writePrivateFile(guard, text.replace(/^STABLE=.*$/m, manifest.previousGuardStable), 0o700);
    runQuiet('/bin/bash', [guard], env);
  }
  restoreModelLaunchAgents(manifest, env);
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
  fs.mkdirSync(loc.stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(loc.originalsDir, { recursive: true, mode: 0o700 });
  copyGate(__filename, loc.installedGate);
  const model = provisionSafeLocalModel(env);
  if (!model) {
    throw new Error('zero-spend install requires an installed compact Ollama base model');
  }

  const previous = readJson(loc.manifest, {});
  const manifest = {
    schema: 'hermes-zero-spend/manifest-v1',
    installedAt: new Date().toISOString(),
    gate: loc.installedGate,
    marker: loc.marker,
    commands: previous.commands || {},
  };
  for (const key of [
    'previousManagedDir',
    'previousLaunchctlEnvironment',
    'previousRouteProgramArguments',
    'previousGuardStable',
    'previousQuiescedLaunchAgents',
  ]) {
    if (Object.hasOwn(previous, key)) manifest[key] = previous[key];
  }
  for (const name of commandNames(env)) {
    manifest.commands[name] = installCommand(name, manifest, env);
  }
  manifest.localModel = model;
  installPolicyFiles(model, manifest, env);
  enforceMacPolicy(model, manifest, env);
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
  restoreMacPolicy(manifest, env);
  return status(env);
}

function status(env = process.env) {
  const loc = locations(env);
  const manifest = readJson(loc.manifest, { commands: {} });
  const guardText = (() => {
    try { return fs.readFileSync(guardScript(loc), 'utf8'); } catch { return ''; }
  })();
  const commands = Object.values(manifest.commands || {}).map((entry) => ({
    name: entry.name,
    policy: entry.policy,
    installed: resolvesTo(entry.shimPath, loc.installedGate),
    originalAvailable: Boolean(entry.original && fs.existsSync(entry.original)),
  }));
  const quiescedLaunchAgents = process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1'
    ? []
    : QUIESCED_MODEL_LAUNCH_AGENTS
      .filter((label) => fs.existsSync(launchAgentPlist(label, env)) || launchAgentLoaded(label, env))
      .map((label) => ({
        label,
        loaded: launchAgentLoaded(label, env),
        disabled: launchAgentDisabled(label, env),
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
    launchctlPolicyActive: process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1'
      ? null
      : launchctlValue('HERMES_YOLO_PROVIDER', env) === LOCAL_PROVIDER &&
        launchctlValue('HERMES_YOLO_MODEL', env) === manifest.localModel &&
        launchctlValue('HERMES_YOLO_BACKEND', env) === 'hermes',
    guardReinforcesGate: guardText
      ? guardText.includes(`STABLE=${JSON.stringify(loc.installedGate)}`)
      : null,
    localModel: manifest.localModel || null,
    localContextLength: manifest.localModel ? modelContextLength(manifest.localModel) : null,
    modelDaemonsQuiesced: process.platform !== 'darwin' || env.HERMES_ZERO_SPEND_SKIP_LAUNCHCTL === '1'
      ? null
      : quiescedLaunchAgents.every((entry) => !entry.loaded && entry.disabled),
    quiescedLaunchAgents,
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

function safeModelFile(recipe) {
  return [
    `FROM ${recipe.base}`,
    `PARAMETER num_ctx ${recipe.contextLength}`,
    'PARAMETER temperature 0.3',
    'PARAMETER top_k 20',
    'PARAMETER top_p 0.9',
    'PARAMETER repeat_penalty 1',
    '',
  ].join('\n');
}

function provisionSafeLocalModel(env = process.env) {
  let installed = installedLocalModels(env);
  const ready = LOCAL_MODEL_CANDIDATES.find((model) => installed.includes(model));
  if (ready) return ready;
  if (env.HERMES_ZERO_SPEND_LOCAL_MODELS) return null;

  const ollama = findOllama(env);
  if (!ollama) return null;
  for (const recipe of SAFE_MODEL_RECIPES) {
    if (!installed.includes(recipe.base)) continue;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-zero-spend-model-'));
    const modelFile = path.join(tempDir, 'Modelfile');
    try {
      writePrivateFile(modelFile, safeModelFile(recipe));
      const create = spawnSync(ollama, ['create', recipe.model, '--file', modelFile], {
        encoding: 'utf8',
        timeout: 120000,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (create.status !== 0) continue;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    installed = installedLocalModels(env);
    if (installed.includes(recipe.model)) return recipe.model;
  }
  return null;
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
  QUIESCED_MODEL_LAUNCH_AGENTS,
  SAFE_MODEL_RECIPES,
  chooseLocalModel,
  commandNames,
  disable,
  findExecutable,
  enforceMacPolicy,
  install,
  installPolicyFiles,
  installedLocalModels,
  invocationName,
  localOnlyEnv,
  localConfig,
  locations,
  main,
  markerActive,
  modelContextLength,
  provisionSafeLocalModel,
  quiesceModelLaunchAgents,
  replaceableCommandPath,
  restoreMacPolicy,
  restoreModelLaunchAgents,
  runCommand,
  safeModelFile,
  status,
  writePrivateFile,
};
