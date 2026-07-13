#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const MODEL = 'grok-4.5';
const DEFAULT_REASONING_EFFORT = 'high';
const MIN_GROK_VERSION = '0.2.99';
const XAI_PRICING = Object.freeze({
  currency: 'USD',
  perMillionTokens: {
    input: 2,
    cachedInput: 0.5,
    output: 6,
  },
  contextTokens: 500000,
  effectiveDate: '2026-07-08',
  source: 'https://docs.x.ai/developers/grok-4-5',
});

// `grok-yolo` skips ordinary permission prompts but keeps explicit denials for
// destructive operations and common secret-bearing paths. The name describes
// the interaction mode, not permission to destroy data or publish externally.
const DEFAULT_DENY_RULES = Object.freeze([
  'Bash(rm -rf *)',
  'Bash(git push --force*)',
  'Bash(git reset --hard*)',
  'Bash(git clean -fd*)',
  'Bash(security *)',
  'Bash(*~/.ssh*)',
  'Bash(*~/.gnupg*)',
  'Read(**/.env*)',
  'Read(**/auth.json)',
]);

const HERMES_RULES = [
  'Act as the independent Grok 4.5 verifier in the Hermes harness.',
  'Inspect the current worktree and run focused verification commands.',
  'Do not merge, push, publish, delete files or branches, rotate credentials, or expose secrets.',
  'Keep implementation and verification independent: report evidence, contradictions, blockers, and a verdict.',
  'Never claim completion from self-attestation; require command or runtime evidence.',
].join(' ');

const HERMES_VERIFIER_PROFILE = Object.freeze({
  id: 'grok45-readonly-verifier-v1',
  model: MODEL,
  sandbox: 'read-only',
  writeFileEnabled: false,
});

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxai-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+\/-]{16,}\b/gi,
  /\b([A-Z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)([^\s"'`]+)/gi,
];

function redact(value) {
  let text = String(value == null ? '' : value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => {
      if (typeof prefix === 'string' && (prefix.endsWith('=') || /Bearer\s+/i.test(prefix))) {
        return `${prefix}[REDACTED]`;
      }
      return '[REDACTED]';
    });
  }
  return text;
}

function findGrokBinary(env = process.env) {
  const candidates = [
    env.GROK_BIN,
    path.join(os.homedir(), '.grok', 'bin', 'grok'),
    path.join(os.homedir(), '.local', 'bin', 'grok'),
    '/opt/homebrew/bin/grok',
    '/usr/local/bin/grok',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  const found = spawnSync('/bin/zsh', ['-lc', 'command -v grok'], {
    encoding: 'utf8',
    timeout: 3000,
    env,
  });
  return found.status === 0 && found.stdout.trim() ? found.stdout.trim() : null;
}

function parseVersion(output) {
  const match = String(output || '').match(/\bgrok\s+(\d+\.\d+\.\d+)/i);
  return match ? match[1] : null;
}

function versionAtLeast(actual, minimum = MIN_GROK_VERSION) {
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

function parseModelsOutput(output) {
  const text = String(output || '');
  const models = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[*-]\s+([A-Za-z0-9._-]+)(?:\s+\(default\))?\s*$/);
    if (match) models.push(match[1]);
  }
  const defaultMatch = text.match(/^Default model:\s*(\S+)/im);
  return {
    authenticatedWithGrokCom: /logged in with grok\.com/i.test(text),
    explicitlyUnauthenticated: /not authenticated/i.test(text),
    defaultModel: defaultMatch ? defaultMatch[1] : null,
    models: [...new Set(models)],
  };
}

function runProbe(binary, args, env = process.env) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    env,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}

