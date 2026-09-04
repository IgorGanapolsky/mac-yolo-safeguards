#!/usr/bin/env node
'use strict';

/**
 * jcode-yolo-wrapper.js — prompt-aware multi-model launcher.
 *
 * JCode v0.76 pins OpenAI users to gpt-5.6-sol when JCODE_DEFAULT_PROVIDER=openai
 * (zshrc + hotkey LaunchAgent). CLI --provider/--model alone is not enough:
 * env_snapshots still record OpenAI/gpt-5.6-sol. Every spawn therefore:
 *   1. classifies the prompt onto a specialist lane
 *   2. overrides inherited OpenAI/Sol env
 *   3. passes explicit --provider/--model
 *
 * Sol is opt-in only. Default / TUI / coding-plan work is GLM-5.3 ($0 marginal).
 * Metered OpenRouter specialists are used only when the $10/mo guard allows.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local', 'bin', 'jcode');
const JCODE_CONFIG_PATH = process.env.JCODE_CONFIG || path.join(HOME, '.jcode', 'config.toml');
const HERMES_ENV_PATH = process.env.HERMES_ENV_PATH || path.join(HOME, '.hermes', '.env');
const RECEIPT_DIR = process.env.JCODE_RECEIPT_DIR || path.join(HOME, '.jcode', 'receipts', 'jcode-yolo');
const LATEST_RECEIPT_PATH = path.join(RECEIPT_DIR, 'latest.json');

/**
 * JCode v0.81+ rejects auth="api_key" (only bearer|header|none).
 * Heal before spawn so a stale config.toml cannot hard-crash every launch.
 */
