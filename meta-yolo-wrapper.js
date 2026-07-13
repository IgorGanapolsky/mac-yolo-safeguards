#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODEL = 'muse-spark-1.1';
const OPENCODE_PROVIDER = 'meta';
const OPENCODE_MODEL = `${OPENCODE_PROVIDER}/${MODEL}`;
const PROVIDER = 'meta-muse-spark';
const HERMES_PROVIDER = `custom:${PROVIDER}`;
const BASE_URL = 'https://api.meta.ai/v1';
const RESPONSES_URL = `${BASE_URL}/responses`;
const KEY_ENV = 'MODEL_API_KEY';
const LEGACY_KEY_ENV = 'META_MODEL_API_KEY';
const KEYCHAIN_SERVICE = 'com.igor.hermes.meta-model-api';
const META_YOLO_HOME = path.join(os.homedir(), '.hermes', 'meta-muse');
const OPENCODE_CONFIG_DIR = path.join(META_YOLO_HOME, 'opencode-config');
const OPENCODE_XDG_HOME = path.join(META_YOLO_HOME, 'opencode-xdg');
const ISOLATED_PROFILE = path.join(os.homedir(), '.hermes', 'meta-muse-profile');
const MAIN_CONFIG = path.join(os.homedir(), '.hermes', 'config.yaml');
const ISOLATED_CONFIG = path.join(ISOLATED_PROFILE, 'config.yaml');
const OPERATIONAL_CONTEXT_TOKENS = 16_384;
const OPERATIONAL_OUTPUT_TOKENS = 1_024;
const DEFAULT_MAX_TURNS = 4;
const DEFAULT_MAX_COST_USD = 0.10;
const DEFAULT_TOOLSETS = 'shell,file';
const PRICING = Object.freeze({
  currency: 'USD',
  perMillionTokens: {
    input: 1.25,
    cachedInput: 0.15,
    output: 4.25,
  },
  webSearchPerThousand: 2.5,
  source: 'https://dev.meta.ai/docs/getting-started/pricing-rate-limits',
});
const REASONING_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh']);
const OTHER_PROVIDER_SECRET_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'CEREBRAS_API_KEY',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'NVIDIA_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'Z_AI_API_KEY',
  'ZENMUX_API_KEY',
]);

const usage = `Usage:
  meta-yolo
  meta-yolo "task" [--cwd PATH] [--reasoning-effort LEVEL]
  meta-yolo --hermes "task" [--max-turns 1..4] [--max-cost-usd USD]
                           [--cwd PATH]
  meta-yolo --raw "question" [--reasoning-effort LEVEL]
            [--max-output-tokens N] [--max-cost-usd USD]
  meta-yolo --doctor [--json]
  meta-yolo --dry-run ["task"] [--raw] [--json]
  meta-yolo --store-key-stdin

Modes:
  default   The dedicated OpenCode terminal client pinned to
            meta/muse-spark-1.1. With no task it opens OpenCode's own TUI. A
            Meta-only provider allowlist and isolated OpenCode state prevent
            credentials or settings for GLM/Qwen from contaminating the run.
  --hermes  An explicit bounded Hermes coding-agent run using a dedicated
            HERMES_HOME and an empty fallback chain.
  --raw     One direct, tool-free Responses API call with store=false.

OpenCode agent sessions are metered by Meta and OpenCode exposes no hard
per-run dollar ceiling. --hermes defaults to a $0.10 worst-case ceiling; --raw
is bounded by its output-token and dollar caps. Credentials come from
MODEL_API_KEY or macOS Keychain, never a tracked file or ~/.hermes/.env.`;

