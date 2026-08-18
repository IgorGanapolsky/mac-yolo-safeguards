#!/usr/bin/env node
'use strict';

/**
 * Prompt-aware JCode launcher.
 *
 * The policy is deliberately outside the model context: prompt text can choose
 * among local/subscription lanes, but it can never enable a metered provider.
 * Every launch passes explicit provider/model flags so JCode daemon state cannot
 * silently pin the wrapper to GPT-5.6 Sol.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local', 'bin', 'jcode');
const HERMES_ENV_PATH = process.env.HERMES_ENV_PATH || path.join(HOME, '.hermes', '.env');
const RECEIPT_DIR = process.env.JCODE_RECEIPT_DIR || path.join(HOME, '.jcode', 'receipts', 'jcode-yolo');
const LATEST_RECEIPT_PATH = path.join(RECEIPT_DIR, 'latest.json');

const MONTHLY_METERED_BUDGET_USD = 10;
const ROUTES = Object.freeze({
  localFast: Object.freeze({
    id: 'local-fast', provider: 'ollama', model: 'qwen2.5:3b-hermes-64k', costClass: 'local',
  }),
  localPrivate: Object.freeze({
    id: 'local-private', provider: 'ollama', model: 'qwen3.5:9b-hermes-32k', costClass: 'local',
  }),
  glm53: Object.freeze({
    id: 'glm53', provider: 'zai', model: 'glm-5.3', costClass: 'subscription',
  }),
  balanced: Object.freeze({
    id: 'balanced', provider: 'openai', model: 'gpt-5.6-luna', costClass: 'subscription',
  }),
  frontier: Object.freeze({
    id: 'frontier', provider: 'openai', model: 'gpt-5.6-sol', costClass: 'subscription',
  }),
});

const METERED_PROVIDERS = new Set([
  'anthropic-api', 'openai-api', 'openrouter', 'azure', 'opencode', 'opencode-go',
  'groq', 'mistral', 'perplexity', 'together-ai', 'togetherai', 'deepinfra',
  'xai', 'chutes', 'cerebras', 'baseten', 'fireworks', 'nebius', 'scaleway',
]);

const SENSITIVE_RE = /\b(secret|credential|password|passcode|api[ -]?key|private key|customer data|pii|medical|payroll|confidential|local only)\b/i;
const FRONTIER_RE = /\b(max(?:imum)? quality|frontier|hardest|cross[- ]repo architecture|production incident|prove correctness|formal proof)\b/i;
const CODING_RE = /\b(code|coding|implement|debug|refactor|test|typescript|javascript|python|rust|swift|kotlin|sql|compile|build|ci|pull request|security|cyber|vulnerabilit|exploit|threat|incident response)\b/i;
const ROUTINE_RE = /\b(quick|small|simple|format|rename|typo|summari[sz]e|explain|list|documentation|comment|readme|one[- ]line)\b/i;

function parseEnvFileValue(filePath, names) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const name of names) {
      const match = content.match(new RegExp(`^${name}=([^\\r\\n]+)$`, 'm'));
      if (match && match[1].trim()) return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return null;
}

function loadZaiKey(env = process.env, options = {}) {
  const direct = env.ZHIPU_API_KEY || env.Z_AI_API_KEY || env.ZAI_API_KEY;
  if (direct) return direct;

  const fromFile = parseEnvFileValue(options.hermesEnvPath || HERMES_ENV_PATH, [
    'ZHIPU_API_KEY', 'Z_AI_API_KEY', 'ZAI_API_KEY',
  ]);
  if (fromFile) return fromFile;
  if (options.disableKeychain) return null;

  for (const service of ['Z_AI_API_KEY', 'ZHIPU_API_KEY', 'ZAI_API_KEY']) {
    try {
      const result = spawnSync('security', ['find-generic-password', '-s', service, '-w'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    } catch {}
  }
  return null;
}

function classifyPrompt(prompt = '') {
  const text = String(prompt).trim();
  if (SENSITIVE_RE.test(text)) return { routeId: 'localPrivate', reason: 'sensitive-local' };
  if (FRONTIER_RE.test(text)) return { routeId: 'frontier', reason: 'frontier-quality' };
  if (CODING_RE.test(text)) return { routeId: 'glm53', reason: 'coding-or-security' };
  if (ROUTINE_RE.test(text)) return { routeId: 'balanced', reason: 'routine-balanced-subscription' };
  return { routeId: 'balanced', reason: text ? 'balanced-default' : 'interactive-balanced' };
}

function inferProvider(model) {
  if (!model) return null;
  if (/^glm-5\.3$/i.test(model)) return 'zai';
  if (/^gpt-/i.test(model)) return 'openai';
  if (/^(qwen|glm4|gemma|deepseek|phi|ornith)[^/]*:/i.test(model)) return 'ollama';
  return null;
}

function assertNonMetered(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (METERED_PROVIDERS.has(normalized)) {
    throw new Error(
      `Metered provider '${provider}' is disabled in jcode-yolo; the hard monthly API ceiling is $${MONTHLY_METERED_BUDGET_USD}.00 and no authoritative provider receipt was supplied.`,
    );
  }
}

function selectRoute(prompt = '', env = process.env, options = {}) {
  const zaiKey = options.zaiKey === undefined ? loadZaiKey(env, options) : options.zaiKey;
  const requestedProvider = env.JCODE_ROUTE_PROVIDER && env.JCODE_ROUTE_PROVIDER !== 'auto'
    ? env.JCODE_ROUTE_PROVIDER.toLowerCase()
    : null;
  const requestedModel = env.JCODE_ROUTE_MODEL && env.JCODE_ROUTE_MODEL !== 'provider-default'
    ? env.JCODE_ROUTE_MODEL
    : null;

  if (requestedProvider || requestedModel) {
    const provider = requestedProvider || inferProvider(requestedModel);
    if (!provider) throw new Error('JCODE_ROUTE_MODEL requires a recognizable non-metered provider');
    assertNonMetered(provider);
    if (provider === 'zai' && !zaiKey) throw new Error('Z.ai route requested but no ZHIPU_API_KEY/Z_AI_API_KEY is available');
    const defaults = provider === 'zai' ? ROUTES.glm53
      : provider === 'ollama' ? ROUTES.localFast
        : provider === 'openai' ? ROUTES.balanced
          : null;
    if (!defaults && !requestedModel) throw new Error(`JCODE_ROUTE_MODEL is required for provider '${provider}'`);
    return {
      id: 'explicit', provider, model: requestedModel || defaults.model,
      costClass: provider === 'ollama' ? 'local' : 'subscription',
      reason: 'explicit-non-metered-override', zaiKey,
    };
  }

  const classification = classifyPrompt(prompt);
  let route = ROUTES[classification.routeId];
  let reason = classification.reason;
  if (route.id === 'glm53' && !zaiKey) {
    route = ROUTES.balanced;
    reason = 'coding-zai-unavailable-balanced-subscription';
  }
  return { ...route, reason, zaiKey };
}

function resolveJcodeConfig(env = process.env, prompt = '', options = {}) {
  const route = selectRoute(prompt, env, options);
  return {
    ...route,
    hasJcodeBin: fs.existsSync(options.jcodeBin || JCODE_BIN),
    jcodeBin: options.jcodeBin || JCODE_BIN,
    monthlyMeteredBudgetUsd: MONTHLY_METERED_BUDGET_USD,
    meteredApiAllowed: false,
  };
}

function buildChildArgs(route, prompt = '') {
  const selection = ['--provider', route.provider, '--model', route.model];
  return prompt ? ['run', ...selection, prompt] : selection;
}

function makeReceipt(route, prompt, extra = {}) {
  return {
    schema: 'jcode-yolo-route-receipt/v1',
    runId: extra.runId || `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    promptSha256: crypto.createHash('sha256').update(String(prompt || '')).digest('hex'),
    promptStored: false,
    route: {
      id: route.id,
      provider: route.provider,
      model: route.model,
      costClass: route.costClass,
      reason: route.reason,
    },
    budget: {
      monthlyMeteredBudgetUsd: MONTHLY_METERED_BUDGET_USD,
      meteredApiAllowed: false,
      expectedIncrementalApiCostUsd: 0,
    },
    ...extra,
  };
}

function writeReceipt(receipt, receiptPath = LATEST_RECEIPT_PATH) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  const tempPath = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, receiptPath);
  return receiptPath;
}

function writeReceiptSet(receipt, receiptDir = RECEIPT_DIR) {
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const status = String(receipt.status || 'event').replace(/[^a-z0-9_-]/gi, '-');
  const eventPath = path.join(receiptDir, `${receipt.runId}-${status}.json`);
  fs.writeFileSync(eventPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  writeReceipt(receipt, path.join(receiptDir, 'latest.json'));
  return { eventPath, latestPath: path.join(receiptDir, 'latest.json') };
}

function runDoctor(json = false, env = process.env, options = {}) {
  const config = resolveJcodeConfig(env, '', options);
  const report = {
    schema: 'jcode-yolo-doctor/v2',
    status: config.hasJcodeBin ? 'READY' : 'JCODE_BIN_MISSING',
    provider: config.provider,
    model: config.model,
    reason: config.reason,
    zaiKeyPresent: Boolean(config.zaiKey),
    binary: config.jcodeBin,
    monthlyMeteredBudgetUsd: MONTHLY_METERED_BUDGET_USD,
    meteredApiAllowed: false,
    explicitProviderModelFlags: true,
  };
  console.log(json ? JSON.stringify(report, null, 2) : [
    `jcode-yolo ready: ${report.status === 'READY' ? 'YES' : 'NO'}`,
    `route: ${report.provider}/${report.model} (${report.reason})`,
    `zai: ${report.zaiKeyPresent ? 'KEY PRESENT' : 'KEY MISSING'}`,
    `metered API: DISABLED (hard ceiling $${MONTHLY_METERED_BUDGET_USD}.00/mo)`,
  ].join('\n'));
  return { exitCode: config.hasJcodeBin ? 0 : 1, report };
}

function promptFromArgs(args) {
  if (args[0] === '-z' || args[0] === '--oneshot') return args.slice(1).join(' ').trim();
  return args.join(' ').trim();
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'doctor' || args[0] === '--doctor') {
    const result = runDoctor(args.includes('--json'));
    process.exit(result.exitCode);
  }
  if (args[0] === 'route' || args[0] === '--route') {
    const prompt = args.slice(1).join(' ');
    const route = selectRoute(prompt);
    console.log(JSON.stringify(makeReceipt(route, prompt), null, 2));
    return;
  }

  const prompt = promptFromArgs(args);
  let config;
  try {
    config = resolveJcodeConfig(process.env, prompt);
  } catch (error) {
    process.stderr.write(`[jcode-yolo] BLOCKED: ${error.message}\n`);
    process.exit(78);
  }
  if (config.zaiKey) {
    process.env.ZHIPU_API_KEY = config.zaiKey;
    process.env.Z_AI_API_KEY = config.zaiKey;
  }
  process.env.JCODE_YOLO = '1';
  process.env.JCODE_AUTONOMY = '1';

  if (!config.hasJcodeBin) {
    console.error('[jcode-yolo] JCode binary not found');
    process.exit(127);
  }

  const childArgs = buildChildArgs(config, prompt);
  const receipt = makeReceipt(config, prompt, { childArgs, status: 'selected' });
  writeReceiptSet(receipt);
  console.error(`[jcode-yolo] route=${config.provider}/${config.model} reason=${config.reason} metered_usd=0 ceiling_usd=${MONTHLY_METERED_BUDGET_USD}`);

  const child = spawn(config.jcodeBin, childArgs, { stdio: 'inherit', env: process.env });
  child.on('error', (error) => {
    writeReceiptSet({ ...receipt, status: 'spawn_error', errorCode: error.code || 'UNKNOWN' });
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    const exitCode = Number.isInteger(code) ? code : 1;
    writeReceiptSet({ ...receipt, status: exitCode === 0 ? 'completed' : 'failed', exitCode, signal: signal || null });
    process.exit(exitCode);
  });
}

if (require.main === module) main();

module.exports = {
  MONTHLY_METERED_BUDGET_USD,
  ROUTES,
  assertNonMetered,
  buildChildArgs,
  classifyPrompt,
  loadZaiKey,
  makeReceipt,
  resolveJcodeConfig,
  runDoctor,
  selectRoute,
  writeReceipt,
  writeReceiptSet,
};
