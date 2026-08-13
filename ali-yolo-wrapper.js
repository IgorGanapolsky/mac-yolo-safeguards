#!/usr/bin/env node
'use strict';

/**
 * ali-yolo — Alibaba ModelStudio Token Plan via isolated Hermes profile `ali`.
 *
 * HARD rules (skill ~/.agents/skills/ali-yolo):
 * - Auth: macOS Keychain ALIBABA_TOKEN_PLAN_API_KEY only (never print)
 * - Profile: hermes --profile ali
 * - Provider: custom:alibaba-token-plan (Singapore Token Plan endpoint)
 * - Default model: qwen3.8-max
 * - Never fall back to OpenRouter / Ollama / local / other paid providers
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const DEFAULT_HERMES_BIN = path.join(HOME, '.local', 'bin', 'hermes');
const DEFAULT_PROFILE = 'ali';
const DEFAULT_PROVIDER = 'custom:alibaba-token-plan';
const DEFAULT_MODEL = 'qwen3.8-max';
const KEYCHAIN_SERVICE = 'ALIBABA_TOKEN_PLAN_API_KEY';
const KEY_ENV = 'ALIBABA_TOKEN_PLAN_API_KEY';
const PROFILE_DIR = path.join(HOME, '.hermes', 'profiles', DEFAULT_PROFILE);
const PROFILE_ENV = path.join(PROFILE_DIR, '.env');
const PROFILE_CONFIG = path.join(PROFILE_DIR, 'config.yaml');

const DEFAULT_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
  'browser',
  'delegation',
  'todo',
  'session_search',
].join(',');

/** Models allowed on Token Plan Standard (text coding). */
const SUPPORTED_MODELS = Object.freeze([
  'qwen3.8-max',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3-coder-plus',
  'qwen3-coder-flash',
  'qwen-max',
  'qwen-plus',
]);

function uniqueCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))].join(',');
}

function loadTokenPlanKey(env = process.env) {
  if (env[KEY_ENV] && String(env[KEY_ENV]).trim()) {
    return { key: String(env[KEY_ENV]).trim(), source: 'env' };
  }
  if (env.DASHSCOPE_API_KEY && String(env.DASHSCOPE_API_KEY).trim()) {
    // Some installs reuse DashScope key naming; still fail closed if not set.
    return { key: String(env.DASHSCOPE_API_KEY).trim(), source: 'env-dashscope' };
  }
  try {
    const out = spawnSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8' },
    );
    if (out.status === 0 && out.stdout.trim()) {
      return { key: out.stdout.trim(), source: 'macos-keychain' };
    }
  } catch {
    /* keychain unavailable */
  }
  // Profile .env (last resort, still never print)
  if (fs.existsSync(PROFILE_ENV)) {
    try {
      const content = fs.readFileSync(PROFILE_ENV, 'utf8');
      const match = content.match(new RegExp(`^${KEY_ENV}=(.+)$`, 'm'));
      if (match && match[1].trim()) {
        return { key: match[1].trim(), source: 'profile-env' };
      }
    } catch {
      /* ignore */
    }
  }
  return { key: null, source: null };
}

function ensureProfileEnv(key) {
  if (!key || !fs.existsSync(PROFILE_DIR)) return false;
  try {
    let content = '';
    if (fs.existsSync(PROFILE_ENV)) content = fs.readFileSync(PROFILE_ENV, 'utf8');
    if (new RegExp(`^${KEY_ENV}=.+`, 'm').test(content)) {
      content = content.replace(new RegExp(`^${KEY_ENV}=.*$`, 'm'), `${KEY_ENV}=${key}`);
    } else {
      content = `${content.replace(/\s*$/, '')}\n${KEY_ENV}=${key}\n`;
    }
    fs.writeFileSync(PROFILE_ENV, content, { mode: 0o600 });
    try { fs.chmodSync(PROFILE_ENV, 0o600); } catch { /* best effort */ }
    return true;
  } catch {
    return false;
  }
}