const SECRET_PATTERNS = [
  /\bLLM\|\d+\|[A-Za-z0-9._~+\/-]+\b/g,
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

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parsePositiveNumber(value, flag, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseInteger(value, flag, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    mode: 'standalone',
    doctor: false,
    dryRun: false,
    json: false,
    storeKeyStdin: false,
    help: false,
    prompt: '',
    promptParts: [],
    maxTurns: DEFAULT_MAX_TURNS,
    maxCostUsd: DEFAULT_MAX_COST_USD,
    maxOutputTokens: OPERATIONAL_OUTPUT_TOKENS,
    reasoningEffort: 'high',
    cwd: process.cwd(),
    toolsets: DEFAULT_TOOLSETS,
    maxTurnsSpecified: false,
    maxCostSpecified: false,
    maxOutputTokensSpecified: false,
    toolsetsSpecified: false,
  };
  const requestedModes = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--raw') {
      requestedModes.push('raw');
      args.mode = 'raw';
    } else if (arg === '--hermes') {
      requestedModes.push('hermes');
      args.mode = 'hermes';
    } else if (arg === '--standalone') {
      requestedModes.push('standalone');
      args.mode = 'standalone';
    }
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--store-key-stdin') args.storeKeyStdin = true;
    else if (arg === '--max-turns') {
      args.maxTurnsSpecified = true;
      args.maxTurns = parseInteger(requireValue(argv, ++index, arg), arg, 1, DEFAULT_MAX_TURNS);
    } else if (arg === '--max-cost-usd') {
      args.maxCostSpecified = true;
      args.maxCostUsd = parsePositiveNumber(requireValue(argv, ++index, arg), arg, 0.001, 1);
    } else if (arg === '--max-output-tokens') {
      args.maxOutputTokensSpecified = true;
      args.maxOutputTokens = parseInteger(requireValue(argv, ++index, arg), arg, 16, 4096);
    }
    else if (arg === '--reasoning-effort') args.reasoningEffort = requireValue(argv, ++index, arg).toLowerCase();
    else if (arg === '--cwd') args.cwd = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--toolsets') {
      args.toolsetsSpecified = true;
      args.toolsets = requireValue(argv, ++index, arg);
    }
    else if (arg === '--prompt' || arg === '-p') args.prompt = requireValue(argv, ++index, arg);
    else if (arg === '--model' || arg === '-m' || arg.startsWith('--model=')) {
      throw new Error(`${MODEL} is pinned; model overrides are not accepted`);
    } else if (arg === '--provider' || arg.startsWith('--provider=')) {
      throw new Error(`${HERMES_PROVIDER} is pinned; provider overrides are not accepted`);
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else args.promptParts.push(arg);
  }
  if (new Set(requestedModes).size > 1 || requestedModes.length > 1) {
    throw new Error('Choose exactly one of --standalone, --hermes, or --raw');
  }
  if (!REASONING_EFFORTS.includes(args.reasoningEffort)) {
    throw new Error(`--reasoning-effort must be one of ${REASONING_EFFORTS.join(', ')}`);
  }
  if (args.mode === 'hermes' && args.reasoningEffort !== 'high') {
    throw new Error('Hermes mode is pinned to reasoning_effort=high; use --raw to select another effort');
  }
  if (args.mode === 'hermes' && args.maxOutputTokens !== OPERATIONAL_OUTPUT_TOKENS) {
    throw new Error(`Hermes mode is pinned to ${OPERATIONAL_OUTPUT_TOKENS} output tokens; use --raw to change it`);
  }
  if (args.mode === 'standalone' && args.maxTurnsSpecified) {
    throw new Error('--max-turns applies only to --hermes');
  }
  if (args.mode === 'standalone' && args.maxCostSpecified) {
    throw new Error('--max-cost-usd is not enforceable by OpenCode; use --raw or --hermes for a hard cap');
  }
  if (args.mode === 'standalone' && args.maxOutputTokensSpecified) {
    throw new Error('--max-output-tokens applies only to --raw');
  }
  if (args.mode !== 'hermes' && args.toolsetsSpecified) {
    throw new Error('--toolsets applies only to --hermes');
  }
  const joined = args.promptParts.join(' ').trim();
  if (args.prompt && joined) throw new Error('Use either --prompt or positional prompt text, not both');
  args.prompt = String(args.prompt || joined).trim();
  return args;
}

function isPlausibleKey(value) {
  const key = String(value || '').trim();
  return key.length >= 20 && !/\s/.test(key);
}

function keychainAccount(env = process.env) {
  return String(env.USER || os.userInfo().username || 'meta-yolo');
}