function grokDoctor(options = {}) {
  const env = options.env || process.env;
  const binary = options.binary || findGrokBinary(env);
  const probe = options.probe || runProbe;
  if (!binary) {
    return {
      schema: 'grok-yolo/doctor-v1',
      ready: false,
      binary: null,
      version: null,
      minimumVersion: MIN_GROK_VERSION,
      versionReady: false,
      model: MODEL,
      modelAvailable: false,
      authenticated: false,
      authMode: 'none',
      billingMode: 'blocked_not_installed',
      pricing: XAI_PRICING,
      blocker: 'grok_binary_missing',
    };
  }

  const versionProbe = probe(binary, ['version'], env);
  const modelsProbe = probe(binary, ['models'], env);
  const version = parseVersion(`${versionProbe.stdout}\n${versionProbe.stderr}`);
  const catalog = parseModelsOutput(`${modelsProbe.stdout}\n${modelsProbe.stderr}`);
  const apiKeyPresent = Boolean(env.XAI_API_KEY);
  const authMode = catalog.authenticatedWithGrokCom
    ? 'grok.com_oauth'
    : apiKeyPresent
      ? 'xai_api_key'
      : 'none';
  const authenticated = authMode !== 'none' && modelsProbe.status === 0;
  const modelAvailable = catalog.models.includes(MODEL) || catalog.defaultModel === MODEL;
  const versionReady = versionAtLeast(version);
  const ready = authenticated && modelAvailable && versionReady;
  let blocker = null;
  if (!versionReady) blocker = 'grok_cli_update_required';
  else if (!authenticated) blocker = 'grok_authentication_required';
  else if (!modelAvailable) blocker = 'grok_4_5_not_available_for_account';

  return {
    schema: 'grok-yolo/doctor-v1',
    ready,
    binary,
    version,
    minimumVersion: MIN_GROK_VERSION,
    versionReady,
    model: MODEL,
    modelAvailable,
    availableModels: catalog.models,
    defaultModel: catalog.defaultModel,
    authenticated,
    authMode,
    billingMode: authMode === 'grok.com_oauth'
      ? 'grok_plan_or_limited_free_quota'
      : authMode === 'xai_api_key'
        ? 'xai_api_pay_as_you_go'
        : 'blocked_unauthenticated',
    apiBillingActivatedByWrapper: false,
    pricing: XAI_PRICING,
    blocker,
  };
}

function denyArgs(rules = DEFAULT_DENY_RULES) {
  return rules.flatMap((rule) => ['--deny', rule]);
}

function assertNoModelOverride(args) {
  if (args.some((arg) => arg === '--model' || arg === '-m' || arg.startsWith('--model='))) {
    throw new Error(`${MODEL} is pinned for grok-yolo; model overrides are not accepted`);
  }
}

function hasReasoningEffortOverride(args) {
  return args.some((arg) => (
    arg === '--reasoning-effort'
    || arg === '--effort'
    || arg.startsWith('--reasoning-effort=')
    || arg.startsWith('--effort=')
  ));
}

function buildStandaloneArgs(userArgs = [], options = {}) {
  assertNoModelOverride(userArgs);
  return [
    '--model', MODEL,
    ...(hasReasoningEffortOverride(userArgs)
      ? []
      : ['--reasoning-effort', DEFAULT_REASONING_EFFORT]),
    '--always-approve',
    ...denyArgs(options.denyRules),
    ...userArgs,
  ];
}

function buildHermesArgs(task, options = {}) {
  if (!String(task || '').trim()) throw new Error('Hermes mode requires a non-empty task');
  const maxTurns = Number(options.maxTurns ?? 20);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) {
    throw new Error('maxTurns must be an integer from 1 to 100');
  }
  const outputFormat = options.outputFormat || 'json';
  if (!['plain', 'json', 'streaming-json'].includes(outputFormat)) {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }
  return [
    '--model', MODEL,
    '--reasoning-effort', DEFAULT_REASONING_EFFORT,
    '--always-approve',
    ...denyArgs(options.denyRules),
    '--sandbox', HERMES_VERIFIER_PROFILE.sandbox,
    '--no-subagents',
    '--no-memory',
    '--max-turns', String(maxTurns),
    '--rules', options.rules || HERMES_RULES,
    ...(options.cwd ? ['--cwd', path.resolve(options.cwd)] : []),
    '-p', String(task),
    '--output-format', outputFormat,
  ];
}

function buildHermesEnv(env = process.env) {
  return {
    ...env,
    GROK_WRITE_FILE: HERMES_VERIFIER_PROFILE.writeFileEnabled ? '1' : '0',
  };
}

