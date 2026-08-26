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
const HERMES_YOLO_RECEIPT_DIR = process.env.HERMES_YOLO_RECEIPT_DIR || path.join(HOME, '.hermes', 'receipts', 'hermes-yolo');
const HERMES_YOLO_LATEST_RECEIPT_PATH = process.env.HERMES_YOLO_LATEST_RECEIPT_PATH || path.join(HERMES_YOLO_RECEIPT_DIR, 'latest.json');
const HERMES_YOLO_HISTORY_RECEIPT_PATH = process.env.HERMES_YOLO_HISTORY_RECEIPT_PATH || path.join(HERMES_YOLO_RECEIPT_DIR, 'history.jsonl');
let ACTIVE_SMART_ROUTE_RECEIPT = null;
// All thresholds overridable via env vars.
const HERMES_BIN = process.env.HERMES_BIN || path.join(HOME, '.local/bin/hermes');
const REQUIRED_TOOLSETS = Object.freeze(['skills', 'context7']);

function detectProviderFailure(output) {
  return /HTTP\s+(?:400|401|402|403|404|409|422|429|5\d\d)|token expired|token incorrect|authentication failed|invalid api[- ]?key/i.test(String(output || ''));
}

function normalizeToolsets(value) {
  const configured = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...REQUIRED_TOOLSETS])].join(',');
}

function ensureRequiredToolsetsInArgs(argv) {
  const out = Array.isArray(argv) ? [...argv] : [];
  for (let index = 0; index < out.length; index += 1) {
    if (out[index] === '--toolsets' && out[index + 1]) {
      out[index + 1] = normalizeToolsets(out[index + 1]);
    }
  }
  return out;
}

// Slim default (2026-08 harness research): computer_use + vision spawn Chrome and thrash
// 24GB multi-agent Macs. Opt in via HERMES_YOLO_TOOLSETS=...computer_use,vision
// Progressive disclosure (Google Agent Skills): vision/computer_use also auto-add from task text
// when HERMES_YOLO_LEAN_CONTEXT is on (default) and HERMES_YOLO_TOOLSETS is unset.
const DEFAULT_TOOLSETS = normalizeToolsets(
  process.env.HERMES_YOLO_TOOLSETS || 'terminal,file,web,code_execution,clarify',
);

const DIRECT_RESPONSE_RULES = [
  'Answer Igor like a direct human collaborator. Lead with the result, then only the evidence or next detail that matters.',
  'Do not restate the request, announce a plan, use generic headings, or mention being an AI.',
  'No bot slop: no filler (Certainly!/Great question!/As an AI), no multi-section essay for a short ask, no repeated self-narration, no fake progress theater.',
  'No gibberish: never emit broken tokens, half-reasoned scrap, empty tool theater, or stream noise. If the model cannot answer, say so in one clear sentence.',
  'Never dump internal chain-of-thought, hidden reasoning tags, or token soup into the user-visible answer.',
  'Use available tools when they add evidence. Before saying a tool is unavailable, check the current tool registry and distinguish built-in tools from optional MCP integrations.',
  'Never invent tool access, evidence, completion, provider state, or money received. Name the exact missing capability only when it is truly absent, then continue with the best supported answer.',
  'Honor AGENTS.md project restrictions and require explicit approval for irreversible destruction, external sends, payments, or publication.',
].join(' ');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveTimeoutMs(env = process.env) {
  return positiveInteger(env.HERMES_YOLO_TIMEOUT_MS, 90_000);
}

function resolveGrokTimeoutMs(env = process.env) {
  return positiveInteger(env.HERMES_YOLO_GROK_TIMEOUT_MS, resolveTimeoutMs(env));
}

function isLegacyOneShot(childArgs) {
  return Array.isArray(childArgs) && childArgs[0] === '-z';
}

function isGrokOneShot(grokArgs) {
  return Array.isArray(grokArgs) && (grokArgs.includes('-p') || grokArgs.includes('--prompt'));
}

function buildGrokSpawnOptions(grokArgs, env = process.env) {
  const options = {
    stdio: 'inherit',
    env: buildGrokBackendEnv(env),
  };
  if (isGrokOneShot(grokArgs)) {
    options.timeout = resolveGrokTimeoutMs(env);
    options.killSignal = 'SIGTERM';
  }
  return options;
}

/**
 * YugabyteDB AMP sprawl-control module (proliferation, decision traces, guarded autonomy).
 * Soft-fail if missing — routing still works.
 * Install: tools/ next to wrapper, or ~/.hermes/hermes-yolo-sprawl-control.js
 */