function resolveConfig(env = process.env) {
  const auth = loadTokenPlanKey(env);
  const provider = env.ALI_YOLO_PROVIDER || DEFAULT_PROVIDER;
  const model = env.ALI_YOLO_MODEL || DEFAULT_MODEL;
  const profile = env.ALI_YOLO_PROFILE === '0' || env.ALI_YOLO_PROFILE === 'none'
    ? ''
    : (env.ALI_YOLO_PROFILE || DEFAULT_PROFILE);
  const toolsets = uniqueCsv(env.ALI_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  const skills = uniqueCsv(env.ALI_YOLO_SKILLS || '');
  const hermesBin = env.ALI_YOLO_HERMES_BIN || env.HERMES_BIN || DEFAULT_HERMES_BIN;
  return {
    provider,
    model,
    profile,
    toolsets,
    skills,
    hermesBin,
    auth,
  };
}

function findContextFile(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'AGENTS.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isAliProvider(provider) {
  const p = String(provider || '').toLowerCase();
  return p === 'custom:alibaba-token-plan'
    || p === 'alibaba-token-plan'
    || p.includes('alibaba')
    || p.includes('token-plan')
    || p.includes('dashscope');
}

function assertAliRoute(config) {
  if (!isAliProvider(config.provider)) {
    throw new Error(
      `ali-yolo refuses non-Alibaba provider ${config.provider}. `
      + `Expected ${DEFAULT_PROVIDER}. No OpenRouter/Ollama fallback.`,
    );
  }
  if (!SUPPORTED_MODELS.includes(config.model) && !String(config.model).startsWith('qwen')) {
    throw new Error(
      `ali-yolo model not supported: ${config.model}. `
      + `Use one of: ${SUPPORTED_MODELS.join(', ')}`,
    );
  }
  // Block known broken OpenRouter 32k coder route
  if (String(config.model).includes('qwen-2.5-coder-32b')) {
    throw new Error(
      'ali-yolo refuses openrouter qwen-2.5-coder-32b (Hermes requires ≥64k context). '
      + `Use ${DEFAULT_MODEL} on Token Plan.`,
    );
  }
}

function buildHermesArgs(config, mode, payload = '') {
  const args = [];
  if (config.profile) args.push('--profile', config.profile);
  args.push(
    '--provider', config.provider,
    '--model', config.model,
    '--yolo',
    '--accept-hooks',
    '--toolsets', config.toolsets,
  );
  if (config.skills) args.push('--skills', config.skills);
  if (mode === 'oneshot') args.push('-z', payload);
  if (mode === 'chat') args.push('chat');
  if (mode === 'passthrough') args.push(...payload);
  return args;
}

function runChild(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ exitCode: Number.isInteger(code) ? code : 1, signal: signal || null });
    });
  });
}

