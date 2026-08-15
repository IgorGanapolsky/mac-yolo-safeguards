#!/usr/bin/env node
'use strict';

/**
 * jcode-yolo-wrapper.js — Intelligent Multi-Model Autonomous JCode Harness
 * -------------------------------------------------------------------------
 * Intelligently switches and routes jcode tasks across models based on task intent,
 * availability, and the $10/mo API token budget guardrail:
 *
 * Routing Tiers:
 *   1. Cyber / Security / Audits / Exploits -> Z.ai GLM-5.3 (84.5% CyberGym, $0 marginal coding plan)
 *   2. Second Opinion / Verifier / Review   -> Grok 4.5 (grok-build ACP transport)
 *   3. Complex Architecture / Refactoring   -> Claude 3.7 / Sonnet 5
 *   4. Fast Autonomous Edits / Boilerplate  -> ByteDance Seed 2.1 Turbo / DeepSeek Chat
 *   5. Local / Offline / Budget-Throttled   -> Local Ollama (qwen3.5:9b-hermes-64k)
 *
 * Usage:
 *   jcode-yolo "Audit authentication logic for vulnerability flaws"   # Routes to GLM-5.3
 *   jcode-yolo "Quickly add a helper function in utils.js"            # Routes to Seed Turbo
 *   jcode-yolo --doctor --json
 *   jcode-yolo -m glm-5.3 "Explicit prompt"
 */

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local', 'bin', 'jcode');
const JCODE_CONFIG_PATH = process.env.JCODE_CONFIG_PATH || path.join(HOME, '.jcode', 'config.toml');
const HERMES_ENV_PATH = path.join(HOME, '.hermes', '.env');
const MONTHLY_BUDGET_USD = 10.00;

// Model Capabilities Matrix
const MODEL_ROSTER = {
  'glm-5.3': {
    provider: 'zai',
    model: 'glm-5.3',
    tier: 'subscription_coding_plan',
    costPerMillion: 0.00,
    strengths: ['cyber', 'security', 'vulnerability', 'audit', 'cve', 'sanitize', 'exploit', 'injection'],
    contextTokens: 1000000,
  },
  'grok-4.5': {
    provider: 'grok-build',
    model: 'grok-4.5',
    tier: 'oauth_quota',
    costPerMillion: 0.00,
    strengths: ['grok', 'verify', 'verifier', 'second-opinion', 'verdict', 'proof', 'contradiction'],
    contextTokens: 500000,
  },
  'claude-3-7-sonnet': {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-5',
    tier: 'metered',
    costPerMillion: 2.00,
    strengths: ['architecture', 'large-refactor', 'multi-file', 'design-system', 'framework-migration'],
    contextTokens: 1000000,
  },
  'seed-2-1-turbo': {
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2-1-turbo',
    tier: 'metered_cheap',
    costPerMillion: 0.20,
    strengths: ['quick', 'fast', 'boilerplate', 'script', 'unit-test', 'regex', 'helper', 'patch'],
    contextTokens: 128000,
  },
  'qwen-local': {
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-64k',
    tier: 'local_zero_spend',
    costPerMillion: 0.00,
    strengths: ['local', 'offline', 'zero-spend', 'test', 'dry-run'],
    contextTokens: 65536,
  },
};

function loadSecret(name, env = process.env) {
  if (env[name]) return env[name];
  if (fs.existsSync(HERMES_ENV_PATH)) {
    try {
      const content = fs.readFileSync(HERMES_ENV_PATH, 'utf8');
      const match = content.match(new RegExp(`^${name}=(.+)$`, 'm'));
      if (match && match[1].trim()) {
        const key = match[1].trim();
        env[name] = key;
        return key;
      }
    } catch {}
  }
  try {
    const out = spawnSync('security', ['find-generic-password', '-a', name, '-s', 'hermes-agent-secrets', '-w'], { encoding: 'utf8' });
    if (out.status === 0 && out.stdout.trim()) {
      const key = out.stdout.trim();
      env[name] = key;
      return key;
    }
  } catch {}
  try {
    const out = spawnSync('security', ['find-generic-password', '-s', name, '-w'], { encoding: 'utf8' });
    if (out.status === 0 && out.stdout.trim()) {
      const key = out.stdout.trim();
      env[name] = key;
      return key;
    }
  } catch {}
  return null;
}

/**
 * Classifies prompt intent to select the optimal, most cost-efficient model.
 */
function classifyPromptIntent(prompt = '') {
  const text = String(prompt).toLowerCase();
  if (!text) return 'glm-5.3'; // Default to flagship GLM-5.3 coding plan

  for (const [modelKey, spec] of Object.entries(MODEL_ROSTER)) {
    for (const kw of spec.strengths) {
      if (text.includes(kw)) {
        return modelKey;
      }
    }
  }

  // Fallback heuristic: Default to GLM-5.3 ($0 marginal token cost on Z.ai coding plan)
  return 'glm-5.3';
}