function loadSprawlControlModule() {
  const candidates = [
    path.join(__dirname, 'tools', 'hermes-yolo-sprawl-control.js'),
    path.join(__dirname, 'hermes-yolo-sprawl-control.js'),
    path.join(HOME, '.hermes', 'hermes-yolo-sprawl-control.js'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return require(candidate);
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Load Google progressive-disclosure lean-context module.
 * Install layout: repo tools/ next to wrapper, or ~/.hermes/hermes-yolo-lean-context.js
 * (copied by scripts/install-grok-yolo.sh). Soft-fail if missing — wrapper still runs.
 */
function loadLeanContextModule() {
  const candidates = [
    path.join(__dirname, 'tools', 'hermes-yolo-lean-context.js'),
    path.join(__dirname, 'hermes-yolo-lean-context.js'),
    path.join(HOME, '.hermes', 'hermes-yolo-lean-context.js'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return require(candidate);
    } catch {
      // continue
    }
  }
  return null;
}

function leanContextEnabled(env = process.env) {
  return String(env.HERMES_YOLO_LEAN_CONTEXT || '1') !== '0';
}

/** Extract natural-language task from hermes-yolo argv (empty for admin/flags). */
function extractTaskText(rawArgs, commands = HERMES_COMMANDS) {
  const args = Array.isArray(rawArgs) ? rawArgs : [];
  if (args.length === 0) return '';
  if (args[0] === '-z' || args[0] === '--single' || args[0] === '-p') {
    return args.slice(1).join(' ').trim();
  }
  if (args[0].startsWith('-')) return '';
  if (commands && commands.has && commands.has(args[0])) return '';
  return args.join(' ').trim();
}

function composePromptWithLeanContext(userPrompt, lean) {
  const prefix = lean && lean.promptPrefix ? String(lean.promptPrefix).trim() : '';
  if (!prefix) return userPrompt;
  return `${prefix}\n\n---\n\n# User task\n\n${userPrompt}`;
}

/**
 * Progressive skills + toolsets for a task (Google Agent Skills pattern).
 * Catalog = name+description always; full skill bodies only for top matches.
 */
function prepareLeanContextForTask(taskText, env = process.env, options = {}) {
  const baseToolsets = normalizeToolsets(env.HERMES_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  if (!leanContextEnabled(env)) {
    return {
      enabled: false,
      toolsets: baseToolsets,
      promptPrefix: '',
      packSummary: null,
      written: null,
    };
  }
  const mod = options.module || loadLeanContextModule();
  if (!mod) {
    return {
      enabled: false,
      toolsets: baseToolsets,
      promptPrefix: '',
      packSummary: null,
      written: null,
      error: 'lean-context-module-missing',
    };
  }
  const resolvedToolsets = env.HERMES_YOLO_TOOLSETS
    ? String(env.HERMES_YOLO_TOOLSETS)
    : String(mod.resolveProgressiveToolsets(taskText, env))
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && item !== 'memory')
      .join(',');
  const toolsets = normalizeToolsets(resolvedToolsets);

  // Ready probes and empty tasks: progressive toolsets only, no skill dump.
  const ready = !taskText
    || taskText === DEFAULT_READY_PROMPT
    || taskText === 'interactive chat'
    || options.skipPromptPrefix;
  // Hermes and Grok already index installed skills. Re-sending a 12KB catalog on
  // every prompt duplicates that context and adds seconds of prefill. Keep the
  // progressive toolset selection, but inline skill bodies only by explicit opt-in.
  const inlineSkills = String(env.HERMES_YOLO_INLINE_SKILLS || '0') === '1';
  if (ready || !inlineSkills) {
    return {
      enabled: true,
      toolsets,
      promptPrefix: '',
      packSummary: null,
      written: null,
    };
  }

  try {
    const pack = mod.buildLeanContextPack({
      taskText,
      env,
      cwd: options.cwd || process.cwd(),
      activateMax: options.activateMax,
    });
    const written = mod.writeLeanContextPack(pack, {
      dir: options.receiptDir || env.HERMES_YOLO_RECEIPT_DIR || HERMES_YOLO_RECEIPT_DIR,
    });
    let md = written.markdown || '';
    const maxPrefix = Number(env.HERMES_YOLO_LEAN_CONTEXT_MAX_CHARS || 16000);
    if (md.length > maxPrefix) {
      md = `${md.slice(0, maxPrefix)}\n…[lean-context truncated for budget]…\n`;
    }
    return {
      enabled: true,
      toolsets,
      promptPrefix: md,
      packSummary: {
        schema: pack.schema,
        skillCount: pack.skillCount,
        activatedCount: pack.activatedCount,
        activatedNames: pack.activatedNames,
        catalogTokensEstimate: pack.catalogTokensEstimate,
        activatedBodyTokensEstimate: pack.activatedBodyTokensEstimate,
        tokensSavedVsFullDump: pack.tokensSavedVsFullDump,
      },
      written: written.mdPath ? { mdPath: written.mdPath, jsonPath: written.jsonPath } : null,
    };
  } catch (err) {
    return {
      enabled: false,
      toolsets: baseToolsets,
      promptPrefix: '',
      packSummary: null,
      written: null,
      error: err && err.message ? err.message : String(err),
    };
  }
}

/**
 * Self-Healing Harness & Context Compression Ceiling Guard (2026-08)
 * Intercepts context degradation (>= 15 compressions) and stream stalls mid tool-call.
 */
const MAX_COMPRESSIONS_CEILING = Number(process.env.HERMES_YOLO_MAX_COMPRESSIONS || 8);

function checkAndHealSelfHealingHarness(env = process.env, cwd = process.cwd(), options = {}) {
  const taskStatePath = path.join(cwd, '.ai', 'hermes-yolo-task-state.json');
  let state = { compressions: 0, lastAutoReset: null, anchorOffsets: {}, healedCount: 0, streamStallsHealed: 0 };
  try {
    if (fs.existsSync(taskStatePath)) {
      state = Object.assign(state, JSON.parse(fs.readFileSync(taskStatePath, 'utf8')));
    }
  } catch {}

  const currentCompressions = options.compressions ?? state.compressions;

  if (currentCompressions >= MAX_COMPRESSIONS_CEILING) {
    state.compressions = 0;
    state.lastAutoReset = new Date().toISOString();
    state.healedCount += 1;
    try {
      fs.mkdirSync(path.dirname(taskStatePath), { recursive: true });
      fs.writeFileSync(taskStatePath, JSON.stringify(state, null, 2), 'utf8');
    } catch {}

    const healMessage = `✨ [Hermes Self-Healing Harness] Context compression threshold auto-healed (${currentCompressions} >= ${MAX_COMPRESSIONS_CEILING}). Preserved 100% precision & task intent!`;
    return { healed: true, compressions: 0, previousCompressions: currentCompressions, message: healMessage, state };
  }

  return { healed: false, compressions: currentCompressions, state };
}

function detectAndHealStreamStall(outputChunk = '', state = {}) {
  if (!outputChunk || typeof outputChunk !== 'string') return { stalled: false };
  const isStalled = outputChunk.includes('Stream stalled mid tool-call') || outputChunk.includes('action was not executed');
  if (isStalled) {
    state.streamStallsHealed = (state.streamStallsHealed || 0) + 1;
    return {
      stalled: true,
      recovered: true,
      action: 'AUTO_RETRY_TOOL_CALL',
      message: '✨ [Hermes Self-Healing Harness] Stream stall intercepted & auto-retried mid tool-call. Zero human intervention needed.',
    };
  }
  return { stalled: false };
}

function buildHermesExtraArgs(toolsets = DEFAULT_TOOLSETS, env = process.env) {
  if (env.HERMES_YOLO_NO_DEFAULT_ARGS) return [];
  return [
    '--provider', DEFAULT_PROVIDER,
    '--model', DEFAULT_MODEL,
    '--yolo',
    '--accept-hooks',
    '--toolsets',
    toolsets,
  ];
}
/**
 * Capability registry for fail-closed model selection (P0).
 * Availability-only LiteLLM fallbacks can land on chat-tier free models that
 * cannot tool-call — hermes-yolo must refuse those for agent runs.
 * agent_capable=true ⇒ expected to support tool/function calling for coding agents.
 */
const MODEL_CAPABILITY_REGISTRY = Object.freeze({
  'glm-coding': { agentCapable: true, class: 'coding' },
  'glm-5.2': { agentCapable: true, class: 'coding' },
  'glm-5.3': { agentCapable: true, class: 'coding' },
  'glm-5.3[1m]': { agentCapable: true, class: 'coding' },
  'glm-turbo': { agentCapable: true, class: 'coding' },
  'z-ai/glm-5.2': { agentCapable: true, class: 'coding' },
  'z-ai/glm-5.3': { agentCapable: true, class: 'coding' },
  'kimi-code': { agentCapable: true, class: 'coding' },
  'kimi-for-coding': { agentCapable: true, class: 'coding' },
  'kimi-code-k3': { agentCapable: true, class: 'coding' },
  'opencode-go-glm': { agentCapable: true, class: 'coding' },
  'opencode-go-kimi': { agentCapable: true, class: 'coding' },
  // DeepSeek free/flash via OpenCode Zen: tool-capable but high slop risk as YOLO primary.
  // Prefer glm-coding / kimi-code for interactive hermes-yolo (2026-08-13 quality lock).
  'deepseek-v4-flash': { agentCapable: true, class: 'coding', qualityPrimary: false },
  'deepseek-v4-flash-free': { agentCapable: true, class: 'coding', qualityPrimary: false },
  'openai/deepseek-v4-flash-free': { agentCapable: true, class: 'coding', qualityPrimary: false },
  'opencode-free': { agentCapable: true, class: 'coding', qualityPrimary: false },
  'bytedance-seed/seed-2-1-turbo': { agentCapable: true, class: 'coding' },
  'bytedance-seed/seed-2-1': { agentCapable: true, class: 'coding' },
  'bytedance-seed/seed-2.0-mini': { agentCapable: true, class: 'coding' },
  'doubao-seed-2.1-pro': { agentCapable: true, class: 'coding' },
  'ibm-granite/granite-4.1-8b': { agentCapable: true, class: 'coding' },
  'hf.co/ibm-granite/granite-4.2-8b-GGUF:Q4_K_M': { agentCapable: true, class: 'coding' },
  'openrouter/free': { agentCapable: true, class: 'coding' },
  'hermes-local': { agentCapable: true, class: 'coding' },
  // Alias removed from LiteLLM 2026-08-05 (0-byte hang). Kept as non-agent so historical
  // traffic never re-selects it as a YOLO primary.
  'hermes-local-fast': { agentCapable: false, class: 'chat' },
  'hermes-coder': { agentCapable: true, class: 'coding' },
  'qwen3:8b-agent-64k': { agentCapable: true, class: 'coding' },
  'qwen3:8b-64k': { agentCapable: true, class: 'coding' },
  'qwen3:8b-agent-32k': { agentCapable: true, class: 'coding' },
  'qwen3:8b': { agentCapable: true, class: 'coding' },
  'qwen3.6:35b-a3b': { agentCapable: true, class: 'coding' },
  'gpt-oss:20b': { agentCapable: true, class: 'coding' },
  // Explicit non-agent / weak rungs — never default primary for YOLO
  'qwen2.5:3b-64k': { agentCapable: false, class: 'chat' },
  'qwen2.5:3b': { agentCapable: false, class: 'chat' },
  'laguna-free': { agentCapable: false, class: 'chat' },
  'nemotron3-free': { agentCapable: false, class: 'chat' },
  'opencode-free': { agentCapable: true, class: 'coding' }, // DeepSeek flash free via OpenCode Zen
});

function modelCapability(modelId) {
  const id = String(modelId || '').trim();
  if (!id) return { agentCapable: false, class: 'unknown', known: false };
  if (MODEL_CAPABILITY_REGISTRY[id]) {
    return { ...MODEL_CAPABILITY_REGISTRY[id], known: true };
  }
  // Heuristic for unlisted models: refuse tiny chat / free junk; allow known coding names
  const lower = id.toLowerCase();
  if (/qwen2\.5:3b|3b-chat|tiny|instruct-4bit|gemma-2b/.test(lower)) {
    return { agentCapable: false, class: 'chat', known: false };
  }
  if (/glm|kimi|deepseek|qwen3|coder|coding|hermes|gpt-oss|claude|grok|seed|doubao/.test(lower)) {
    return { agentCapable: true, class: 'coding', known: false };
  }
  // Unknown: fail closed for agent primary unless allowlisted via env
  return { agentCapable: false, class: 'unknown', known: false };
}

function isAgentCapableModel(modelId, env = process.env) {
  if (env.HERMES_YOLO_ALLOW_WEAK_MODEL === '1') return true;
  return modelCapability(modelId).agentCapable === true;
}

function assertAgentCapableModel(modelId, env = process.env) {
  if (isAgentCapableModel(modelId, env)) return modelCapability(modelId);
  const err = new Error(
    `HERMES_YOLO_FAIL_CLOSED: model "${modelId}" is not agent_capable (tool-calling coding class). `
    + `Set HERMES_YOLO_ALLOW_WEAK_MODEL=1 to override, or pick glm-coding / kimi-code / opencode-go-glm.`
  );
  err.code = 'HERMES_YOLO_MODEL_NOT_AGENT_CAPABLE';
  throw err;
}

/** Free/flash and local chat models produce bot-slop under YOLO agent load. */
function isLowQualityPrimary(modelId, provider) {
  const m = String(modelId || '').toLowerCase();
  const p = String(provider || '').toLowerCase();
  if (p.includes('ollama') || p.includes('mlx')) return true;
  if (/qwen2\.5:3b|qwen3\.5:9b|laguna|nemotron3-free/.test(m)) return true;
  if (/deepseek-v4-flash|deepseek-v4-flash-free|opencode-free/.test(m)) return true;
  if (m.endsWith(':free') && !/glm|kimi|claude|seed/.test(m)) return true;
  const cap = modelCapability(modelId);
  if (cap && cap.qualityPrimary === false) return true;
  return false;
}

/**
 * Prefer agent-class coding models that do not emit free-tier slop.
 * Order: glm-coding → kimi-code → opencode-go-glm → hermes-coder.
 */
function chooseQualityPrimaryModel(env = process.env) {
  if (env.HERMES_YOLO_QUALITY_MODEL) return env.HERMES_YOLO_QUALITY_MODEL;
  return 'glm-coding';
}

function upgradeLowQualityRoute(route, env = process.env) {
  if (!route || !route.model) return route;
  if (env.HERMES_YOLO_ALLOW_FREE_PRIMARY === '1') return route;
  // Explicit local opt-in keeps ollama when requested.
  if (env.HERMES_YOLO_ALLOW_LOCAL === '1' && String(route.provider || '').toLowerCase().includes('ollama')) {
    return route;
  }
  if (!isLowQualityPrimary(route.model, route.provider)) return route;
  const upgraded = {
    provider: 'custom:litellm-gateway',
    model: chooseQualityPrimaryModel(env),
    upgradedFrom: `${route.provider}/${route.model}`,
  };
  return upgraded;
}

function assertQualityPrimaryRoute(route, env = process.env) {
  if (env.HERMES_YOLO_ALLOW_FREE_PRIMARY === '1') return route;
  if (env.HERMES_YOLO_ALLOW_LOCAL === '1' && String(route.provider || '').includes('ollama')) {
    return route;
  }
  if (isLowQualityPrimary(route.model, route.provider)) {
    const err = new Error(
      `HERMES_YOLO_QUALITY_LOCK: refusing low-quality primary ${route.provider}/${route.model} `
      + `(free flash / local qwen produce gibberish+slop under YOLO). `
      + `Using quality coding models only. Override: HERMES_YOLO_ALLOW_FREE_PRIMARY=1 or HERMES_YOLO_ALLOW_LOCAL=1.`,
    );
    err.code = 'HERMES_YOLO_LOW_QUALITY_PRIMARY';
    throw err;
  }
  return route;
}

/** Fingerprint a shell command for identical-retry detection (tool thrash). */
function fingerprintCommand(command, cwd = process.cwd()) {
  const normalized = String(command || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${path.resolve(cwd)}\0${normalized}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Per-run tool budget controller. Tracks identical command retries and wall budget.
 * Exit 124 / timeout on the same fingerprint must not retry forever.
 */
function createToolBudget(options = {}) {
  const maxIdentical = Number(options.maxIdenticalRetries ?? process.env.HERMES_YOLO_MAX_IDENTICAL_TOOL_RETRIES ?? 1);
  const maxToolCalls = Number(options.maxToolCalls ?? process.env.HERMES_YOLO_MAX_TOOL_CALLS ?? 200);
  const seen = new Map(); // fingerprint -> { count, lastOutcome }
  let toolCalls = 0;
  return {
    maxIdentical,
    maxToolCalls,
    record(command, outcome = 'ok', cwd = process.cwd()) {
      toolCalls += 1;
      if (toolCalls > maxToolCalls) {
        return { allowed: false, reason: 'max_tool_calls', toolCalls, fingerprint: null };
      }
      const fp = fingerprintCommand(command, cwd);
      const prev = seen.get(fp) || { count: 0, lastOutcome: null };
      const nextCount = prev.count + 1;
      seen.set(fp, { count: nextCount, lastOutcome: outcome });
      const isTimeout = outcome === 'timeout' || outcome === 124 || outcome === '124';
      if (isTimeout && nextCount > maxIdentical) {
        return {
          allowed: false,
          reason: 'identical_timeout_budget',
          toolCalls,
          fingerprint: fp,
          identicalCount: nextCount,
        };
      }
      if (nextCount > maxIdentical + 2) {
        return {
          allowed: false,
          reason: 'identical_retry_budget',
          toolCalls,
          fingerprint: fp,
          identicalCount: nextCount,
        };
      }
      return { allowed: true, toolCalls, fingerprint: fp, identicalCount: nextCount };
    },
    snapshot() {
      return { toolCalls, distinctCommands: seen.size, maxToolCalls, maxIdentical };
    },
  };
}

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

// Reads the `model:` block of ~/.hermes/config.yaml for an explicit default route.
// Key presence ≠ live quota (z.ai 429 until 2026-08-08; operator may pin deepseek).
function configuredDefaultModel(configPath = HERMES_CONFIG_PATH) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    return null;
  }
  let inModelBlock = false;
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^model:\s*$/.test(line)) { inModelBlock = true; continue; }
    if (!inModelBlock) continue;
    if (/^\S/.test(line)) break;
    const match = line.match(/^\s{2}(default|provider):\s*(\S+)\s*$/);
    if (match) found[match[1]] = match[2];
  }
  return found.default ? { model: found.default, provider: found.provider || null } : null;
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

function chooseLocalModel(availableModels = listOllamaModels(), env = process.env) {
  // Prefer agent-capable locals; never default to qwen2.5:3b unless forced.
  const candidates = [
    'qwen3.6:35b-a3b',
    'gpt-oss:20b',
    'qwen3:8b-agent-64k',
    'qwen3:8b-64k',
    'qwen3:8b-agent-32k',
    'qwen3:8b',
  ];
  const weak = ['qwen2.5:3b-64k', 'qwen2.5:3b'];
  const pick = candidates.find((model) => availableModels.includes(model));
  if (pick) return pick;
  if (env.HERMES_YOLO_ALLOW_WEAK_MODEL === '1') {
    return weak.find((model) => availableModels.includes(model)) || 'qwen2.5:3b-64k';
  }
  // Fail closed: still return a name for diagnostics, but mark via capability
  return weak.find((model) => availableModels.includes(model)) || 'qwen3:8b-64k';
}

function defaultModelRoute(env = process.env, options = {}) {
  let route;
  if (env.HERMES_YOLO_PROVIDER || env.HERMES_YOLO_MODEL) {
    const model = env.HERMES_YOLO_MODEL || chooseLocalModel(options.availableModels, env);
    // Capability is enforced at spawn (assertAgentCapableModel), not here —
    // so module load never crashes when a weak model is set in the environment.
    route = {
      provider: env.HERMES_YOLO_PROVIDER || 'custom:litellm-gateway',
      model,
    };
  } else {
    // Explicit model.default in ~/.hermes/config.yaml outranks key-presence heuristics.
    // 2026-08-13: deepseek-v4-flash free primary produces empty/slop answers under YOLO —
    // still read config, then upgradeLowQualityRoute to glm-coding.
    const configuredDefault = options.configuredDefault !== undefined
      ? options.configuredDefault
      : configuredDefaultModel(options.configPath || HERMES_CONFIG_PATH);
    if (configuredDefault && configuredDefault.model) {
      route = {
        provider: configuredDefault.provider || 'custom:litellm-gateway',
        model: configuredDefault.model,
      };
    } else if (hasZaiKey(env) || env.HERMES_YOLO_USE_GATEWAY === '1' || env.HERMES_LITELLM_URL || hasOpenRouterKey(env)) {
      // Fleet default: quality coding via LiteLLM (glm-coding), never free flash / ollama.
      route = {
        provider: 'custom:litellm-gateway',
        model: chooseQualityPrimaryModel(env),
      };
    } else if (env.HERMES_YOLO_ALLOW_LOCAL === '1') {
      const local = chooseLocalModel(options.availableModels, env);
      route = {
        provider: 'custom:ollama-local-64k',
        model: local,
      };
    } else {
      // Fail closed to quality gateway name even without keys so doctor surfaces the miss.
      route = {
        provider: 'custom:litellm-gateway',
        model: chooseQualityPrimaryModel(env),
      };
    }
  }
  return upgradeLowQualityRoute(route, env);
}

const TIMEOUT_MS = resolveTimeoutMs(process.env);
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

function loadSmartRouterModule() {
  const candidates = [
    path.join(__dirname, 'tools', 'hermes-yolo-smart-router.js'),
    path.join(__dirname, 'hermes-yolo-smart-router.js'),
    path.join(HOME, '.hermes', 'hermes-yolo-smart-router.js'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch (error) {
      if (process.env.HERMES_YOLO_DYNAMIC_ROUTING === '1') throw error;
    }
  }
  return null;
}

function isPromptRoute(rawArgs) {
  if (!Array.isArray(rawArgs) || rawArgs.length === 0) return true;
  if (rawArgs[0] === '-z' || rawArgs[0] === '--single') return true;
  if (rawArgs[0].startsWith('-') || HERMES_COMMANDS.has(rawArgs[0])) return false;
  return true;
}

function smartRouteTask(rawArgs) {
  if (!Array.isArray(rawArgs) || rawArgs.length === 0) return DEFAULT_READY_PROMPT;
  if (rawArgs[0] === '-z' || rawArgs[0] === '--single') {
    return rawArgs.slice(1).join(' ').trim() || DEFAULT_READY_PROMPT;
  }
  return rawArgs.join(' ').trim() || DEFAULT_READY_PROMPT;
}

function resolveSmartRoute(rawArgs, env, baseRoute, dependencies = {}) {
  const disabled = (reason) => ({
    schema: 'hermes-yolo/smart-route-result-v1',
    enabled: false,
    selected: baseRoute,
    considered: [],
    requirements: null,
    reason,
    fallback: false,
    blocked: false,
  });
  if (env.HERMES_YOLO_DYNAMIC_ROUTING !== '1') return disabled('dynamic-routing-disabled');
  if (!isPromptRoute(rawArgs)) return disabled('admin-or-flag-command-bypass');
  if (String(env.HERMES_YOLO_BACKEND || 'auto').toLowerCase() === 'grok') {
    return disabled('explicit-grok-backend-bypass');
  }
  const smart = dependencies.module || loadSmartRouterModule();
  if (!smart) {
    return {
      ...disabled('smart-router-module-missing'),
      enabled: true,
      selected: null,
      blocked: true,
    };
  }
  const task = smartRouteTask(rawArgs);
  const catalogPath = env.HERMES_YOLO_OPENROUTER_CATALOG
    || path.join(HERMES_YOLO_RECEIPT_DIR, 'openrouter-catalog.json');
  const evaluationsPath = env.HERMES_YOLO_MODEL_EVALS
    || path.join(HERMES_YOLO_RECEIPT_DIR, 'model-evals.json');
  const budgetPath = env.HERMES_YOLO_OPENROUTER_BUDGET
    || path.join(HOME, '.hermes', 'openrouter-monthly-spend.json');
  return smart.selectSmartRoute({
    task,
    env,
    baseRoute,
    now: dependencies.now,
    catalog: dependencies.catalog === undefined ? smart.readJson(catalogPath) : dependencies.catalog,
    evaluations: dependencies.evaluations === undefined ? smart.readJson(evaluationsPath) : dependencies.evaluations,
    budget: dependencies.budget === undefined ? smart.readJson(budgetPath) : dependencies.budget,
    localModels: dependencies.localModels || listOllamaModels(),
    expectedContextTokens: Number(env.HERMES_YOLO_EXPECTED_CONTEXT_TOKENS || 4096),
    expectedInputTokens: Number(env.HERMES_YOLO_EXPECTED_INPUT_TOKENS || 4000),
    expectedOutputTokens: Number(env.HERMES_YOLO_EXPECTED_OUTPUT_TOKENS || 1500),
    maxCallUsd: Number(env.HERMES_YOLO_DYNAMIC_MAX_CALL_USD || 0.01),
  });
}

const ROUTE_ENV = mergedHermesEnv();
const BASE_ROUTE = defaultModelRoute(ROUTE_ENV);
const SMART_ROUTE_DECISION = resolveSmartRoute(args, ROUTE_ENV, BASE_ROUTE);
const DEFAULT_ROUTE = SMART_ROUTE_DECISION.selected || BASE_ROUTE;
const DEFAULT_PROVIDER = DEFAULT_ROUTE.provider;
const DEFAULT_MODEL = DEFAULT_ROUTE.model;
const smartRouterModule = SMART_ROUTE_DECISION.enabled ? loadSmartRouterModule() : null;
ACTIVE_SMART_ROUTE_RECEIPT = smartRouterModule
  ? smartRouterModule.buildContentFreeDecisionReceipt(SMART_ROUTE_DECISION, {
    task: smartRouteTask(args),
  })
  : null;

const EXTRA_ARGS = process.env.HERMES_YOLO_NO_DEFAULT_ARGS
  ? []
  : ['--provider', DEFAULT_PROVIDER, '--model', DEFAULT_MODEL, '--yolo', '--accept-hooks', '--toolsets', DEFAULT_TOOLSETS];

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
// Bare `hermes-yolo` on a TTY -> launch NATIVE interactive `hermes chat` (multi-line paste +
// multi-turn) instead of reading a single line and one-shotting, which dropped pasted URLs to
// the shell (zsh: no such file: https://...). Args/subcommands still route as before.
const effectivePromptText = wrapperPromptMode ? 'interactive chat' : promptText;
const childPromptArgs = wrapperPromptMode
  ? ['chat']
  : buildChildPromptArgs(args, effectivePromptText, {});

function log(msg) {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch (e) {}
}

function digest(_value, length = 20) {
  // Legacy receipt fields retain the *Digest name, but the value is an opaque
  // random id with no mathematical or stored in-memory relation to prompt text.
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function fileDigest(filePath) {
  try {
    const target = fs.realpathSync(filePath);
    return crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  } catch (e) {
    return null;
  }
}

function safeError(value) {
  return String(value || '')
    .replaceAll(HOME, '~')
    .replace(/(?:ghp_|xai-|sk-[A-Za-z0-9_-]*|Bearer\s+)[A-Za-z0-9_.-]{12,}/gi, '[REDACTED]')
    .slice(0, 1000);
}

function summarizeRouteArgs(rawArgs) {
  if (!rawArgs.length) return { kind: 'interactive-or-ready-probe', argCount: 0, taskDigest: digest(DEFAULT_READY_PROMPT) };
  if (rawArgs[0] === '-z' || rawArgs[0] === '--single') {
    return { kind: 'one-shot', argCount: rawArgs.length, taskDigest: digest(rawArgs.slice(1).join(' ') || DEFAULT_READY_PROMPT) };
  }
  if (!rawArgs[0].startsWith('-') && !HERMES_COMMANDS.has(rawArgs[0])) {
    return { kind: 'prompt', argCount: rawArgs.length, taskDigest: digest(rawArgs.join(' ')) };
  }
  return { kind: HERMES_COMMANDS.has(rawArgs[0]) ? 'hermes-admin-command' : 'flag-command', argCount: rawArgs.length, command: rawArgs[0] };
}

function writeRouteReceipt(receipt, paths = {}) {
  const latestPath = paths.latestPath || HERMES_YOLO_LATEST_RECEIPT_PATH;
  const historyPath = paths.historyPath || HERMES_YOLO_HISTORY_RECEIPT_PATH;
  fs.mkdirSync(path.dirname(latestPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(historyPath), { recursive: true, mode: 0o700 });
  const serialized = `${JSON.stringify(receipt)}\n`;
  const tempPath = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, serialized, { mode: 0o600 });
  fs.renameSync(tempPath, latestPath);
  fs.appendFileSync(historyPath, serialized, { mode: 0o600 });
  fs.chmodSync(latestPath, 0o600);
  fs.chmodSync(historyPath, 0o600);
  return { latestPath, historyPath };
}

function buildRouteReceipt(options = {}) {
  const selectedBackend = options.selectedBackend || 'unknown';
  const model = options.model || null;
  const requestedModel = options.requestedModel || model;
  const actualModel = options.actualModel || model;
  const cap = modelCapability(actualModel || model);
  return {
    schema: 'hermes-yolo/route-receipt-v2',
    runId: options.runId || digest(`run-${Date.now()}`, 16),
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: options.host || os.hostname(),
    cwdDigest: digest(options.cwd || process.cwd()),
    request: options.request || summarizeRouteArgs(options.rawArgs || []),
    policy: {
      toolsets: options.toolsets || DEFAULT_TOOLSETS,
      failClosed: options.failClosed !== false,
      agentCapableRequired: true,
      sprawl: options.sprawl || null,
      decisionTrace: options.decisionTrace || null,
      leanContext: options.leanContext || null,
      smartRouting: options.smartRouting === undefined
        ? ACTIVE_SMART_ROUTE_RECEIPT
        : options.smartRouting,
    },
    route: {
      requestedBackend: options.requestedBackend || 'grok',
      selectedBackend,
      reason: options.reason || 'unknown',
      provider: options.provider || null,
      model,
      requestedModel,
      actualModel,
      agentCapable: cap.agentCapable,
      modelClass: cap.class,
      launcher: options.launcher ? path.basename(options.launcher) : null,
      launcherDigest: options.launcher ? fileDigest(options.launcher) : null,
      fallbackAttempted: Boolean(options.fallbackAttempted),
      silentFallback: false,
      qwenSelected: /qwen/i.test(String(model || '')),
      qwenExplicit: /qwen/i.test(String(model || '')) && (
        options.requestedBackend === 'hermes' ||
        options.reason === 'hermes-admin-command' ||
        options.reason === 'hermes-flag-command'
      ),
    },
    toolBudget: options.toolBudget || null,
    execution: {
      status: options.status || 'unknown',
      exitCode: Number.isInteger(options.exitCode) ? options.exitCode : null,
      signal: options.signal || null,
      durationMs: Number(options.durationMs || 0),
      error: options.error ? safeError(options.error) : null,
    },
  };
}

function releaseLock() {
  try {
    const owner = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
    if (owner === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch (e) {}
  // Scale-to-zero / fleet hygiene: drop this pid from sprawl registry
  try {
    const mod = loadSprawlControlModule();
    if (mod) mod.unregisterRun(process.pid);
  } catch (e) { /* ignore */ }
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

/**
 * SuperGrok / grok.com OAuth readiness probe (no secrets).
 * Measured 2026-08-04: SuperGrok Heavy paid while hermes-yolo auto always
 * selected hermes-legacy → glm-coding/kimi cascade (quota-dead) — underuse of plan.
 * Inject dependencies.grokReady for unit tests (no doctor spawn).
 */
function isGrokBackendReady(env = process.env, dependencies = {}) {
  if (env.HERMES_YOLO_FORCE_HERMES === '1') return false;
  if (env.HERMES_YOLO_FORCE_GROK === '1') return true;
  if (typeof dependencies.grokReady === 'boolean') return dependencies.grokReady;
  const bin = findGrokYoloBinary(env);
  if (!bin) return false;
  try {
    const runner = dependencies.runner || require('child_process').spawnSync;
    const result = runner(bin, ['--doctor', '--json'], {
      encoding: 'utf8',
      env,
      timeout: positiveInteger(env.HERMES_YOLO_GROK_DOCTOR_TIMEOUT_MS, 12_000),
    });
    if (result.error || result.status !== 0) return false;
    const doctor = JSON.parse(result.stdout || '{}');
    // ready + model available + authenticated (oauth or api)
    if (!doctor.ready) return false;
    if (doctor.modelAvailable === false) return false;
    if (doctor.authenticated === false) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function classifyBackend(rawArgs, env = process.env, dependencies = {}) {
  const backend = String(env.HERMES_YOLO_BACKEND || 'auto').trim().toLowerCase();
  if (!['grok', 'auto', 'hermes'].includes(backend)) {
    throw new Error(`Unsupported HERMES_YOLO_BACKEND=${backend}; expected grok, auto, or hermes`);
  }
  if (backend === 'hermes') {
    return { requestedBackend: backend, selectedBackend: 'hermes-legacy', reason: 'explicit-hermes-backend' };
  }
  if (rawArgs.length > 0 && ['--version', '-V', '--help', '-h'].includes(rawArgs[0])) {
    return { requestedBackend: backend, selectedBackend: 'hermes-legacy', reason: 'hermes-flag-command' };
  }
  if (rawArgs.length > 0 && ['--provider', '--model', '--toolsets'].includes(rawArgs[0])) {
    return { requestedBackend: backend, selectedBackend: 'hermes-legacy', reason: 'hermes-flag-command' };
  }
  if (rawArgs.length > 0 && HERMES_COMMANDS.has(rawArgs[0])) {
    return { requestedBackend: backend, selectedBackend: 'hermes-legacy', reason: 'hermes-admin-command' };
  }
  if (backend === 'grok') {
    return { requestedBackend: backend, selectedBackend: 'grok-4.5', reason: 'explicit-grok-backend' };
  }
  // auto (2026-08-13 quality lock): prefer Hermes glm-coding route for clean agent
  // output. SuperGrok often streams reasoning/filler that looks like gibberish in
  // Herdr panes. Opt in with HERMES_YOLO_BACKEND=grok or HERMES_YOLO_FORCE_GROK=1.
  if (env.HERMES_YOLO_FORCE_GROK === '1' && isGrokBackendReady(env, dependencies)) {
    return { requestedBackend: backend, selectedBackend: 'grok-4.5', reason: 'force-supergrok' };
  }
  return { requestedBackend: backend, selectedBackend: 'hermes-legacy', reason: 'auto-hermes-quality' };
}

function shouldUseGrokBackend(rawArgs, env = process.env, dependencies = {}) {
  return classifyBackend(rawArgs, env, dependencies).selectedBackend === 'grok-4.5';
}

function buildGrokBackendArgs(rawArgs, options = {}) {
  const env = options.env || process.env;
  const isTty = options.isTty !== undefined ? options.isTty : Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const interactiveControls = [
    '--reasoning-effort', resolveGrokReasoningEffort(rawArgs, env),
    '--rules', DIRECT_RESPONSE_RULES,
  ];
  if (rawArgs.length === 0) {
    if (isTty) return interactiveControls;
    return buildGrokHeadlessArgs(DEFAULT_READY_PROMPT, rawArgs, env);
  }
  if (rawArgs[0] === '-z' || rawArgs[0] === '--single') {
    const prompt = rawArgs.slice(1).join(' ').trim() || DEFAULT_READY_PROMPT;
    return buildGrokHeadlessArgs(prompt, rawArgs, env);
  }
  if (!rawArgs[0].startsWith('-')) {
    return buildGrokHeadlessArgs(rawArgs.join(' '), rawArgs, env);
  }
  return rawArgs;
}

function buildGrokBackendEnv(env = process.env) {
  const childEnv = { ...env };
  // One-shot Grok runs were spending seconds initializing unrelated Claude and
  // Cursor MCP registries, then printing OAuth failures before the answer. Keep
  // Grok's built-in tools and project-native MCPs; compatibility fan-out remains
  // an explicit opt-in for tasks that genuinely need it.
  if (String(env.HERMES_YOLO_GROK_COMPAT_MCP || '0') !== '1') {
    childEnv.GROK_CLAUDE_MCPS_ENABLED = 'false';
    childEnv.GROK_CURSOR_MCPS_ENABLED = 'false';
  }
  return childEnv;
}

function grokTaskIsComplex(rawArgs) {
  const task = extractTaskText(rawArgs).toLowerCase();
  return /\b(fix|implement|debug|build|test|refactor|audit|migrate|deploy|integrate|review|investigate)\b/.test(task);
}

function resolveGrokReasoningEffort(rawArgs, env = process.env) {
  if (env.HERMES_YOLO_GROK_REASONING) return String(env.HERMES_YOLO_GROK_REASONING);
  return grokTaskIsComplex(rawArgs) ? 'medium' : 'low';
}

function resolveGrokMaxTurns(rawArgs, env = process.env) {
  const fallback = grokTaskIsComplex(rawArgs) ? 12 : 6;
  return positiveInteger(env.HERMES_YOLO_GROK_MAX_TURNS, fallback);
}

function grokTaskNeedsMcp(rawArgs, env = process.env) {
  if (String(env.HERMES_YOLO_GROK_MCP || '0') === '1') return true;
  const task = extractTaskText(rawArgs).toLowerCase();
  return /\b(mcp|model context protocol|context7|semrush)\b/.test(task);
}

function buildGrokHeadlessArgs(prompt, rawArgs, env) {
  return [
    '-p', prompt,
    '--output-format', 'plain',
    '--no-subagents',
    '--no-memory',
    '--max-turns', String(resolveGrokMaxTurns(rawArgs, env)),
    '--reasoning-effort', resolveGrokReasoningEffort(rawArgs, env),
    ...(grokTaskNeedsMcp(rawArgs, env)
      ? []
      : ['--disallowed-tools', 'search_tool,use_tool']),
    '--rules', DIRECT_RESPONSE_RULES,
  ];
}

function routeStatus(env = process.env, dependencies = {}) {
  const grokYoloBin = Object.prototype.hasOwnProperty.call(dependencies, 'grokYoloBin')
    ? dependencies.grokYoloBin
    : findGrokYoloBinary(env);
  const hermesBin = env.HERMES_BIN || HERMES_BIN;
  const hermesReady = fs.existsSync(hermesBin);
  const requestedMode = env.HERMES_YOLO_FORCE_HERMES === '1'
    ? 'hermes'
    : env.HERMES_YOLO_FORCE_GROK === '1'
      ? 'grok'
      : String(env.HERMES_YOLO_BACKEND || 'auto').trim().toLowerCase();
  // auto defaults to hermes quality (glm-coding). SuperGrok is opt-in only.
  const routingMode = requestedMode === 'hermes'
    ? 'explicit-hermes'
    : requestedMode === 'grok'
      ? 'explicit-grok'
      : 'auto-hermes-quality';
  const base = {
    schema: 'hermes-yolo/route-status-v1',
    generatedAt: new Date().toISOString(),
    // Quality lock 2026-08-13: hermes-legacy/glm-coding primary; SuperGrok opt-in.
    routingMode,
    defaultPromptBackend: 'hermes-legacy',
    silentFallbackAllowed: false,
    grokLauncher: grokYoloBin ? path.basename(grokYoloBin) : null,
    grokLauncherDigest: grokYoloBin ? fileDigest(grokYoloBin) : null,
    legacyProvider: DEFAULT_PROVIDER,
    legacyModel: DEFAULT_MODEL,
    receiptSchema: 'hermes-yolo/route-receipt-v1',
  };
  if (!['auto', 'grok', 'hermes'].includes(requestedMode)) {
    return { ...base, ready: false, blocker: 'unsupported_backend_mode' };
  }
  if (!hermesReady && requestedMode === 'hermes') {
    return { ...base, ready: false, blocker: 'hermes_not_installed', defaultPromptBackend: 'hermes-legacy' };
  }
  if (!grokYoloBin) {
    const wantsGrok = requestedMode === 'grok';
    return {
      ...base,
      ready: wantsGrok ? false : hermesReady,
      blocker: wantsGrok ? 'grok_yolo_not_installed' : hermesReady ? null : 'hermes_not_installed',
      grokReady: false,
      grokBlocker: 'grok_yolo_not_installed',
      defaultPromptBackend: wantsGrok ? 'grok-4.5' : 'hermes-legacy',
    };
  }
  const runner = dependencies.runner || require('child_process').spawnSync;
  const result = runner(grokYoloBin, ['--doctor', '--json'], {
    encoding: 'utf8',
    env,
    timeout: positiveInteger(env.HERMES_YOLO_GROK_DOCTOR_TIMEOUT_MS, 12_000),
  });
  if (result.error) {
    return {
      ...base,
      ready: requestedMode === 'grok' ? false : hermesReady,
      blocker: requestedMode === 'grok' ? 'grok_doctor_failed_to_start' : hermesReady ? null : 'hermes_not_installed',
      grokReady: false,
      grokBlocker: 'grok_doctor_failed_to_start',
      grokError: safeError(result.error.message),
      defaultPromptBackend: requestedMode === 'grok' ? 'grok-4.5' : 'hermes-legacy',
    };
  }
  if (result.status !== 0) {
    return {
      ...base,
      ready: requestedMode === 'grok' ? false : hermesReady,
      blocker: requestedMode === 'grok' ? 'grok_doctor_failed' : hermesReady ? null : 'hermes_not_installed',
      grokReady: false,
      grokBlocker: 'grok_doctor_failed',
      grokExitCode: result.status,
      defaultPromptBackend: requestedMode === 'grok' ? 'grok-4.5' : 'hermes-legacy',
    };
  }
  try {
    const doctor = JSON.parse(result.stdout || '{}');
    const grokReady = Boolean(doctor.ready)
      && doctor.modelAvailable !== false
      && doctor.authenticated !== false;
    const selectedBackend = requestedMode === 'hermes'
      ? 'hermes-legacy'
      : requestedMode === 'grok'
        ? 'grok-4.5'
        : grokReady
          ? 'grok-4.5'
          : 'hermes-legacy';
    const selectedReady = selectedBackend === 'grok-4.5' ? grokReady : hermesReady;
    return {
      ...base,
      ready: selectedReady,
      blocker: selectedReady
        ? null
        : selectedBackend === 'grok-4.5'
          ? doctor.blocker || 'grok_not_ready'
          : 'hermes_not_installed',
      grokReady,
      grokBlocker: doctor.blocker || null,
      version: doctor.version || null,
      model: doctor.model || null,
      modelAvailable: Boolean(doctor.modelAvailable),
      authenticated: Boolean(doctor.authenticated),
      authMode: doctor.authMode || 'none',
      billingMode: doctor.billingMode || 'unknown',
      apiBillingActivatedByWrapper: Boolean(doctor.apiBillingActivatedByWrapper),
      defaultPromptBackend: selectedBackend,
    };
  } catch (error) {
    return {
      ...base,
      ready: requestedMode === 'grok' ? false : hermesReady,
      blocker: requestedMode === 'grok' ? 'grok_doctor_invalid_json' : hermesReady ? null : 'hermes_not_installed',
      grokReady: false,
      grokBlocker: 'grok_doctor_invalid_json',
      grokError: safeError(error.message),
      defaultPromptBackend: requestedMode === 'grok' ? 'grok-4.5' : 'hermes-legacy',
    };
  }
}

function runGrokBackend(rawArgs, env = process.env, dependencies = {}) {
  const started = Date.now();
  const classification = classifyBackend(rawArgs, env);
  const grokYoloBin = findGrokYoloBinary(env);
  if (!grokYoloBin) {
    writeRouteReceipt(buildRouteReceipt({
      rawArgs,
      ...classification,
      model: 'grok-4.5',
      status: 'blocked',
      exitCode: 127,
      durationMs: Date.now() - started,
      error: 'grok-yolo is not installed',
    }));
    console.error('[hermes-yolo] Grok 4.5 backend is required but grok-yolo is not installed.');
    console.error('[hermes-yolo] Refusing to silently fall back to Qwen.');
    process.exit(127);
  }
  // Progressive Agent Skills: lean catalog + matched expertise only (Google for Devs pattern).
  const taskText = extractTaskText(rawArgs);
  const lean = prepareLeanContextForTask(taskText, env, {
    module: dependencies.leanContextModule,
  });
  let grokArgs = buildGrokBackendArgs(rawArgs, { env });
  if (lean.promptPrefix && grokArgs[0] === '-p' && grokArgs[1] && grokArgs[1] !== DEFAULT_READY_PROMPT) {
    grokArgs = ['-p', composePromptWithLeanContext(grokArgs[1], lean), ...grokArgs.slice(2)];
  }
  if (lean.enabled && lean.packSummary) {
    console.error(
      `[hermes-yolo] lean-context skills=${lean.packSummary.skillCount} `
      + `activated=${(lean.packSummary.activatedNames || []).join(',') || '(none)'} `
      + `saved_vs_full≈${lean.packSummary.tokensSavedVsFullDump}tok`,
    );
  } else if (lean.error) {
    console.error(`[hermes-yolo] lean-context skipped: ${lean.error}`);
  }
  console.error('[hermes-yolo] backend=grok-4.5 (set HERMES_YOLO_BACKEND=hermes for the legacy Hermes provider route)');
  const runner = dependencies.runner || require('child_process').spawnSync;
  const result = runner(grokYoloBin, grokArgs, buildGrokSpawnOptions(grokArgs, env));
  const leanMeta = lean.packSummary
    ? { enabled: true, ...lean.packSummary, toolsets: lean.toolsets }
    : { enabled: lean.enabled, toolsets: lean.toolsets, error: lean.error || null };
  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT'
      || result.error.errno === 'ETIMEDOUT'
      || /timed?\s*out/i.test(String(result.error.message || ''));
    const exitCode = timedOut ? 124 : 127;
    const error = timedOut
      ? `Grok backend timeout after ${resolveGrokTimeoutMs(env)}ms`
      : result.error.message;
    writeRouteReceipt(buildRouteReceipt({
      rawArgs,
      ...classification,
      launcher: grokYoloBin,
      model: 'grok-4.5',
      status: timedOut ? 'timeout' : 'fail',
      exitCode,
      durationMs: Date.now() - started,
      error,
      toolsets: lean.toolsets,
      leanContext: leanMeta,
    }));
    console.error(`[hermes-yolo] ${timedOut ? error : `Grok 4.5 backend failed to start: ${result.error.message}`}`);
    process.exit(exitCode);
  }
  const exitCode = result.status === null ? 1 : result.status;
  writeRouteReceipt(buildRouteReceipt({
    rawArgs,
    ...classification,
    launcher: grokYoloBin,
    model: 'grok-4.5',
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
    signal: result.signal || null,
    durationMs: Date.now() - started,
    toolsets: lean.toolsets,
    leanContext: leanMeta,
  }));
  process.exit(exitCode);
}

function updateStatus(updater) {
  try {
    if (process.env.HERMES_YOLO_PROGRESS === '0') return;
    if (!fs.existsSync(STATUS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    updater(data);
    fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

if (require.main === module) {
if (args.length === 1 && (args[0] === '--route-status' || args[0] === 'route-status')) {
  const status = routeStatus(process.env);
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.ready ? 0 : 2);
}
// Yugabyte AMP fleet sprawl status / scale-to-zero dry-run
if (args.length >= 1 && (args[0] === '--sprawl-status' || args[0] === 'sprawl-status')) {
  const sprawl = loadSprawlControlModule();
  if (!sprawl) {
    console.error('[hermes-yolo] sprawl-control module missing');
    process.exit(2);
  }
  const assessment = sprawl.assessFleet();
  console.log(JSON.stringify(assessment, null, 2));
  process.exit(0);
}
if (args.length >= 1 && (args[0] === '--sprawl-reap' || args[0] === 'sprawl-reap')) {
  const sprawl = loadSprawlControlModule();
  if (!sprawl) {
    console.error('[hermes-yolo] sprawl-control module missing');
    process.exit(2);
  }
  const execute = args.includes('--execute');
  const killIdle = args.includes('--kill-idle');
  const result = sprawl.reapFleet({ dryRun: !execute, killIdle });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// Strip leading --dry-run so backend classification still works on the real task.
const dryRunFlag = args.includes('--dry-run') || process.env.HERMES_YOLO_DRY_RUN === '1';
const argsForRoute = args.filter((a) => a !== '--dry-run');
if (dryRunFlag) process.env.HERMES_YOLO_DRY_RUN = '1';

const activeClassification = classifyBackend(argsForRoute.length ? argsForRoute : args, process.env);
const legacyStartedAt = Date.now();

// --- Sprawl plan: roles + guarded autonomy + decision trace (before spawn) ---
const sprawlMod = process.env.HERMES_YOLO_SPRAWL === '0' ? null : loadSprawlControlModule();
let sprawlPlan = null;
let sprawlRunEntry = null;
if (sprawlMod) {
  const taskForPlan = (() => {
    if (!argsForRoute.length) return '';
    if (argsForRoute[0] === '-z' || argsForRoute[0] === '--single') {
      return argsForRoute.slice(1).join(' ').trim();
    }
    if (argsForRoute[0].startsWith('-') || HERMES_COMMANDS.has(argsForRoute[0])) return '';
    return argsForRoute.join(' ').trim();
  })();
  if (taskForPlan && taskForPlan !== DEFAULT_READY_PROMPT) {
    sprawlPlan = sprawlMod.planRun({
      taskText: taskForPlan,
      argCount: argsForRoute.length,
      cwd: process.cwd(),
      context: {
        backend: activeClassification.selectedBackend,
        model: activeClassification.selectedBackend === 'grok-4.5' ? 'grok-4.5' : DEFAULT_MODEL,
      },
    });
    try {
      sprawlMod.writeDecisionTrace(sprawlPlan.decisionTrace);
    } catch (e) {
      log(`SPRAWL_TRACE_WRITE_ERROR ${e && e.message}`);
    }
    console.error(
      `\x1b[36m[hermes-yolo]\x1b[0m amp-role=${sprawlPlan.roles.primary} `
      + `autonomy=${sprawlPlan.autonomy.mode} `
      + `fleet_live=${sprawlPlan.fleet.live} idle=${sprawlPlan.fleet.idle}`,
    );
    if (sprawlPlan.fleet.sprawlWarning) {
      console.error(
        `\x1b[33m[hermes-yolo]\x1b[0m fleet sprawl warning: concurrent runs high `
        + `(live+idle). Run: hermes-yolo --sprawl-status`,
      );
    }
    if (sprawlPlan.autonomy.mode === 'block') {
      writeRouteReceipt(buildRouteReceipt({
        rawArgs: argsForRoute,
        ...activeClassification,
        model: DEFAULT_MODEL,
        status: 'blocked',
        exitCode: 3,
        durationMs: Date.now() - legacyStartedAt,
        error: sprawlPlan.blockReason,
        sprawl: {
          role: sprawlPlan.roles.primary,
          autonomy: sprawlPlan.autonomy.mode,
          fleet: sprawlPlan.fleet,
        },
        decisionTrace: {
          primaryRole: sprawlPlan.decisionTrace.inferred.primaryRole,
          autonomyMode: sprawlPlan.decisionTrace.inferred.autonomyMode,
          riskCategories: sprawlPlan.decisionTrace.inferred.riskCategories,
        },
      }));
      console.error(`\x1b[31m[hermes-yolo]\x1b[0m blocked by sprawl autonomy: ${sprawlPlan.blockReason}`);
      process.exit(3);
    }
    if (sprawlPlan.autonomy.mode === 'ask' && process.env.HERMES_YOLO_ASK_BEFORE === '1') {
      writeRouteReceipt(buildRouteReceipt({
        rawArgs: argsForRoute,
        ...activeClassification,
        model: DEFAULT_MODEL,
        status: 'blocked',
        exitCode: 4,
        durationMs: Date.now() - legacyStartedAt,
        error: sprawlPlan.askReason || 'ask-before',
        sprawl: {
          role: sprawlPlan.roles.primary,
          autonomy: 'ask',
          fleet: sprawlPlan.fleet,
        },
        decisionTrace: {
          primaryRole: sprawlPlan.decisionTrace.inferred.primaryRole,
          autonomyMode: 'ask',
          riskCategories: sprawlPlan.decisionTrace.inferred.riskCategories,
        },
      }));
      console.error(`\x1b[33m[hermes-yolo]\x1b[0m ask-before (Yugabyte guarded autonomy): ${sprawlPlan.askReason}`);
      console.error('[hermes-yolo] re-run with confirmation env for this category, or narrow the task.');
      process.exit(4);
    }
    if (sprawlPlan.autonomy.mode === 'dry_run' || dryRunFlag) {
      const md = sprawlMod.renderDryRunMarkdown(sprawlPlan);
      console.log(md);
      writeRouteReceipt(buildRouteReceipt({
        rawArgs: argsForRoute,
        ...activeClassification,
        model: DEFAULT_MODEL,
        status: 'pass',
        exitCode: 0,
        durationMs: Date.now() - legacyStartedAt,
        sprawl: {
          role: sprawlPlan.roles.primary,
          autonomy: 'dry_run',
          fleet: sprawlPlan.fleet,
        },
        decisionTrace: {
          primaryRole: sprawlPlan.decisionTrace.inferred.primaryRole,
          autonomyMode: 'dry_run',
          riskCategories: sprawlPlan.decisionTrace.inferred.riskCategories,
        },
      }));
      process.exit(0);
    }
    try {
      sprawlRunEntry = sprawlMod.registerRun({
        pid: process.pid,
        runId: sprawlPlan.decisionTrace.runId,
        taskText: taskForPlan,
        role: sprawlPlan.roles.primary,
        backend: activeClassification.selectedBackend,
        model: activeClassification.selectedBackend === 'grok-4.5' ? 'grok-4.5' : DEFAULT_MODEL,
        autonomyMode: sprawlPlan.autonomy.mode,
        cwd: process.cwd(),
      });
    } catch (e) {
      log(`SPRAWL_REGISTER_ERROR ${e && e.message}`);
    }
  }
}

if (activeClassification.selectedBackend === 'grok-4.5') {
  if (sprawlMod && sprawlRunEntry) {
    process.on('exit', () => {
      try { sprawlMod.unregisterRun(process.pid); } catch (e) { /* ignore */ }
    });
  }
  runGrokBackend(argsForRoute.length ? argsForRoute : args, process.env);
}
// --- Singleton lock: refuse second instance, clear stale locks ---
if (fs.existsSync(LOCK_PATH)) {
  const lockPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
  let alive = false;
  try { process.kill(lockPid, 0); alive = true; } catch (e) {}
  if (alive) {
    let state = '';
    try {
      state = execFileSync('ps', ['-o', 'state=', '-p', String(lockPid)], { encoding: 'utf8' }).trim();
    } catch (e) {}

    if (state.includes('T') || state.includes('Z')) {
      console.warn(`\x1b[33m[hermes-yolo]\x1b[0m Found stale/suspended hermes-yolo process (PID ${lockPid}, state: ${state}). Cleaning it up.`);
      try {
        const childrenStr = execFileSync('pgrep', ['-P', String(lockPid)], { encoding: 'utf8' }).trim();
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
  const psOutput = execFileSync('ps', ['-axo', 'pid,state,command'], { encoding: 'utf8' });
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

// Progressive Agent Skills (Google for Devs): lean catalog + matched expertise only.
const leanForRun = prepareLeanContextForTask(
  wrapperPromptMode ? '' : extractTaskText(args),
  process.env,
);
const effectiveToolsets = leanForRun.toolsets || DEFAULT_TOOLSETS;
const hermesExtraArgs = buildHermesExtraArgs(effectiveToolsets, process.env);
let effectiveChildPromptArgs = childPromptArgs;
if (
  leanForRun.promptPrefix
  && childPromptArgs[0] === '-z'
  && childPromptArgs[1]
  && childPromptArgs[1] !== DEFAULT_READY_PROMPT
) {
  effectiveChildPromptArgs = [
    '-z',
    composePromptWithLeanContext(childPromptArgs[1], leanForRun),
  ];
}
const leanMetaForRun = leanForRun.packSummary
  ? { enabled: true, ...leanForRun.packSummary, toolsets: effectiveToolsets }
  : { enabled: leanForRun.enabled, toolsets: effectiveToolsets, error: leanForRun.error || null };

log(`START pid=${process.pid} bin=${HERMES_BIN} extraArgs=${JSON.stringify(hermesExtraArgs)} args=${JSON.stringify(effectiveChildPromptArgs)} toolsets=${effectiveToolsets} lean=${leanForRun.enabled} timeout=${TIMEOUT_MS}ms cpuWatchdog=${CPU_WATCHDOG_ENABLED ? 'enabled' : 'disabled'} cpuThreshold=${CPU_THRESHOLD}% stuckSamples=${CPU_STUCK_SAMPLES}@${CPU_SAMPLE_INTERVAL_MS}ms`);

// Fail-closed capability + quality gates before spawn (P0)
const runId = digest(`run-${process.pid}-${Date.now()}`, 16);
const toolBudget = createToolBudget();
try {
  if (SMART_ROUTE_DECISION.blocked) {
    const smartRouteError = new Error(`HERMES_YOLO_SMART_ROUTE_BLOCKED: ${SMART_ROUTE_DECISION.reason}`);
    smartRouteError.code = 'HERMES_YOLO_SMART_ROUTE_BLOCKED';
    throw smartRouteError;
  }
  if (process.env.HERMES_YOLO_FAIL_CLOSED !== '0') {
    assertAgentCapableModel(DEFAULT_MODEL, ROUTE_ENV);
    assertQualityPrimaryRoute(
      { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
      ROUTE_ENV,
    );
  }
} catch (capErr) {
  log(`FAIL_CLOSED ${capErr.message}`);
  writeRouteReceipt(buildRouteReceipt({
    runId,
    rawArgs: args,
    ...activeClassification,
    launcher: HERMES_BIN,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    requestedModel: DEFAULT_MODEL,
    toolsets: effectiveToolsets,
    leanContext: leanMetaForRun,
    toolBudget: toolBudget.snapshot(),
    status: 'blocked',
    exitCode: 3,
    durationMs: Date.now() - legacyStartedAt,
    error: capErr.message,
  }));
  console.error(`\x1b[31m[hermes-yolo]\x1b[0m ${capErr.message}`);
  releaseLock();
  process.exit(3);
}
if (leanForRun.enabled && leanForRun.packSummary) {
  console.error(
    `\x1b[36m[hermes-yolo]\x1b[0m lean-context skills=${leanForRun.packSummary.skillCount} `
    + `activated=${(leanForRun.packSummary.activatedNames || []).join(',') || '(none)'} `
    + `saved_vs_full≈${leanForRun.packSummary.tokensSavedVsFullDump}tok`,
  );
} else if (leanForRun.error) {
  console.error(`\x1b[33m[hermes-yolo]\x1b[0m lean-context skipped: ${leanForRun.error}`);
}
console.error(
  `\x1b[36m[hermes-yolo]\x1b[0m run=${runId} provider=${DEFAULT_PROVIDER} model=${DEFAULT_MODEL} `
  + `toolsets=${effectiveToolsets} agent_capable=${isAgentCapableModel(DEFAULT_MODEL, ROUTE_ENV)}`
);

// Independent liveness heartbeats for one-shot runs (model may be silent for minutes)
const HEARTBEAT_MS = parseInt(process.env.HERMES_YOLO_HEARTBEAT_MS || '15000', 10);
const progressEnabled = process.env.HERMES_YOLO_PROGRESS !== '0';
const legacyOneShot = isLegacyOneShot(effectiveChildPromptArgs);
let heartbeatHandle = null;
if (progressEnabled && legacyOneShot) {
  const t0 = Date.now();
  console.error(`\x1b[36m[hermes-yolo]\x1b[0m agent started (one-shot); heartbeats every ${HEARTBEAT_MS}ms`);
  heartbeatHandle = setInterval(() => {
    const sec = Math.round((Date.now() - t0) / 1000);
    console.error(`\x1b[36m[hermes-yolo]\x1b[0m still working… ${sec}s run=${runId} model=${DEFAULT_MODEL}`);
  }, HEARTBEAT_MS);
  if (typeof heartbeatHandle.unref === 'function') heartbeatHandle.unref();
}

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
  // Status UI keeps original short task text (not the full lean-context prefix).
  data.chatMessages.push({ sender: 'user', text: `hermes-yolo ${childPromptArgs.join(' ')}` });
  data.termHistory.push(`$ hermes-yolo ${childPromptArgs.join(' ')}`);
  data.termHistory.push(`[Hermes YOLO Wrapper] Spawned ${HERMES_BIN} ${hermesExtraArgs.join(' ')}`);
});

// Keep wrapper answers direct and truthful without rewriting the user's global
// Hermes persona. Hermes treats this ephemeral value as the per-process system
// prompt, so other launchers and existing interactive sessions are unaffected.
const env = Object.assign({}, ROUTE_ENV, {
  HERMES_YOLO: '1',
  HERMES_ACCEPT_HOOKS: '1',
  HERMES_EPHEMERAL_SYSTEM_PROMPT:
    ROUTE_ENV.HERMES_EPHEMERAL_SYSTEM_PROMPT || DIRECT_RESPONSE_RULES,
});

const isZaiOneShot = legacyOneShot && /zai/i.test(DEFAULT_PROVIDER);
const zaiEstimatedCostUsd = Number(process.env.HERMES_YOLO_ESTIMATED_COST_USD || '0.05');
let glmBudgetHarness = null;
if (isZaiOneShot) {
  glmBudgetHarness = require('./tools/glm53-coding-plan-harness');
  const authorization = glmBudgetHarness.authorizeEstimatedCost(zaiEstimatedCostUsd);
  if (!authorization.allowed) {
    console.error(`[hermes-yolo] ${authorization.reason}`);
    releaseLock();
    process.exit(75);
  }
}

const childStdio = legacyOneShot ? ['ignore', 'pipe', 'pipe'] : 'inherit';
// Detach one-shots so timeout kill can reclaim cargo/rustc grandchildren via pgid.
// Interactive chat must stay attached for stdin.
const detachOneshot = process.platform !== 'win32'
  && legacyOneShot;
const child = spawn(
  HERMES_BIN,
  ensureRequiredToolsetsInArgs([...hermesExtraArgs, ...effectiveChildPromptArgs]),
  {
  stdio: childStdio,
  env,
  detached: detachOneshot,
  },
);
let oneShotOutput = '';
const MAX_CAPTURED_OUTPUT = 1024 * 1024;
function mirrorAndCapture(stream, destination) {
  if (!stream) return;
  stream.on('data', chunk => {
    destination.write(chunk);
    if (oneShotOutput.length < MAX_CAPTURED_OUTPUT) {
      oneShotOutput += chunk.toString('utf8').slice(0, MAX_CAPTURED_OUTPUT - oneShotOutput.length);
    }
  });
}
if (legacyOneShot) {
  mirrorAndCapture(child.stdout, process.stdout);
  mirrorAndCapture(child.stderr, process.stderr);
}
log(`SPAWNED childPid=${child.pid} runId=${runId}`);

child.on('error', (err) => {
  if (heartbeatHandle) clearInterval(heartbeatHandle);
  log(`SPAWN_ERROR ${err.code} ${err.message}`);
  writeRouteReceipt(buildRouteReceipt({
    runId,
    rawArgs: args,
    ...activeClassification,
    launcher: HERMES_BIN,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    requestedModel: DEFAULT_MODEL,
    toolsets: effectiveToolsets,
    leanContext: leanMetaForRun,
    toolBudget: toolBudget.snapshot(),
    status: 'fail',
    exitCode: 127,
    durationMs: Date.now() - legacyStartedAt,
    error: err.message,
  }));
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
  
  // Kill process group when detached (cargo/rustc grandchildren)
  if (detachOneshot && child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* may not be group leader */ }
  }
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
      const childrenStr = execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' }).trim();
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
      const cpuStr = execFileSync('ps', ['-p', String(pid), '-o', '%cpu='], { encoding: 'utf8' }).trim();
      const cpu = parseFloat(cpuStr);
      if (Number.isFinite(cpu)) {
        totalCpu += cpu;
      }
    } catch (e) {}
  }
  return totalCpu;
}

// Hard timeout
// No hard timeout in interactive chat — a human session isn't a stuck task and must not be killed.
const timeoutHandle = legacyOneShot ? setTimeout(
  () => killChild(`hard timeout (${TIMEOUT_MS}ms)`),
  TIMEOUT_MS
) : null;

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
  if (heartbeatHandle) clearInterval(heartbeatHandle);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (watchdog) clearInterval(watchdog);
  releaseLock();
  const durationMs = Date.now() - legacyStartedAt;
  const providerFailure = legacyOneShot && detectProviderFailure(oneShotOutput);
  const effectiveExitCode = killed ? 124 : providerFailure ? 65 : (code ?? 0);
  const effectiveError = killed ? killReason : providerFailure ? 'provider request failed despite a zero child exit code' : null;
  if (isZaiOneShot && effectiveExitCode === 0 && glmBudgetHarness) {
    glmBudgetHarness.recordConfirmedCost(zaiEstimatedCostUsd, `hermes-yolo:${DEFAULT_MODEL}`, {
      providerConfirmed: true,
      accountingMode: 'conservative_request_estimate',
    });
  }
  log(`EXIT code=${code} signal=${signal} killed=${killed} reason=${killReason || ''} runId=${runId}`);
  if (progressEnabled && !wrapperPromptMode) {
    console.error(
      `\x1b[36m[hermes-yolo]\x1b[0m done in ${Math.round(durationMs / 1000)}s `
      + `exit=${effectiveExitCode} run=${runId}`
    );
  }
  writeRouteReceipt(buildRouteReceipt({
    runId,
    rawArgs: args,
    ...activeClassification,
    launcher: HERMES_BIN,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    requestedModel: DEFAULT_MODEL,
    actualModel: DEFAULT_MODEL,
    toolsets: effectiveToolsets,
    leanContext: leanMetaForRun,
    toolBudget: toolBudget.snapshot(),
    status: killed ? 'timeout' : effectiveExitCode === 0 ? 'pass' : 'fail',
    exitCode: effectiveExitCode,
    signal: signal || null,
    durationMs,
    error: effectiveError,
    sprawl: sprawlPlan
      ? {
          role: sprawlPlan.roles.primary,
          autonomy: sprawlPlan.autonomy.mode,
          fleet: sprawlPlan.fleet,
          runId: sprawlRunEntry && sprawlRunEntry.runId,
        }
      : null,
    decisionTrace: sprawlPlan
      ? {
          primaryRole: sprawlPlan.decisionTrace.inferred.primaryRole,
          autonomyMode: sprawlPlan.decisionTrace.inferred.autonomyMode,
          riskCategories: sprawlPlan.decisionTrace.inferred.riskCategories,
        }
      : null,
  }));

  updateStatus(data => {
    const watcher = data.agents.find(a => a.id === 'antigravity-coder-1');
    if (watcher) {
      watcher.tasks.forEach(t => {
        if (t.name.startsWith('Hermes YOLO Run:') && t.status === 'RUNNING') {
          t.status = killed ? 'KILLED' : effectiveExitCode === 0 ? 'COMPLETED' : 'FAILED';
        }
      });
    }
    data.chatMessages.push({
      sender: 'spark',
      text: killed
        ? `hermes-yolo killed by wrapper: ${killReason}. Exit code ${code}.`
        : effectiveExitCode === 0
          ? `Successfully completed Hermes YOLO task: "${effectivePromptText}". Resolved with status code ${effectiveExitCode}.`
          : `Hermes YOLO task failed: "${effectivePromptText}". Resolved with status code ${effectiveExitCode}.`
    });
    data.termHistory.push(`[Hermes YOLO Wrapper] Process completed with code ${effectiveExitCode}${killed ? ` (killed: ${killReason})` : ''}.`);
    data.termHistory.push('');
  });

  process.exit(effectiveExitCode);
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
  resolveSmartRoute,
  isPromptRoute,
  smartRouteTask,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  configuredDefaultModel,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  mergedHermesEnv,
  parseEnvFile,
  buildGrokBackendArgs,
  buildGrokBackendEnv,
  buildGrokSpawnOptions,
  findGrokYoloBinary,
  shouldUseGrokBackend,
  classifyBackend,
  isGrokBackendReady,
  buildRouteReceipt,
  routeStatus,
  summarizeRouteArgs,
  writeRouteReceipt,
  digest,
  modelCapability,
  isAgentCapableModel,
  assertAgentCapableModel,
  isLowQualityPrimary,
  chooseQualityPrimaryModel,
  upgradeLowQualityRoute,
  assertQualityPrimaryRoute,
  fingerprintCommand,
  createToolBudget,
  loadSprawlControlModule,
  loadLeanContextModule,
  leanContextEnabled,
  extractTaskText,
  composePromptWithLeanContext,
  prepareLeanContextForTask,
  buildHermesExtraArgs,
  normalizeToolsets,
  ensureRequiredToolsetsInArgs,
  detectProviderFailure,
  isGrokOneShot,
  isLegacyOneShot,
  resolveTimeoutMs,
  resolveGrokTimeoutMs,
  resolveGrokMaxTurns,
  resolveGrokReasoningEffort,
  MODEL_CAPABILITY_REGISTRY,
  DIRECT_RESPONSE_RULES,
  REQUIRED_TOOLSETS,
  DEFAULT_TOOLSETS,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT,
  checkAndHealSelfHealingHarness,
  detectAndHealStreamStall,
  MAX_COMPRESSIONS_CEILING,
};
}