function healJcodeConfigToml(configPath = JCODE_CONFIG_PATH) {
  try {
    if (!fs.existsSync(configPath)) return { healed: false, reason: 'missing' };
    const before = fs.readFileSync(configPath, 'utf8');
    let after = before.replace(
      /^(\s*auth\s*=\s*)(["']?)api_key\2/gim,
      '$1"bearer"',
    );
    // Keep litellm default on hermes-local while Z.ai latch is exhausted (Novita glm-coding = empty content).
    if (/\[providers\.litellm-hermes\]/.test(after) && /default_model\s*=\s*["']glm-coding["']/.test(after)) {
      after = after.replace(
        /(\[providers\.litellm-hermes\][\s\S]*?default_model\s*=\s*)(["'])glm-coding\2/m,
        '$1$2hermes-local$2',
      );
    }
    if (after === before) return { healed: false, reason: 'clean' };
    fs.writeFileSync(configPath, after, 'utf8');
    return { healed: true, reason: 'rewrote-invalid-auth-or-glm-coding-default' };
  } catch (error) {
    return { healed: false, reason: `heal-failed:${error.code || error.message}` };
  }
}
const MONTHLY_BUDGET_USD = 10.00;
const CLOSED_INHERITED_PROVIDERS = new Set([
  'openai', 'openai-api', 'claude', 'anthropic', 'anthropic-api',
  'grok', 'gemini', 'cursor', 'copilot', 'auto',
]);

const ROUTES = Object.freeze({
  glm53: Object.freeze({
    id: 'glm53',
    provider: 'zai',
    model: 'glm-5.3',
    costClass: 'subscription',
    estimatedCostUsd: 0.00,
    description: 'Zhipu GLM-5.3 Coding Plan ($0 marginal, CyberGym 84.5%)',
  }),
  glm53_openrouter: Object.freeze({
    id: 'glm53_openrouter',
    provider: 'openrouter',
    model: 'z-ai/glm-5.3',
    costClass: 'metered',
    estimatedCostUsd: 0.02,
    description: 'GLM-5.3 via OpenRouter when Z.AI Coding Plan quota exhausted',
  }),
  glm_litellm: Object.freeze({
    id: 'glm_litellm',
    provider: 'litellm-hermes',
    providerProfile: 'litellm-hermes',
    model: 'glm-coding',
    costClass: 'subscription',
    estimatedCostUsd: 0.00,
    description: 'Fleet LiteLLM glm-coding (localhost proxy — often Novita thinking-only / empty content)',
  }),
  hermes_local_litellm: Object.freeze({
    id: 'hermes_local_litellm',
    provider: 'litellm-hermes',
    providerProfile: 'litellm-hermes',
    model: 'hermes-local',
    costClass: 'local',
    estimatedCostUsd: 0.00,
    description: 'Fleet LiteLLM hermes-local (Ollama; reliable tool-calling)',
  }),
  mimo_pro: Object.freeze({
    id: 'mimo_pro',
    provider: 'openrouter',
    model: 'xiaomi/mimo-v2.5-pro',
    costClass: 'metered',
    estimatedCostUsd: 0.015,
    description: 'Xiaomi MiMo-V2.5-Pro long-horizon 1M',
  }),
  qwen37_plus: Object.freeze({
    id: 'qwen37_plus',
    provider: 'openrouter',
    model: 'qwen/qwen3.7-plus',
    costClass: 'metered',
    estimatedCostUsd: 0.008,
    description: 'Alibaba Qwen 3.7 Plus balanced coding',
  }),
  minimax_m3: Object.freeze({
    id: 'minimax_m3',
    provider: 'openrouter',
    model: 'minimax/minimax-m3',
    costClass: 'metered',
    estimatedCostUsd: 0.005,
    description: 'MiniMax M3 multimodal',
  }),
  seed_turbo: Object.freeze({
    id: 'seed_turbo',
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2-1-turbo',
    costClass: 'metered_cheap',
    estimatedCostUsd: 0.001,
    description: 'ByteDance Seed 2.1 Turbo fast edits',
  }),
  gemini37_flash: Object.freeze({
    id: 'gemini37_flash',
    provider: 'openrouter',
    model: 'google/gemini-3.7-flash',
    costClass: 'metered_cheap',
    estimatedCostUsd: 0.001,
    description: 'Google Gemini 3.7 Flash hybrid reasoning & 1M context ($0.375/M)',
  }),
  gpt_sol: Object.freeze({
    id: 'gpt_sol',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    costClass: 'subscription',
    estimatedCostUsd: 0.00,
    description: 'OpenAI GPT-5.6 Sol (explicit request only)',
  }),
  local: Object.freeze({
    id: 'local',
    provider: 'ollama',
    model: 'qwen2.5:3b-hermes-64k',
    costClass: 'local',
    estimatedCostUsd: 0.00,
    description: 'Local Ollama zero-cost fallback',
  }),
});

const ADMIN_COMMANDS = new Set([
  'serve', 'acp', 'server', 'connect', 'login', 'account', 'repl', 'update',
  'version', 'usage', 'telemetry', 'self-dev', 'debug', 'auth', 'provider',
  'memory', 'session', 'ambient', 'cloud', 'pair', 'permissions', 'transcript',
  'dictate', 'setup-hotkey', 'setup-launcher', 'browser', 'replay', 'model',
  'menubar', 'restart', 'api-bridge', 'help', 'provider-test-coverage',
  'provider-doctor', 'auth-test',
]);

const SENSITIVE_RE = /\b(secret|credential|password|passcode|api[ -]?key|private key|customer data|pii|medical|payroll|confidential|local only)\b/i;
const CYBER_SECURITY_RE = /\b(security|cyber|cybergym|vulnerabilit|exploit|threat|cve-|cwe-|injection|sanitize|auth bypass|cors|xss|sqli|audit|patch remediation)\b/i;
const AGENTIC_HORIZON_RE = /\b(long[- ]horizon|multi[- ]step agent|deep refactor|architecture redesign|complex workflow|orchestrat|repo[- ]wide)\b/i;
const MULTIMODAL_RE = /\b(multimodal|video|image|photo|audio|vision|render|media extract|asset)\b/i;
const FAST_ROUTINE_RE = /\b(quick|small|simple|boilerplate|format|rename|typo|summari[sz]e|regex|unit[- ]test|helper|one[- ]line|fast fix)\b/i;
const EXPLICIT_GPT_RE = /\b(gpt[- ]?5|gpt[- ]?sol|openai|chatgpt)\b/i;
const GEMINI_RE = /\b(gemini|gemini[- ]?3\.7|gemini[- ]?flash|hybrid reasoning|thinking level)\b/i;
const BALANCED_CODING_RE = /\b(implement|code|build|feature|function|class|handler|route|api|endpoint|typescript|javascript|python|rust|swift|sql)\b/i;

let openrouterGuard;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  openrouterGuard = require(path.join(HOME, '.jcode', 'openrouter-budget-guard'));
} catch {
  openrouterGuard = null;
}

function parseEnvFileValue(filePath, names) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const name of names) {
      const match = content.match(new RegExp(`^${name}=([^\\r\\n]+)$`, 'm'));
      if (match && match[1].trim()) return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    return null;
  }
  return null;
}

function loadKey(names, serviceName, env = process.env, options = {}) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  const fromFile = parseEnvFileValue(options.hermesEnvPath || HERMES_ENV_PATH, names);
  if (fromFile) return fromFile;
  if (options.disableKeychain) return null;

  for (const name of names) {
    try {
      const result = spawnSync('security', ['find-generic-password', '-s', name, '-w'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    } catch { /* continue */ }
  }
  if (serviceName) {
    try {
      const result = spawnSync('security', ['find-generic-password', '-s', serviceName, '-w'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    } catch { /* continue */ }
  }
  return null;
}

function classifyPrompt(prompt = '') {
  const text = String(prompt).trim();
  if (SENSITIVE_RE.test(text)) return { routeId: 'local', reason: 'sensitive-local' };
  if (CYBER_SECURITY_RE.test(text)) return { routeId: 'glm53', reason: 'cyber-security-audit-84.5%' };
  if (GEMINI_RE.test(text)) return { routeId: 'gemini37_flash', reason: 'gemini-3.7-flash-hybrid-reasoning' };
  if (MULTIMODAL_RE.test(text)) return { routeId: 'minimax_m3', reason: 'multimodal-vision-media' };
  if (AGENTIC_HORIZON_RE.test(text)) return { routeId: 'mimo_pro', reason: 'agentic-long-horizon-1m' };
  if (FAST_ROUTINE_RE.test(text)) return { routeId: 'seed_turbo', reason: 'fast-autonomous-boilerplate' };
  if (EXPLICIT_GPT_RE.test(text)) return { routeId: 'gpt_sol', reason: 'explicit-gpt-request' };
  if (BALANCED_CODING_RE.test(text)) return { routeId: 'qwen37_plus', reason: 'balanced-smart-coding' };
  return { routeId: 'glm53', reason: text ? 'default-flagship-coding-plan' : 'interactive-glm53-not-sol' };
}

function resolveLitellmRoute(model) {
  const id = String(model || '').trim().toLowerCase();
  if (id === 'hermes-local' || id === 'vision-local') return ROUTES.hermes_local_litellm;
  if (id === 'glm-coding' || id === 'nous-deepseek') return ROUTES.glm_litellm;
  return null;
}

function inferProvider(model) {
  if (!model) return null;
  if (resolveLitellmRoute(model)) return 'litellm-hermes';
  if (/^glm-5\.3$/i.test(model)) return 'zai';
  if (/^gpt-/i.test(model)) return 'openai';
  if (/^(mimo|qwen3\.7|minimax|seed|claude|deepseek|google\/gemini|gemini)/i.test(model) || model.includes('/')) return 'openrouter';
  if (/^(qwen|glm4|gemma|phi|ornith)[^/]*:/i.test(model)) return 'ollama';
  return null;
}

function budgetAllowsPaid(options = {}) {
  if (typeof options.budgetAllowsPaid === 'boolean') return options.budgetAllowsPaid;
  if (!openrouterGuard) return true;
  try {
    const pacing = openrouterGuard.getBudgetPacingStatus();
    return Boolean(pacing && pacing.allowPaid);
  } catch {
    return true;
  }
}

function readBudgetPacing(options = {}) {
  if (options.budgetPacing) return options.budgetPacing;
  if (!openrouterGuard) return null;
  try {
    return openrouterGuard.getBudgetPacingStatus();
  } catch {
    return null;
  }
}

const ZAI_QUOTA_FILE = process.env.ZAI_QUOTA_FILE || path.join(HOME, '.jcode', 'zai_quota_status.json');
const TMP_ZAI_QUOTA_FILE = '/tmp/zai_quota_status.json';

function checkZaiQuotaStatus(options = {}) {
  if (options.zaiQuotaExhausted === true) return { available: false, reason: 'options-quota-exhausted' };
  if (options.zaiQuotaExhausted === false) return { available: true };
  if (process.env.ZAI_QUOTA_EXHAUSTED === '1' || process.env.ZAI_DISABLED === '1') {
    return { available: false, reason: 'env-disabled' };
  }
  const candidateFiles = [
    options.zaiQuotaFile,
    ZAI_QUOTA_FILE,
    TMP_ZAI_QUOTA_FILE,
  ].filter(Boolean);

  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data && data.quotaExhausted) {
          if (data.resetAt) {
            const resetTime = new Date(data.resetAt).getTime();
            if (!Number.isNaN(resetTime) && resetTime > Date.now()) {
              return { available: false, reason: `quota-exhausted-until-${data.resetAt}` };
            }
          } else {
            return { available: false, reason: 'quota-exhausted' };
          }
        }
      }
    } catch { /* ignore */ }
  }
  return { available: true };
}

function selectRoute(prompt = '', env = process.env, options = {}) {
  const zaiKey = options.zaiKey !== undefined
    ? options.zaiKey
    : loadKey(['ZHIPU_API_KEY', 'Z_AI_API_KEY', 'ZAI_API_KEY'], 'hermes-agent-secrets', env, options);
  const openrouterKey = options.openrouterKey !== undefined
    ? options.openrouterKey
    : loadKey(['OPENROUTER_API_KEY'], 'hermes-agent-secrets', env, options);
  const pacing = readBudgetPacing(options);
  const allowPaid = budgetAllowsPaid({ ...options, budgetPacing: pacing });
  const zaiStatus = checkZaiQuotaStatus(options);
  const zaiAvailable = Boolean(zaiKey && zaiStatus.available);

  const requestedProvider = env.JCODE_ROUTE_PROVIDER && env.JCODE_ROUTE_PROVIDER !== 'auto'
    ? env.JCODE_ROUTE_PROVIDER.toLowerCase()
    : null;
  const requestedModel = env.JCODE_ROUTE_MODEL && env.JCODE_ROUTE_MODEL !== 'provider-default'
    ? env.JCODE_ROUTE_MODEL
    : null;

  // Inherited JCODE_DEFAULT_PROVIDER=openai is NOT an explicit request.
  if (requestedProvider || requestedModel) {
    const litellmRoute = resolveLitellmRoute(requestedModel);
    const wantsLitellm = !requestedProvider
      || requestedProvider === 'litellm-hermes'
      || requestedProvider === 'litellm'
      || requestedProvider === 'hermes';
    // glm-coding via Novita returns empty content; coerce sticky/explicit glm-coding → hermes-local.
    if (litellmRoute && wantsLitellm) {
      const coerced = requestedModel && /^glm-coding$/i.test(requestedModel)
        ? ROUTES.hermes_local_litellm
        : litellmRoute;
      return {
        ...coerced,
        reason: coerced.id === 'hermes_local_litellm' && /^glm-coding$/i.test(String(requestedModel || ''))
          ? 'explicit-user-override-coerced-glm-coding-to-hermes-local'
          : 'explicit-user-override',
        zaiKey,
        zaiAvailable,
        openrouterKey,
        budgetPacing: pacing,
        inheritedDefaultQuarantined: CLOSED_INHERITED_PROVIDERS.has(String(env.JCODE_DEFAULT_PROVIDER || '').toLowerCase()),
      };
    }
    const provider = requestedProvider || inferProvider(requestedModel) || 'ollama';
    const model = requestedModel || (provider === 'zai' ? 'glm-5.3' : provider === 'ollama' ? ROUTES.local.model : 'glm-5.3');
    return {
      id: 'explicit',
      provider,
      model,
      costClass: provider === 'ollama' ? 'local' : provider === 'zai' ? 'subscription' : provider === 'openai' ? 'subscription' : 'metered',
      estimatedCostUsd: provider === 'ollama' || provider === 'zai' || provider === 'openai' ? 0.00 : 0.01,
      reason: 'explicit-user-override',
      zaiKey,
      zaiAvailable,
      openrouterKey,
      budgetPacing: pacing,
      inheritedDefaultQuarantined: CLOSED_INHERITED_PROVIDERS.has(String(env.JCODE_DEFAULT_PROVIDER || '').toLowerCase()),
    };
  }

  const classification = classifyPrompt(prompt);
  let route = ROUTES[classification.routeId] || (zaiAvailable ? ROUTES.glm53 : ROUTES.local);
  let reason = classification.reason;

  if (route.provider === 'openrouter') {
    if (!openrouterKey || !allowPaid) {
      if (zaiAvailable) {
        route = ROUTES.glm53;
        reason = `${classification.reason}-openrouter-budget-fallback-to-glm53`;
      } else {
        // OpenRouter credits at $0 (402) + Z.ai exhausted → hermes-local, not raw Ollama mistarget.
        route = ROUTES.hermes_local_litellm;
        reason = `${classification.reason}-openrouter-budget-fallback-to-hermes-local`;
      }
    }
  } else if (route.provider === 'zai' && !zaiAvailable) {
    // 2026-09-04: Z.AI coding-plan latched exhausted; OpenRouter balance hit 402
    // ("can only afford 0"); glm-coding via Novita returns content:null → empty
    // guardrail turns. Always fall through to hermes-local (proven HTTP 200).
    route = ROUTES.hermes_local_litellm;
    reason = `${classification.reason}-zai-${!zaiKey ? 'missing-key' : 'quota-exhausted'}-fallback-to-hermes-local`;
  } else if (route.provider === 'openrouter' && !openrouterKey) {
    route = ROUTES.hermes_local_litellm;
    reason = `${classification.reason}-openrouter-missing-key-fallback-to-hermes-local`;
  }

  return {
    ...route,
    reason,
    zaiKey,
    zaiAvailable,
    openrouterKey,
    budgetPacing: pacing,
    inheritedDefaultQuarantined: CLOSED_INHERITED_PROVIDERS.has(String(env.JCODE_DEFAULT_PROVIDER || '').toLowerCase()),
  };
}

function resolveJcodeConfig(env = process.env, prompt = '', options = {}) {
  const route = selectRoute(prompt, env, options);
  return {
    ...route,
    hasJcodeBin: fs.existsSync(options.jcodeBin || JCODE_BIN),
    jcodeBin: options.jcodeBin || JCODE_BIN,
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    monthlyMeteredBudgetUsd: MONTHLY_BUDGET_USD,
  };
}

function isAdminArgv(args = []) {
  if (!args.length) return false;
  if (args.includes('--help') || args.includes('-h') || args.includes('-V') || args.includes('--version')) {
    return true;
  }
  return ADMIN_COMMANDS.has(args[0]);
}

function buildLaunch(route, args = []) {
  const selection = [];
  // Named [providers.<name>] profiles must use --provider-profile (implies openai-compatible).
  // Passing --provider litellm-hermes is rejected by the CLI enum.
  if (route.providerProfile || route.provider === 'litellm-hermes' || route.id === 'glm_litellm') {
    const profile = route.providerProfile || 'litellm-hermes';
    selection.push('--provider-profile', profile, '--model', route.model, '--no-update');
  } else {
    selection.push('--provider', route.provider, '--model', route.model, '--no-update');
  }
  if (!args.length) {
    return { mode: 'interactive', prompt: '', childArgs: selection };
  }
  if (isAdminArgv(args)) {
    return { mode: 'admin', prompt: '', childArgs: [...selection, ...args] };
  }
  if (args[0] === 'run') {
    const prompt = args.slice(1).join(' ').trim();
    return { mode: 'one_shot', prompt, childArgs: ['run', ...selection, ...args.slice(1)] };
  }
  if (args[0] === '-z' || args[0] === '--oneshot') {
    const prompt = args.slice(1).join(' ').trim();
    return { mode: 'one_shot', prompt, childArgs: ['run', ...selection, prompt] };
  }
  const prompt = args.join(' ').trim();
  return { mode: 'one_shot', prompt, childArgs: ['run', ...selection, prompt] };
}

function buildChildArgs(route, prompt = '', rawArgs) {
  if (Array.isArray(rawArgs)) return buildLaunch(route, rawArgs).childArgs;
  const launch = buildLaunch(route, prompt ? [prompt] : []);
  return launch.childArgs;
}

function buildChildEnv(route, env = process.env) {
  const inheritedProvider = String(env.JCODE_DEFAULT_PROVIDER || '').toLowerCase();
  const inheritedModel = String(env.JCODE_MODEL || '');
  const child = { ...env };

  child.JCODE_DEFAULT_PROVIDER = route.provider;
  child.JCODE_ACTIVE_PROVIDER = route.provider;
  child.JCODE_RUNTIME_PROVIDER = route.provider;
  child.JCODE_MODEL = route.model;
  child.JCODE_ROUTE_PROVIDER = route.provider;
  child.JCODE_ROUTE_MODEL = route.model;
  child.JCODE_YOLO = '1';
  child.JCODE_AUTONOMY = '1';

  if (route.provider !== 'openai') {
    if (CLOSED_INHERITED_PROVIDERS.has(inheritedProvider)) {
      child.JCODE_QUARANTINED_DEFAULT_PROVIDER = inheritedProvider;
    }
    if (/gpt-5\.6-sol|gpt-5\.6-luna|gpt-5/i.test(inheritedModel)) {
      child.JCODE_QUARANTINED_MODEL = inheritedModel;
    }
  }

  if (route.zaiKey) {
    child.ZHIPU_API_KEY = route.zaiKey;
    child.Z_AI_API_KEY = route.zaiKey;
  }
  if (route.openrouterKey) {
    child.OPENROUTER_API_KEY = route.openrouterKey;
  }
  return child;
}

function makeReceipt(route, prompt, extra = {}) {
  return {
    schema: 'jcode-yolo-route-receipt/v3',
    runId: extra.runId || `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    promptSha256: crypto.createHash('sha256').update(String(prompt || '')).digest('hex'),
    promptStored: false,
    route: {
      id: route.id,
      provider: route.provider,
      model: route.model,
      costClass: route.costClass,
      estimatedCostUsd: route.estimatedCostUsd || 0,
      reason: route.reason,
      inheritedDefaultQuarantined: Boolean(route.inheritedDefaultQuarantined),
    },
    budget: {
      monthlyMeteredBudgetUsd: MONTHLY_BUDGET_USD,
      currentPacingStatus: route.budgetPacing?.pacingStatus || 'GREEN',
      remainingBudgetUsd: route.budgetPacing?.remainingBudgetUsd ?? MONTHLY_BUDGET_USD,
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
  const cyber = resolveJcodeConfig(env, 'Cyber security vulnerability audit', options);
  const interactive = resolveJcodeConfig(env, '', options);
  const childEnv = buildChildEnv(interactive, env);
  const report = {
    schema: 'jcode-yolo-doctor/v4',
    status: interactive.hasJcodeBin ? 'READY' : 'JCODE_BIN_MISSING',
    activeIntelligentDefault: `${interactive.provider} / ${interactive.model}`,
    activeReason: interactive.reason,
    solPinned: interactive.model === 'gpt-5.6-sol',
    inheritedOpenaiQuarantined: Boolean(interactive.inheritedDefaultQuarantined),
    childDefaultProvider: childEnv.JCODE_DEFAULT_PROVIDER,
    childModel: childEnv.JCODE_MODEL,
    cyberRoute: `${cyber.provider}/${cyber.model}`,
    keys: {
      zai: Boolean(interactive.zaiKey),
      openrouter: Boolean(interactive.openrouterKey),
    },
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    pacingStatus: interactive.budgetPacing?.pacingStatus || 'GREEN',
    availableRoutes: Object.keys(ROUTES).map((k) => ({
      id: ROUTES[k].id,
      model: `${ROUTES[k].provider}/${ROUTES[k].model}`,
      description: ROUTES[k].description,
    })),
    binary: interactive.jcodeBin,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n jcode-yolo Intelligent Multi-Model Router: ${report.status}`);
    console.log(`   Interactive default: ${report.activeIntelligentDefault} (${report.activeReason})`);
    console.log(`   Sol pinned:          ${report.solPinned ? 'YES — BUG' : 'NO'}`);
    console.log(`   Inherited OpenAI:    ${report.inheritedOpenaiQuarantined ? 'quarantined' : 'absent'}`);
    console.log(`   Child env:           ${report.childDefaultProvider}/${report.childModel}`);
    console.log(`   Budget ceiling:      $${report.monthlyBudgetUsd.toFixed(2)}/mo [${report.pacingStatus}]`);
    console.log(`   Credentials:         Z.ai=${report.keys.zai ? 'ACTIVE' : 'NONE'}, OpenRouter=${report.keys.openrouter ? 'ACTIVE' : 'NONE'}`);
    console.log('   Available models:');
    report.availableRoutes.forEach((r) => console.log(`     • ${r.model} (${r.description})`));
    console.log('');
  }
  return { exitCode: interactive.hasJcodeBin && !report.solPinned ? 0 : 1, report };
}