function buildDoctor(config, startDir = process.cwd()) {
  const contextFile = findContextFile(startDir);
  const errors = [];
  const profilePresent = Boolean(config.profile) && fs.existsSync(PROFILE_DIR);
  const configPresent = fs.existsSync(PROFILE_CONFIG);
  const runtimePresent = fs.existsSync(config.hermesBin);
  const keyPresent = Boolean(config.auth.key);
  const authSource = config.auth.source === 'macos-keychain'
    || config.auth.source === 'profile-env'
    || config.auth.source === 'env'
    || config.auth.source === 'env-dashscope'
    ? (config.auth.source === 'macos-keychain' ? 'macos-keychain' : 'present')
    : null;

  if (!runtimePresent) errors.push('Hermes runtime not found');
  if (config.profile && !profilePresent) {
    errors.push(`Hermes profile "${config.profile}" missing — run: hermes profile create ali --clone`);
  }
  if (!keyPresent) {
    errors.push(`Missing ${KEY_ENV} in macOS Keychain (service ${KEYCHAIN_SERVICE})`);
  }
  if (!isAliProvider(config.provider)) {
    errors.push(`Provider must be Alibaba Token Plan (got ${config.provider})`);
  }
  if (String(config.model).includes('qwen-2.5-coder-32b') || config.provider === 'openrouter') {
    errors.push('OpenRouter / 32k coder route is forbidden for ali-yolo');
  }
  if (!contextFile) {
    errors.push('No AGENTS.md found from current directory (project rules required)');
  }

  // Prefer reporting auth as macos-keychain when key is from keychain (skill contract)
  let authLabel = 'missing';
  if (keyPresent) {
    authLabel = config.auth.source === 'macos-keychain' ? 'macos-keychain' : 'present';
  }

  const ok = errors.length === 0
    && runtimePresent
    && keyPresent
    && isAliProvider(config.provider)
    && Boolean(contextFile)
    && (config.profile ? profilePresent : true);

  return {
    schema: 'ali-yolo/doctor-v1',
    ok,
    provider: 'Alibaba ModelStudio',
    product: 'Token Plan Standard',
    engine: 'Hermes Agent',
    auth: authLabel,
    authSource: config.auth.source,
    credentialPresent: keyPresent,
    fallback: false,
    yolo: true,
    tools: true,
    skills: true,
    projectRules: Boolean(contextFile),
    profile: config.profile || null,
    profilePresent,
    configPresent,
    runtime: config.hermesBin,
    runtimePresent,
    route: `${config.provider}/${config.model}`,
    model: config.model,
    endpointHost: 'token-plan.ap-southeast-1.maas.aliyuncs.com',
    toolsets: config.toolsets.split(','),
    contextFile,
    supportedModels: SUPPORTED_MODELS,
    errors,
  };
}