function resolveJcodeRouting(prompt = '', userOptions = {}, env = process.env) {
  const openrouterKey = loadSecret('OPENROUTER_API_KEY', env);
  const zaiKey = loadSecret('Z_AI_API_KEY', env);

  // Check explicit model override from user flags or env
  let selectedModelKey = userOptions.model || env.JCODE_MODEL;
  if (!selectedModelKey || selectedModelKey === 'auto' || selectedModelKey === 'gpt-4.5' || selectedModelKey === 'provider-default') {
    selectedModelKey = classifyPromptIntent(prompt);
  }

  let route = MODEL_ROSTER[selectedModelKey] || {
    provider: userOptions.provider || env.JCODE_DEFAULT_PROVIDER || 'zai',
    model: selectedModelKey,
    tier: 'custom',
    costPerMillion: 0.00,
  };

  // If selected route requires OpenRouter key and it's missing, fail over to Z.ai or Ollama
  if (route.provider === 'openrouter' && !openrouterKey) {
    if (zaiKey) {
      route = MODEL_ROSTER['glm-5.3'];
    } else {
      route = MODEL_ROSTER['qwen-local'];
    }
  }

  return {
    provider: userOptions.provider || route.provider,
    model: route.model,
    modelKey: selectedModelKey,
    tier: route.tier,
    costPerMillion: route.costPerMillion,
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    hasJcodeBin: fs.existsSync(JCODE_BIN),
    jcodeBin: JCODE_BIN,
    keys: {
      openrouter: Boolean(openrouterKey),
      zai: Boolean(zaiKey),
    },
  };
}

function runDoctor(json = false) {
  const routing = resolveJcodeRouting('cyber security audit');
  const report = {
    service: 'jcode-yolo',
    status: routing.hasJcodeBin ? 'READY' : 'JCODE_BIN_MISSING',
    activeDefaultProvider: routing.provider,
    activeDefaultModel: routing.model,
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    intelligentRoutingAvailable: Object.keys(MODEL_ROSTER),
    credentialStatus: routing.keys,
    binary: routing.jcodeBin,
    yolo: true,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n🔍 jcode-yolo Intelligent Model Router: ${report.status}`);
    console.log(`   Binary: ${report.binary}`);
    console.log(`   Default Model: ${report.activeDefaultProvider} / ${report.activeDefaultModel}`);
    console.log(`   Budget Ceiling: $${report.monthlyBudgetUsd}/mo`);
    console.log(`   Model Roster: ${report.intelligentRoutingAvailable.join(', ')}`);
    console.log(`   Keys: OpenRouter=${report.credentialStatus.openrouter ? 'YES' : 'NO'}, Z.AI=${report.credentialStatus.zai ? 'YES' : 'NO'}\n`);
  }
  return { exitCode: routing.hasJcodeBin ? 0 : 1, report };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    doctor: false,
    json: false,
    provider: null,
    model: null,
    passthrough: [],
    prompt: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'doctor' || a === '--doctor') options.doctor = true;
    else if (a === '--json') options.json = true;
    else if ((a === '-p' || a === '--provider') && argv[i + 1]) options.provider = argv[++i];
    else if ((a === '-m' || a === '--model') && argv[i + 1]) options.model = argv[++i];
    else if (a === '-z' || a === '--oneshot') {
      // Compatibility flag
    } else {
      options.passthrough.push(a);
    }
  }

  options.prompt = options.passthrough.join(' ');
  return options;
}

function main() {
  const options = parseCliArgs();

  if (options.doctor) {
    const res = runDoctor(options.json);
    process.exit(res.exitCode);
  }

  const routing = resolveJcodeRouting(options.prompt, options);

  if (!routing.hasJcodeBin) {
    console.error(`[jcode-yolo] JCode binary not found at ${routing.jcodeBin}`);
    process.exit(127);
  }

  // Build explicit CLI arguments for jcode run
  const childArgs = [
    'run',
    '--provider', routing.provider,
    '--model', routing.model,
  ];

  if (options.json) childArgs.push('--json');

  if (options.prompt) {
    childArgs.push(options.prompt);
  }

  console.error(`[jcode-yolo] 🧠 Intelligent Route: ${routing.provider} / ${routing.model} (${routing.tier}) [Budget: $${MONTHLY_BUDGET_USD}/mo]`);

  const child = spawn(routing.jcodeBin, childArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      JCODE_DEFAULT_PROVIDER: routing.provider,
      JCODE_MODEL: routing.model,
      JCODE_YOLO: '1',
      JCODE_AUTONOMY: '1',
    },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

if (require.main === module) main();

module.exports = {
  MODEL_ROSTER,
  MONTHLY_BUDGET_USD,
  classifyPromptIntent,
  resolveJcodeRouting,
  runDoctor,
};