function main() {
  const args = process.argv.slice(2);
  const heal = healJcodeConfigToml();
  if (heal.healed) {
    console.error(`[jcode-yolo] Healed ${JCODE_CONFIG_PATH}: ${heal.reason}`);
  }
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

  let userModel = null;
  let userProvider = null;
  const filteredArgs = [];
  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === '-m' || args[i] === '--model') && args[i + 1]) {
      userModel = args[i + 1];
      i += 1;
    } else if ((args[i] === '-p' || args[i] === '--provider') && args[i + 1]) {
      userProvider = args[i + 1];
      i += 1;
    } else {
      filteredArgs.push(args[i]);
    }
  }

  if (userModel) process.env.JCODE_ROUTE_MODEL = userModel;
  if (userProvider) process.env.JCODE_ROUTE_PROVIDER = userProvider;

  const preview = buildLaunch({ provider: 'ollama', model: 'qwen3.5:9b-hermes-32k' }, filteredArgs);
  const prompt = preview.prompt;
  let config;
  try {
    config = resolveJcodeConfig(process.env, prompt);
  } catch (error) {
    console.error(`[jcode-yolo] BLOCKED: ${error.message}`);
    process.exit(78);
  }
  if (!config.hasJcodeBin) {
    console.error(`[jcode-yolo] JCode binary not found at ${config.jcodeBin}`);
    process.exit(127);
  }

  const launch = buildLaunch(config, filteredArgs);
  const childEnv = buildChildEnv(config, process.env);
  const receipt = makeReceipt(config, launch.prompt, {
    childArgs: launch.childArgs,
    mode: launch.mode,
    status: 'selected',
  });
  writeReceiptSet(receipt);
  console.error(`[jcode-yolo] Intelligent Route: ${config.provider}/${config.model} (${config.reason}) mode=${launch.mode} [Budget: $${MONTHLY_BUDGET_USD.toFixed(2)}/mo]`);

  const child = spawn(config.jcodeBin, launch.childArgs, { stdio: 'inherit', env: childEnv });
  child.on('error', (error) => {
    writeReceiptSet({ ...receipt, status: 'spawn_error', errorCode: error.code || 'UNKNOWN' });
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    const exitCode = Number.isInteger(code) ? code : 1;
    writeReceiptSet({
      ...receipt,
      status: exitCode === 0 ? 'completed' : 'failed',
      exitCode,
      signal: signal || null,
    });
    process.exit(exitCode);
  });
}

if (require.main === module) main();

module.exports = {
  ADMIN_COMMANDS,
  MONTHLY_BUDGET_USD,
  ROUTES,
  buildChildArgs,
  buildChildEnv,
  buildLaunch,
  classifyPrompt,
  healJcodeConfigToml,
  makeReceipt,
  resolveJcodeConfig,
  resolveJcodeRouting: resolveJcodeConfig,
  runDoctor,
  selectRoute,
  writeReceipt,
  writeReceiptSet,
};
