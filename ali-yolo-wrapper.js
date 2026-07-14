#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PINNED_VERSION = '0.19.10';
const ALIBABA_HOSTS = new Set([
  'dashscope.aliyuncs.com',
  'dashscope-us.aliyuncs.com',
  'coding.dashscope.aliyuncs.com',
  'coding-intl.dashscope.aliyuncs.com',
]);
const ALIBABA_KEYS = new Set([
  'DASHSCOPE_API_KEY',
  'BAILIAN_CODING_PLAN_API_KEY',
]);

function findExecutable(name) {
  const search = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
  for (const directory of search) {
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function resolveQwen() {
  if (process.env.ALI_QWEN_BIN) {
    try {
      fs.accessSync(process.env.ALI_QWEN_BIN, fs.constants.X_OK);
      return process.env.ALI_QWEN_BIN;
    } catch {
      return null;
    }
  }
  const found = findExecutable('qwen');
  if (found) return found;
  for (const candidate of [
    path.join(os.homedir(), '.npm-global/bin/qwen'),
    path.join(os.homedir(), '.local/bin/qwen'),
    '/opt/homebrew/bin/qwen',
    '/usr/local/bin/qwen',
  ]) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function readSettings() {
  const settingsPath = process.env.ALI_QWEN_SETTINGS || path.join(os.homedir(), '.qwen/settings.json');
  try {
    return { path: settingsPath, value: JSON.parse(fs.readFileSync(settingsPath, 'utf8')), error: null };
  } catch (error) {
    return { path: settingsPath, value: {}, error: error.code === 'ENOENT' ? null : 'invalid settings.json' };
  }
}

function envFileHasKey(key) {
  const envPath = path.join(os.homedir(), '.qwen/.env');
  try {
    return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).some((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      return Boolean(match && match[1] === key && match[2] && match[2] !== "''" && match[2] !== '""');
    });
  } catch {
    return false;
  }
}

function endpointHost(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}

function inspectAuth(settings) {
  const selectedType = settings?.security?.auth?.selectedType || null;
  const model = process.env.OPENAI_MODEL || process.env.QWEN_MODEL || settings?.model?.name || null;
  const openaiProvider = settings?.modelProviders?.openai;
  const models = Array.isArray(openaiProvider) ? openaiProvider : (openaiProvider?.models || []);
  const selectedModel = models.find((entry) => entry && entry.id === model) || null;
  const baseUrl = process.env.OPENAI_BASE_URL || selectedModel?.baseUrl || null;
  const envKey = selectedModel?.envKey || (
    baseUrl && baseUrl.includes('coding') ? 'BAILIAN_CODING_PLAN_API_KEY' : 'DASHSCOPE_API_KEY'
  );
  const host = endpointHost(baseUrl);
  const alibabaRoute = (selectedType === 'openai' || (!selectedType && process.env.OPENAI_BASE_URL))
    && ALIBABA_HOSTS.has(host)
    && ALIBABA_KEYS.has(envKey)
    && Boolean(model && /^qwen/i.test(model));
  const keyPresent = ALIBABA_KEYS.has(envKey)
    && Boolean(process.env[envKey] || envFileHasKey(envKey) || settings?.env?.[envKey]);

  return { selectedType, model, baseUrl, envKey, alibabaRoute, keyPresent };
}

function inspect() {
  const binary = resolveQwen();
  const settings = readSettings();
  let version = null;
  if (binary) {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) version = (result.stdout || result.stderr).trim().split(/\r?\n/)[0] || null;
  }
  const auth = inspectAuth(settings.value);
  const errors = [];
  if (!binary) errors.push('official qwen binary not found');
  if (binary && version !== PINNED_VERSION) errors.push(`qwen version must be ${PINNED_VERSION}`);
  if (settings.error) errors.push(settings.error);
  if (!auth.alibabaRoute) errors.push('Alibaba ModelStudio route is not configured');
  if (auth.alibabaRoute && !auth.keyPresent) errors.push(`credential ${auth.envKey} is not available`);
  return {
    schema: 'ali-yolo/doctor-v1',
    ok: errors.length === 0,
    provider: 'Alibaba Cloud',
    product: 'Qwen Code',
    package: '@qwen-code/qwen-code',
    pinnedVersion: PINNED_VERSION,
    binary,
    version,
    model: auth.model,
    endpointHost: endpointHost(auth.baseUrl),
    credentialVariable: auth.envKey,
    credentialPresent: auth.keyPresent,
    approvalMode: 'yolo',
    fallback: false,
    settingsPath: settings.path,
    errors,
  };
}

function doctor(json) {
  const result = inspect();
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    const marker = result.ok ? 'ALI_YOLO_READY' : 'ALI_YOLO_BLOCKED';
    process.stdout.write(`${marker} provider=Alibaba_Cloud product=Qwen_Code version=${result.version || 'missing'} model=${result.model || 'missing'} endpoint=${result.endpointHost || 'missing'} credential_present=${result.credentialPresent} fallback=false\n`);
    for (const error of result.errors) process.stderr.write(`ali-yolo: ${error}\n`);
  }
  return result.ok ? 0 : 1;
}

function validateArgs(args) {
  let hasYolo = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--yolo') hasYolo = true;
    if (argument === '--yolo=false') throw new Error('refusing --yolo=false; use qwen for non-yolo mode');
    if (argument.startsWith('--approval-mode=')) {
      if (argument !== '--approval-mode=yolo') throw new Error(`refusing ${argument}`);
      hasYolo = true;
    }
    if (argument === '--approval-mode') {
      if (args[index + 1] !== 'yolo') throw new Error("--approval-mode requires the value 'yolo'");
      hasYolo = true;
      index += 1;
    }
  }
  return hasYolo;
}

const args = process.argv.slice(2);
if (args[0] === '--doctor') {
  if (args.length > 2 || (args[1] && args[1] !== '--json')) {
    process.stderr.write('ali-yolo: --doctor accepts only optional --json\n');
    process.exit(2);
  }
  process.exit(doctor(args[1] === '--json'));
}

let hasYolo;
try {
  hasYolo = validateArgs(args);
} catch (error) {
  process.stderr.write(`ali-yolo: ${error.message}\n`);
  process.exit(2);
}

const state = inspect();
if (!state.ok) {
  for (const error of state.errors) process.stderr.write(`ali-yolo: ${error}\n`);
  process.stderr.write('ali-yolo: run ali-yolo --doctor --json for secret-safe evidence\n');
  process.exit(1);
}

const result = spawnSync(state.binary, hasYolo ? args : ['--yolo', ...args], { stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`ali-yolo: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