function parseWrapperArgs(argv = process.argv.slice(2)) {
  const options = {
    doctor: false,
    dryRun: false,
    hermes: false,
    json: false,
    cwd: null,
    maxTurns: 20,
    outputFormat: 'json',
    task: null,
    passthrough: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--doctor') options.doctor = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--hermes') options.hermes = true;
    else if (arg === '--json') options.json = true;
    else if (options.hermes && (arg === '--task' || arg === '--prompt' || arg === '-p' || arg === '--single')) {
      options.task = requireValue(argv, ++index, arg);
    } else if (options.hermes && arg === '--cwd') {
      options.cwd = requireValue(argv, ++index, arg);
    } else if (options.hermes && arg === '--max-turns') {
      options.maxTurns = Number(requireValue(argv, ++index, arg));
    } else if (options.hermes && arg === '--output-format') {
      options.outputFormat = requireValue(argv, ++index, arg);
    } else {
      options.passthrough.push(arg);
    }
  }
  if (options.hermes && !options.task && options.passthrough.length) {
    options.task = options.passthrough.join(' ');
    options.passthrough = [];
  }
  return options;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function renderDoctor(doctor) {
  const lines = [
    `Grok CLI: ${doctor.binary || 'missing'}`,
    `Version: ${doctor.version || 'unknown'} (minimum ${doctor.minimumVersion})`,
    `Authentication: ${doctor.authMode}`,
    `Model: ${doctor.modelAvailable ? `${doctor.model} available` : `${doctor.model} unavailable`}`,
    `Billing: ${doctor.billingMode}`,
    `Ready: ${doctor.ready ? 'yes' : 'no'}`,
  ];
  if (doctor.blocker) lines.push(`Blocker: ${doctor.blocker}`);
  return lines.join('\n');
}

function spawnGrok(binary, args, env = process.env) {
  const child = spawn(binary, args, { stdio: 'inherit', env });
  child.on('error', (error) => {
    console.error(`grok-yolo: ${redact(error.message)}`);
    process.exitCode = 127;
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`grok-yolo: Grok exited on ${signal}`);
      process.exitCode = 1;
    } else {
      process.exitCode = code == null ? 1 : code;
    }
  });
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseWrapperArgs(argv);
    const doctor = grokDoctor();
    if (options.doctor) {
      console.log(options.json ? JSON.stringify(doctor, null, 2) : renderDoctor(doctor));
      process.exitCode = doctor.ready ? 0 : 2;
      return;
    }
    if (!doctor.binary) throw new Error('Grok Build is not installed');
    const childArgs = options.hermes
      ? buildHermesArgs(options.task, {
          cwd: options.cwd,
          maxTurns: options.maxTurns,
          outputFormat: options.outputFormat,
        })
      : buildStandaloneArgs(options.passthrough);
    if (options.dryRun) {
      const payload = {
        binary: doctor.binary,
        args: childArgs,
        model: MODEL,
        guardedYolo: true,
        hermesProfile: options.hermes ? HERMES_VERIFIER_PROFILE : null,
      };
      console.log(options.json ? JSON.stringify(payload, null, 2) : `${payload.binary} ${payload.args.map(JSON.stringify).join(' ')}`);
      return;
    }
    if (!doctor.ready) throw new Error(`Grok 4.5 is not ready: ${doctor.blocker || 'doctor_failed'}`);
    spawnGrok(doctor.binary, childArgs, options.hermes ? buildHermesEnv() : process.env);
  } catch (error) {
    console.error(`grok-yolo: ${redact(error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_DENY_RULES,
  HERMES_RULES,
  HERMES_VERIFIER_PROFILE,
  MIN_GROK_VERSION,
  MODEL,
  XAI_PRICING,
  assertNoModelOverride,
  buildHermesArgs,
  buildHermesEnv,
  buildStandaloneArgs,
  findGrokBinary,
  grokDoctor,
  hasReasoningEffortOverride,
  parseModelsOutput,
  parseVersion,
  parseWrapperArgs,
  redact,
  renderDoctor,
  versionAtLeast,
};

if (require.main === module) main();