function readKey(options = {}) {
  const env = options.env || process.env;
  const spawn = options.spawn || spawnSync;
  if (isPlausibleKey(env[KEY_ENV])) return { key: env[KEY_ENV].trim(), source: `env:${KEY_ENV}` };
  if (isPlausibleKey(env[LEGACY_KEY_ENV])) return { key: env[LEGACY_KEY_ENV].trim(), source: `env:${LEGACY_KEY_ENV}` };
  const result = spawn('/usr/bin/security', [
    'find-generic-password',
    '-a', keychainAccount(env),
    '-s', KEYCHAIN_SERVICE,
    '-w',
  ], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  const key = result.status === 0 ? String(result.stdout || '').trim() : '';
  if (isPlausibleKey(key)) return { key, source: `keychain:${KEYCHAIN_SERVICE}` };
  return {
    key: null,
    source: 'none',
    keychainStatus: result.status,
    keychainError: result.error ? result.error.message : null,
  };
}

function storeKey(key, options = {}) {
  if (!isPlausibleKey(key)) throw new Error('Refusing to store an empty or malformed Meta Model API key');
  const env = options.env || process.env;
  const spawn = options.spawn || spawnSync;
  const result = spawn('/usr/bin/security', [
    'add-generic-password',
    '-U',
    '-a', keychainAccount(env),
    '-s', KEYCHAIN_SERVICE,
    '-w', String(key).trim(),
  ], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`macOS Keychain rejected the Meta key (status ${result.status})`);
  }
  return { stored: true, service: KEYCHAIN_SERVICE, account: keychainAccount(env) };
}