class AliYoloAgent {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.config = options.config || resolveConfig(this.env);
    this.childRunner = options.childRunner || runChild;
    this.stdin = options.stdin || process.stdin;
  }

  printVersion() {
    console.log('ali-yolo 4.0.0 — Alibaba ModelStudio Token Plan via Hermes profile ali');
  }

  printBanner() {
    console.error('[ali-yolo] Alibaba ModelStudio Token Plan (Hermes)');
    console.error(`[ali-yolo] profile=${this.config.profile || 'none'} route=${this.config.provider}/${this.config.model}`);
    console.error(`[ali-yolo] tools=${this.config.toolsets}`);
    console.error(`[ali-yolo] auth=${this.config.auth.source || 'missing'} yolo=on fallback=false`);
    console.error('[ali-yolo] Never OpenRouter/Ollama — Token Plan only');
  }

  runDoctor(json = false) {
    const report = buildDoctor(this.config);
    if (json) {
      // Never include key material
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`ali-yolo ready: ${report.ok ? 'YES' : 'NO'}`);
      console.log(`engine: ${report.engine}`);
      console.log(`provider: ${report.provider} / ${report.product}`);
      console.log(`route: ${report.route}`);
      console.log(`auth: ${report.auth}`);
      console.log(`profile: ${report.profile} (present=${report.profilePresent})`);
      console.log(`context: ${report.contextFile || 'MISSING AGENTS.md'}`);
      console.log(`tools: ${report.toolsets.join(', ')}`);
      console.log(`fallback: false`);
      if (report.errors.length) {
        for (const error of report.errors) console.error(`error: ${error}`);
      }
    }
    return { exitCode: report.ok ? 0 : 1, report };
  }

  listModels() {
    for (const model of SUPPORTED_MODELS) console.log(model);
    return { exitCode: 0 };
  }

  buildChildEnv() {
    const env = { ...this.env };
    if (this.config.auth.key) {
      env[KEY_ENV] = this.config.auth.key;
      // Some SDKs look for DashScope naming
      if (!env.DASHSCOPE_API_KEY) env.DASHSCOPE_API_KEY = this.config.auth.key;
      ensureProfileEnv(this.config.auth.key);
    }
    return env;
  }

  async run(args = []) {
    if (args[0] === '--version' || args[0] === '-v') {
      this.printVersion();
      return { exitCode: 0 };
    }
    if (args[0] === 'doctor' || args[0] === '--doctor') {
      return this.runDoctor(args.includes('--json'));
    }
    if (args[0] === '--models' || args[0] === 'models') {
      return this.listModels();
    }
    if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
      console.log(`ali-yolo — Alibaba ModelStudio Token Plan via Hermes

  ali-yolo                  interactive YOLO chat
  ali-yolo -z "prompt"      oneshot
  ali-yolo doctor [--json]  health check
  ali-yolo --models         list supported models

Defaults:
  profile   ali
  provider  custom:alibaba-token-plan
  model     qwen3.8-max
  auth      Keychain service ${KEYCHAIN_SERVICE}
  fallback  NEVER (OpenRouter/Ollama refused)

Env overrides: ALI_YOLO_MODEL / ALI_YOLO_PROVIDER / ALI_YOLO_TOOLSETS / ALI_YOLO_PROFILE
`);
      return { exitCode: 0 };
    }

    let promptArgs = [...args];
    let modelOverride = null;
    let providerOverride = null;

    for (let i = 0; i < promptArgs.length; i++) {
      if ((promptArgs[i] === '-m' || promptArgs[i] === '--model') && promptArgs[i + 1]) {
        modelOverride = promptArgs[i + 1];
        promptArgs.splice(i, 2);
        i--;
      } else if (promptArgs[i] === '--provider' && promptArgs[i + 1]) {
        providerOverride = promptArgs[i + 1];
        promptArgs.splice(i, 2);
        i--;
      } else if (promptArgs[i] === '-z' || promptArgs[i] === '--oneshot') {
        promptArgs.splice(i, 1);
        i--;
      }
    }

    // Validate overrides before mutating so a rejected --provider cannot poison config.
    if (modelOverride || providerOverride) {
      assertAliRoute({
        provider: providerOverride || this.config.provider,
        model: modelOverride || this.config.model,
      });
    }
    if (modelOverride) this.config.model = modelOverride;
    if (providerOverride) this.config.provider = providerOverride;
    assertAliRoute(this.config);
    if (!this.config.auth.key) {
      throw new Error(
        `Missing ${KEY_ENV}. Store with: security add-generic-password -s ${KEYCHAIN_SERVICE} -a $USER -w '<key>'`,
      );
    }
    if (!fs.existsSync(this.config.hermesBin)) {
      throw new Error(`Hermes runtime not found at ${this.config.hermesBin}`);
    }
    if (this.config.profile && !fs.existsSync(PROFILE_DIR)) {
      throw new Error(`Hermes profile "${this.config.profile}" missing. Run: hermes profile create ali --clone`);
    }

    const childEnv = this.buildChildEnv();

    const passthrough = new Set([
      '--tui', '--cli', '--continue', '-c', '--resume', '-r', '--worktree', '-w', '--safe-mode',
    ]);
    if (promptArgs.length && passthrough.has(promptArgs[0])) {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'passthrough', promptArgs),
        { env: childEnv },
      );
    }

    let prompt = promptArgs.join(' ').trim();
    if (!prompt && !this.stdin.isTTY) {
      prompt = await new Promise((resolve) => {
        let data = '';
        this.stdin.setEncoding('utf8');
        this.stdin.on('data', (chunk) => { data += chunk; });
        this.stdin.on('end', () => resolve(data.trim()));
      });
      if (!prompt) {
        console.error('[ali-yolo] empty prompt received on stdin');
        return { exitCode: 1 };
      }
    }

    if (prompt) {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'oneshot', prompt),
        { env: childEnv },
      );
    }

    this.printBanner();
    return this.childRunner(
      this.config.hermesBin,
      buildHermesArgs(this.config, 'chat'),
      { env: childEnv },
    );
  }
}

async function main() {
  const agent = new AliYoloAgent();
  try {
    const result = await agent.run(process.argv.slice(2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[ali-yolo] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_PROFILE,
  DEFAULT_TOOLSETS,
  SUPPORTED_MODELS,
  KEYCHAIN_SERVICE,
  KEY_ENV,
  AliYoloAgent,
  assertAliRoute,
  buildDoctor,
  buildHermesArgs,
  findContextFile,
  isAliProvider,
  loadTokenPlanKey,
  resolveConfig,
};