function findHermesBinary(env = process.env) {
  const candidates = [
    env.HERMES_BIN,
    path.join(os.homedir(), '.local', 'bin', 'hermes'),
    path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
    '/opt/homebrew/bin/hermes',
    '/usr/local/bin/hermes',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function findOpenCodeBinary(env = process.env) {
  const candidates = [
    env.OPENCODE_BIN,
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    path.join(os.homedir(), '.local', 'bin', 'opencode'),
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function parseOpenCodeVersion(output) {
  const match = String(output || '').match(/(?:^|\n)v?(\d+\.\d+\.\d+)(?:\s|$)/);
  return match ? match[1] : null;
}

function buildOpenCodeConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    model: OPENCODE_MODEL,
    small_model: OPENCODE_MODEL,
    enabled_providers: [OPENCODE_PROVIDER],
    share: 'disabled',
    autoupdate: false,
    provider: {
      [OPENCODE_PROVIDER]: {
        whitelist: [MODEL],
        options: {
          apiKey: `{env:${KEY_ENV}}`,
        },
      },
    },
    permission: {
      '*': 'allow',
    },
  };
}

function buildOpenCodeEnv(key, env = process.env) {
  const childEnv = { ...env };
  for (const name of OTHER_PROVIDER_SECRET_KEYS) delete childEnv[name];
  for (const name of [
    'OPENCODE_CONFIG',
    'OPENCODE_CONFIG_CONTENT',
    'OPENCODE_CONFIG_DIR',
    'OPENCODE_PERMISSION',
    'OPENCODE_MODEL',
    LEGACY_KEY_ENV,
  ]) delete childEnv[name];
  childEnv[KEY_ENV] = key;
  childEnv.OPENCODE_CONFIG_CONTENT = JSON.stringify(buildOpenCodeConfig());
  childEnv.OPENCODE_CONFIG_DIR = OPENCODE_CONFIG_DIR;
  childEnv.OPENCODE_AUTO_SHARE = 'false';
  childEnv.OPENCODE_DISABLE_AUTOUPDATE = 'true';
  childEnv.OPENCODE_DISABLE_DEFAULT_PLUGINS = 'true';
  childEnv.OPENCODE_CLIENT = 'meta-yolo';
  childEnv.XDG_DATA_HOME = path.join(OPENCODE_XDG_HOME, 'data');
  childEnv.XDG_CACHE_HOME = path.join(OPENCODE_XDG_HOME, 'cache');
  childEnv.XDG_STATE_HOME = path.join(OPENCODE_XDG_HOME, 'state');
  return childEnv;
}

function buildOpenCodeArgs(prompt, args) {
  if (!prompt) return ['--pure', '--model', OPENCODE_MODEL, '--auto'];
  return [
    '--pure',
    'run',
    '--model', OPENCODE_MODEL,
    '--variant', args.reasoningEffort,
    '--auto',
    '--dir', args.cwd,
    prompt,
  ];
}

function readConfigState(configPath, isolated = false) {
  let text = '';
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return {
      path: configPath,
      exists: false,
      providerConfigured: false,
      isolatedReady: false,
    };
  }
  const providerConfigured = [
    /meta-muse-spark\s*:/,
    /https:\/\/api\.meta\.ai\/v1/,
    /muse-spark-1\.1/,
    /MODEL_API_KEY/,
    /reasoning_effort\s*:\s*high/,
  ].every((pattern) => pattern.test(text));
  const fallbackProvidersEmpty = /fallback_providers\s*:\s*\[\s*\]/.test(text);
  const fallbackModelEmpty = /fallback_model\s*:\s*\{\s*\}/.test(text);
  const pinnedProvider = /provider\s*:\s*custom:meta-muse-spark/.test(text);
  const pinnedModel = /default\s*:\s*muse-spark-1\.1/.test(text);
  const compressionDisabled = /compression\s*:[\s\S]*?enabled\s*:\s*false/.test(text);
  return {
    path: configPath,
    exists: true,
    providerConfigured,
    isolatedReady: isolated
      ? providerConfigured && fallbackProvidersEmpty && fallbackModelEmpty && pinnedProvider && pinnedModel && compressionDisabled
      : false,
    fallbackProvidersEmpty: isolated ? fallbackProvidersEmpty : null,
    fallbackModelEmpty: isolated ? fallbackModelEmpty : null,
    pinnedProvider: isolated ? pinnedProvider : null,
    pinnedModel: isolated ? pinnedModel : null,
    compressionDisabled: isolated ? compressionDisabled : null,
  };
}

function parseHermesVersion(output) {
  const match = String(output || '').match(/Hermes Agent v([^\s]+)/i);
  return match ? match[1] : null;
}

function doctor(options = {}) {
  const env = options.env || process.env;
  const spawn = options.spawn || spawnSync;
  const keyState = options.keyState || readKey({ env, spawn });
  const openCodeBinary = options.openCodeBinary || findOpenCodeBinary(env);
  let openCodeVersion = null;
  let openCodeVersionStatus = null;
  if (openCodeBinary) {
    const probe = spawn(openCodeBinary, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    openCodeVersionStatus = probe.status;
    openCodeVersion = parseOpenCodeVersion(`${probe.stdout || ''}\n${probe.stderr || ''}`);
  }
  const hermesBinary = options.hermesBinary || findHermesBinary(env);
  let hermesVersion = null;
  let hermesVersionStatus = null;
  if (hermesBinary) {
    const probe = spawn(hermesBinary, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    hermesVersionStatus = probe.status;
    hermesVersion = parseHermesVersion(`${probe.stdout || ''}\n${probe.stderr || ''}`);
  }
  const mainConfig = options.mainConfigState || readConfigState(options.mainConfig || MAIN_CONFIG, false);
  const isolatedConfig = options.isolatedConfigState || readConfigState(options.isolatedConfig || ISOLATED_CONFIG, true);
  const keyUsable = Boolean(keyState.key);
  const standaloneReady = keyUsable && Boolean(openCodeBinary) && Boolean(openCodeVersion);
  const rawReady = keyUsable;
  const hermesReady = keyUsable && Boolean(hermesBinary) && mainConfig.providerConfigured && isolatedConfig.isolatedReady;
  const blockers = [];
  if (!keyUsable) blockers.push('meta_model_api_key_missing');
  if (!openCodeBinary) blockers.push('opencode_binary_missing');
  else if (!openCodeVersion) blockers.push('opencode_version_probe_failed');
  if (!hermesBinary) blockers.push('hermes_binary_missing');
  if (!mainConfig.providerConfigured) blockers.push('main_hermes_provider_not_configured');
  if (!isolatedConfig.isolatedReady) blockers.push('meta_yolo_isolated_profile_not_configured');
  return {
    schema: 'meta-yolo/doctor-v1',
    checkedAt: new Date().toISOString(),
    ready: standaloneReady && hermesReady,
    standaloneReady,
    rawReady,
    hermesReady,
    model: MODEL,
    openCodeModel: OPENCODE_MODEL,
    provider: OPENCODE_PROVIDER,
    hermesProvider: HERMES_PROVIDER,
    baseUrl: BASE_URL,
    transport: {
      standalone: 'opencode',
      raw: 'responses',
      hermes: 'chat_completions',
    },
    key: {
      usable: keyUsable,
      source: keyState.source,
      keychainService: KEYCHAIN_SERVICE,
    },
    openCode: {
      binary: openCodeBinary,
      version: openCodeVersion,
      versionStatus: openCodeVersionStatus,
      configDir: OPENCODE_CONFIG_DIR,
      isolatedStateRoot: OPENCODE_XDG_HOME,
      config: buildOpenCodeConfig(),
    },
    hermes: {
      binary: hermesBinary,
      version: hermesVersion,
      versionStatus: hermesVersionStatus,
    },
    mainConfig,
    isolatedConfig,
    fallbackPolicy: {
      mainHermes: 'unchanged',
      standalone: 'meta_only_allowlist_plus_exact_main_and_small_model_pins',
      metaYolo: 'empty_fail_closed',
      qwenFallbackPossibleInMetaYolo: false,
    },
    limits: {
      operationalContextTokens: OPERATIONAL_CONTEXT_TOKENS,
      operationalOutputTokens: OPERATIONAL_OUTPUT_TOKENS,
      defaultMaxTurns: DEFAULT_MAX_TURNS,
      defaultMaxCostUsd: DEFAULT_MAX_COST_USD,
    },
    billing: {
      mode: 'meta_free_credits_then_pay_as_you_go',
      pricing: PRICING,
      wrapperCanAddCreditsOrPaymentMethod: false,
    },
    blockers,
  };
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(Buffer.byteLength(String(text || ''), 'utf8') / 4));
}

function directWorstCaseCost(prompt, maxOutputTokens) {
  return (
    estimateTokens(prompt) * PRICING.perMillionTokens.input
    + maxOutputTokens * PRICING.perMillionTokens.output
  ) / 1_000_000;
}

function hermesWorstCaseCost(maxTurns) {
  const oneTurn = (
    OPERATIONAL_CONTEXT_TOKENS * PRICING.perMillionTokens.input
    + OPERATIONAL_OUTPUT_TOKENS * PRICING.perMillionTokens.output
  ) / 1_000_000;
  return oneTurn * maxTurns;
}

function calculateActualCost(usage = {}) {
  const input = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const output = Number(usage.output_tokens || usage.completion_tokens || 0);
  const cached = Number(
    usage.input_tokens_details?.cached_tokens
    || usage.prompt_tokens_details?.cached_tokens
    || 0,
  );
  const uncached = Math.max(0, input - cached);
  return (
    uncached * PRICING.perMillionTokens.input
    + cached * PRICING.perMillionTokens.cachedInput
    + output * PRICING.perMillionTokens.output
  ) / 1_000_000;
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== 'message') continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function receiptDirectory(env = process.env) {
  return path.resolve(env.META_YOLO_RECEIPT_DIR || path.join(os.homedir(), '.hermes', 'receipts', 'meta-yolo'));
}

function writeReceipt(receipt, options = {}) {
  const env = options.env || process.env;
  const directory = options.directory || receiptDirectory(env);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
  const safe = JSON.parse(redact(JSON.stringify(receipt)));
  const stamp = new Date(receipt.completedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  const suffix = crypto.randomUUID().slice(0, 8);
  const historyPath = path.join(directory, `${stamp}-${suffix}.json`);
  const latestPath = path.join(directory, 'latest.json');
  for (const outputPath of [historyPath, latestPath]) {
    const tempPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, outputPath);
    fs.chmodSync(outputPath, 0o600);
  }
  return { historyPath, latestPath };
}

function baseReceipt(mode, startedAt, options = {}) {
  return {
    schema: 'meta-yolo/receipt-v1',
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(startedAt),
    host: os.hostname(),
    mode,
    provider: OPENCODE_PROVIDER,
    model: MODEL,
    baseUrl: BASE_URL,
    promptStored: false,
    outputStored: false,
    credentialStored: false,
    fallbackProviders: [],
    qwenFallbackPossible: false,
    ...options,
  };
}

function buildRawRequest(prompt, args) {
  return {
    model: MODEL,
    input: prompt,
    store: false,
    max_output_tokens: args.maxOutputTokens,
    reasoning: { effort: args.reasoningEffort },
  };
}

async function runRaw(prompt, args, options = {}) {
  const keyState = options.keyState || readKey(options);
  if (!keyState.key) throw Object.assign(new Error('Meta Model API key is missing'), { exitCode: 78 });
  const estimatedMaximumCostUsd = directWorstCaseCost(prompt, args.maxOutputTokens);
  if (estimatedMaximumCostUsd > args.maxCostUsd) {
    throw Object.assign(
      new Error(`Direct-call ceiling $${estimatedMaximumCostUsd.toFixed(6)} exceeds --max-cost-usd $${args.maxCostUsd.toFixed(6)}`),
      { exitCode: 77 },
    );
  }
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 180_000);
  let response;
  try {
    response = await (options.fetch || fetch)(RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keyState.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRawRequest(prompt, args)),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const detail = redact(body?.error?.message || body?.message || `HTTP ${response.status}`);
    const receipt = baseReceipt('raw_responses', startedAt, {
      ok: false,
      httpStatus: response.status,
      selectedModel: body?.model || null,
      keySource: keyState.source,
      estimatedMaximumCostUsd: Number(estimatedMaximumCostUsd.toFixed(6)),
      actualCostUsd: null,
      error: detail,
    });
    writeReceipt(receipt, options);
    throw Object.assign(new Error(`Meta Responses API failed: ${detail}`), { exitCode: 1 });
  }
  const text = extractResponseText(body);
  if (!text) throw Object.assign(new Error('Meta Responses API returned no final output text'), { exitCode: 1 });
  if (body.model && body.model !== MODEL) {
    throw Object.assign(new Error(`Route violation: requested ${MODEL}, received ${body.model}`), { exitCode: 70 });
  }
  const actualCostUsd = calculateActualCost(body.usage || {});
  const receipt = baseReceipt('raw_responses', startedAt, {
    ok: true,
    httpStatus: response.status,
    selectedModel: body.model || MODEL,
    responseStatus: body.status || null,
    keySource: keyState.source,
    estimatedMaximumCostUsd: Number(estimatedMaximumCostUsd.toFixed(6)),
    actualCostUsd: Number(actualCostUsd.toFixed(8)),
    usage: {
      inputTokens: Number(body.usage?.input_tokens || 0),
      outputTokens: Number(body.usage?.output_tokens || 0),
      reasoningTokens: Number(body.usage?.output_tokens_details?.reasoning_tokens || 0),
      cachedInputTokens: Number(body.usage?.input_tokens_details?.cached_tokens || 0),
      totalTokens: Number(body.usage?.total_tokens || 0),
    },
    routeVerified: true,
  });
  const paths = writeReceipt(receipt, options);
  return { text, receipt, paths };
}

function runOpenCode(prompt, args, options = {}) {
  const env = options.env || process.env;
  const keyState = options.keyState || readKey(options);
  if (!keyState.key) throw Object.assign(new Error('Meta Model API key is missing'), { exitCode: 78 });
  const openCodeBinary = options.openCodeBinary || findOpenCodeBinary(env);
  if (!openCodeBinary) throw Object.assign(new Error('OpenCode binary is missing'), { exitCode: 78 });
  const interactive = !prompt;
  const startedAt = new Date().toISOString();
  const childArgs = buildOpenCodeArgs(prompt, args);
  const childEnv = buildOpenCodeEnv(keyState.key, env);
  for (const directory of [
    OPENCODE_CONFIG_DIR,
    childEnv.XDG_DATA_HOME,
    childEnv.XDG_CACHE_HOME,
    childEnv.XDG_STATE_HOME,
  ]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const spawnOptions = {
    cwd: args.cwd,
    env: childEnv,
    timeout: options.timeoutMs || 60 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  };
  if (interactive) spawnOptions.stdio = 'inherit';
  else spawnOptions.encoding = 'utf8';
  const result = (options.spawn || spawnSync)(openCodeBinary, childArgs, spawnOptions);
  const stdout = interactive ? '' : String(result.stdout || '');
  const stderr = interactive ? '' : redact(String(result.stderr || ''));
  const ok = result.status === 0 && !result.error;
  const receipt = baseReceipt(interactive ? 'opencode_tui' : 'opencode_run', startedAt, {
    ok,
    exitCode: result.status,
    signal: result.signal || null,
    selectedProvider: OPENCODE_PROVIDER,
    selectedModel: OPENCODE_MODEL,
    keySource: keyState.source,
    reasoningEffort: args.reasoningEffort,
    estimatedMaximumCostUsd: null,
    actualCostUsd: null,
    actualUsageAvailable: false,
    hardCostCapEnforced: false,
    routeVerified: ok,
    routeProof: 'opencode_exact_model_plus_meta_only_allowlist_plus_isolated_state',
    error: result.error ? redact(result.error.message) : (ok ? null : stderr.slice(0, 1000)),
  });
  const paths = writeReceipt(receipt, options);
  return { ok, status: result.status, stdout, stderr, receipt, paths, error: result.error || null };
}

function buildHermesArgs(prompt, args) {
  return [
    'chat',
    '--query', prompt,
    '--quiet',
    '--source', 'meta-yolo',
    '--provider', HERMES_PROVIDER,
    '--model', MODEL,
    '--toolsets', args.toolsets,
    '--max-turns', String(args.maxTurns),
    '--checkpoints',
    '--accept-hooks',
    '--yolo',
  ];
}

function buildHermesEnv(key, env = process.env) {
  const childEnv = { ...env };
  for (const name of OTHER_PROVIDER_SECRET_KEYS) delete childEnv[name];
  delete childEnv.HERMES_INFERENCE_MODEL;
  delete childEnv.HERMES_INFERENCE_PROVIDER;
  delete childEnv[LEGACY_KEY_ENV];
  childEnv[KEY_ENV] = key;
  childEnv.HERMES_HOME = ISOLATED_PROFILE;
  childEnv.HERMES_YOLO_MODE = '1';
  childEnv.HERMES_ACCEPT_HOOKS = '1';
  childEnv.NO_COLOR = '1';
  return childEnv;
}

function runHermes(prompt, args, options = {}) {
  const env = options.env || process.env;
  const keyState = options.keyState || readKey(options);
  if (!keyState.key) throw Object.assign(new Error('Meta Model API key is missing'), { exitCode: 78 });
  const configState = options.configState || readConfigState(options.isolatedConfig || ISOLATED_CONFIG, true);
  if (!configState.isolatedReady) {
    throw Object.assign(new Error('The fail-closed Meta Hermes profile is missing or invalid'), { exitCode: 78 });
  }
  const hermesBinary = options.hermesBinary || findHermesBinary(env);
  if (!hermesBinary) throw Object.assign(new Error('Hermes binary is missing'), { exitCode: 78 });
  const estimatedMaximumCostUsd = hermesWorstCaseCost(args.maxTurns);
  if (estimatedMaximumCostUsd > args.maxCostUsd + Number.EPSILON) {
    throw Object.assign(
      new Error(`Hermes ceiling $${estimatedMaximumCostUsd.toFixed(6)} exceeds --max-cost-usd $${args.maxCostUsd.toFixed(6)}`),
      { exitCode: 77 },
    );
  }
  const startedAt = new Date().toISOString();
  const childArgs = buildHermesArgs(prompt, args);
  const result = (options.spawn || spawnSync)(hermesBinary, childArgs, {
    cwd: args.cwd,
    env: buildHermesEnv(keyState.key, env),
    encoding: 'utf8',
    timeout: options.timeoutMs || 15 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = String(result.stdout || '');
  const stderr = redact(String(result.stderr || ''));
  const ok = result.status === 0 && !result.error;
  const receipt = baseReceipt('hermes_agent', startedAt, {
    ok,
    exitCode: result.status,
    signal: result.signal || null,
    selectedProvider: HERMES_PROVIDER,
    selectedModel: MODEL,
    keySource: keyState.source,
    maxTurns: args.maxTurns,
    toolsets: args.toolsets.split(',').map((item) => item.trim()).filter(Boolean),
    estimatedMaximumCostUsd: Number(estimatedMaximumCostUsd.toFixed(6)),
    actualCostUsd: null,
    actualUsageAvailable: false,
    routeVerified: ok,
    routeProof: 'explicit_provider_model_plus_empty_fallback_chain',
    error: result.error ? redact(result.error.message) : (ok ? null : stderr.slice(0, 1000)),
  });
  const paths = writeReceipt(receipt, options);
  return { ok, status: result.status, stdout, stderr, receipt, paths, error: result.error || null };
}

function buildDryRun(args) {
  const promptPresent = Boolean(args.prompt);
  const estimatedMaximumCostUsd = args.mode === 'raw'
    ? directWorstCaseCost(args.prompt || 'dry-run', args.maxOutputTokens)
    : (args.mode === 'hermes' ? hermesWorstCaseCost(args.maxTurns) : null);
  return {
    schema: 'meta-yolo/dry-run-v1',
    mode: args.mode,
    promptPresent,
    promptStored: false,
    provider: args.mode === 'hermes' ? HERMES_PROVIDER : OPENCODE_PROVIDER,
    model: MODEL,
    selectedModel: args.mode === 'standalone' ? OPENCODE_MODEL : MODEL,
    baseUrl: BASE_URL,
    maxTurns: args.mode === 'hermes' ? args.maxTurns : 1,
    maxOutputTokens: args.maxOutputTokens,
    reasoningEffort: args.reasoningEffort,
    maxCostUsd: args.mode === 'standalone' ? null : args.maxCostUsd,
    estimatedMaximumCostUsd: estimatedMaximumCostUsd == null
      ? null
      : Number(estimatedMaximumCostUsd.toFixed(6)),
    withinCostCap: estimatedMaximumCostUsd == null ? null : estimatedMaximumCostUsd <= args.maxCostUsd,
    hardCostCapEnforced: args.mode !== 'standalone',
    fallbackProviders: [],
    qwenFallbackPossible: false,
    routeProof: args.mode === 'standalone'
      ? 'opencode_exact_model_plus_meta_only_allowlist_plus_isolated_state'
      : (args.mode === 'hermes'
        ? 'explicit_provider_model_plus_empty_fallback_chain'
        : 'direct_meta_responses_endpoint'),
    wouldExecute: false,
  };
}

function renderDoctor(report) {
  const lines = [
    `Meta Muse Spark: ${report.ready ? 'READY' : 'BLOCKED'}`,
    `Dedicated model: ${report.openCodeModel}`,
    `Standalone OpenCode ${report.openCode.version || 'missing'}: ${report.standaloneReady ? 'ready' : 'blocked'}`,
    `Direct Responses API: ${report.rawReady ? 'ready' : 'blocked'}`,
    `Hermes explicit route: ${report.hermesReady ? 'ready' : 'blocked'}`,
    `Credential: ${report.key.usable ? report.key.source : 'missing'}`,
    `Fallback: fail closed (Qwen possible: ${report.fallbackPolicy.qwenFallbackPossibleInMetaYolo ? 'yes' : 'no'})`,
    `Hermes hard ceiling: $${report.limits.defaultMaxCostUsd.toFixed(2)} per invocation`,
    'OpenCode hard ceiling: unavailable; Meta usage is metered',
  ];
  if (report.blockers.length) lines.push(`Blockers: ${report.blockers.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

function readPromptFromStdin() {
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (args.storeKeyStdin) {
    if (args.prompt || args.doctor || args.dryRun) throw new Error('--store-key-stdin cannot be combined with another action');
    const key = readPromptFromStdin();
    if (!key) throw new Error('--store-key-stdin requires the key on standard input');
    storeKey(key);
    process.stdout.write(`Meta Model API key stored in Keychain service ${KEYCHAIN_SERVICE}.\n`);
    return;
  }
  if (args.doctor) {
    const report = doctor();
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else process.stdout.write(renderDoctor(report));
    if (!report.ready) process.exitCode = 78;
    return;
  }
  if (!args.prompt) args.prompt = readPromptFromStdin();
  if (args.dryRun) {
    const plan = buildDryRun(args);
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    if (plan.withinCostCap === false) process.exitCode = 77;
    return;
  }
  if (!args.prompt) {
    if (args.mode !== 'standalone') {
      throw new Error(`${args.mode === 'hermes' ? '--hermes' : '--raw'} requires a task`);
    }
    const result = runOpenCode('', args);
    if (!result.ok) process.exitCode = result.status || 1;
    return;
  }
  if (args.mode === 'raw') {
    const result = await runRaw(args.prompt, args);
    process.stdout.write(result.text);
    if (!result.text.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  if (args.mode === 'standalone') {
    const result = runOpenCode(args.prompt, args);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (!result.ok) process.exitCode = result.status || 1;
    return;
  }
  const result = runHermes(args.prompt, args);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!result.ok) process.exitCode = result.status || 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`meta-yolo: ${redact(error.message)}`);
    process.exit(error.exitCode || 2);
  });
}

module.exports = {
  BASE_URL,
  DEFAULT_MAX_COST_USD,
  DEFAULT_MAX_TURNS,
  HERMES_PROVIDER,
  ISOLATED_CONFIG,
  ISOLATED_PROFILE,
  KEYCHAIN_SERVICE,
  KEY_ENV,
  MODEL,
  OPENCODE_CONFIG_DIR,
  OPENCODE_MODEL,
  OPENCODE_PROVIDER,
  OPENCODE_XDG_HOME,
  OPERATIONAL_CONTEXT_TOKENS,
  OPERATIONAL_OUTPUT_TOKENS,
  PRICING,
  buildDryRun,
  buildHermesArgs,
  buildHermesEnv,
  buildOpenCodeArgs,
  buildOpenCodeConfig,
  buildOpenCodeEnv,
  buildRawRequest,
  calculateActualCost,
  directWorstCaseCost,
  doctor,
  estimateTokens,
  extractResponseText,
  findHermesBinary,
  findOpenCodeBinary,
  hermesWorstCaseCost,
  isPlausibleKey,
  parseArgs,
  parseOpenCodeVersion,
  readConfigState,
  readKey,
  redact,
  runHermes,
  runOpenCode,
  runRaw,
  storeKey,
  writeReceipt,
};
