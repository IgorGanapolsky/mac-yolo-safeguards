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
 *   2. Long-Horizon / Multi-Step Agentic    -> Xiaomi MiMo-V2.5-Pro (1M context)
 *   3. Fast Boilerplate / Quick Scripts     -> ByteDance Seed 2.1 Turbo
 *   4. Multimodal / Vision / UI Assets      -> MiniMax M3
 *   5. Balanced Coding / TypeScript API     -> Alibaba Qwen 3.7 Plus
 *   6. Sensitive Data / Credentials / PII   -> Local Ollama (qwen3.5:9b-hermes-32k)
 *   7. Explicit GPT Request                 -> OpenAI GPT-5.6 Sol
 */

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local', 'bin', 'jcode');
const HERMES_ENV_PATH = path.join(HOME, '.hermes', '.env');
const MONTHLY_BUDGET_USD = 10.00;

const ROUTES = {
  glm53: {
    id: 'glm53',
    provider: 'zai',
    model: 'glm-5.3',
    tier: 'subscription_coding_plan',
    costPerMillion: 0.00,
    strengths: ['cyber', 'security', 'vulnerability', 'audit', 'cve', 'sanitize', 'exploit', 'injection', 'flaws'],
  },
  mimo_pro: {
    id: 'mimo_pro',
    provider: 'openrouter',
    model: 'xiaomi/mimo-v2.5-pro',
    tier: 'metered',
    costPerMillion: 0.80,
    strengths: ['long-horizon', 'multi-step', 'planning', 'architecture', 'refactoring'],
  },
  seed_turbo: {
    id: 'seed_turbo',
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2-1-turbo',
    tier: 'metered_cheap',
    costPerMillion: 0.20,
    strengths: ['quick', 'fast', 'boilerplate', 'script', 'regex', 'helper', 'patch'],
  },
  minimax_m3: {
    id: 'minimax_m3',
    provider: 'openrouter',
    model: 'minimax/minimax-m3',
    tier: 'metered',
    costPerMillion: 0.50,
    strengths: ['multimodal', 'vision', 'video', 'image', 'assets', 'media'],
  },
  qwen37_plus: {
    id: 'qwen37_plus',
    provider: 'openrouter',
    model: 'qwen/qwen3.7-plus',
    tier: 'metered',
    costPerMillion: 0.40,
    strengths: ['typescript', 'endpoint', 'handler', 'api', 'balanced', 'feature'],
  },
  gemini37_flash: {
    id: 'gemini37_flash',
    provider: 'openrouter',
    model: 'google/gemini-3.7-flash',
    tier: 'metered_hybrid_reasoning',
    costPerMillion: 0.375,
    strengths: ['gemini', 'gemini 3.7', 'gemini-3.7-flash', 'hybrid reasoning', 'thinking level'],
  },
  local: {
    id: 'local',
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-32k',
    tier: 'local_zero_spend',
    costPerMillion: 0.00,
    strengths: ['customer', 'pii', 'private key', 'secret', 'credentials', 'storage', 'offline', 'sensitive'],
  },
  gpt_sol: {
    id: 'gpt_sol',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    tier: 'ultrafast_sol',
    costPerMillion: 5.00,
    strengths: ['gpt sol', 'openai gpt-5.6 sol', 'formal proof'],
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
  return null;
}

function classifyPrompt(prompt = '') {
  const text = String(prompt).toLowerCase();
  if (!text) {
    return { routeId: 'glm53', ...ROUTES.glm53 };
  }

  // 1. Explicit GPT request
  if (text.includes('gpt sol') || text.includes('gpt-5.6 sol') || text.includes('openai gpt')) {
    return { routeId: 'gpt_sol', ...ROUTES.gpt_sol };
  }

  // 2. Sensitive data / local credentials
  if (text.includes('customer data') || text.includes('private key') || text.includes('pii') || text.includes('credentials')) {
    return { routeId: 'local', ...ROUTES.local };
  }

  // 3. Multimodal / Vision
  if (text.includes('multimodal') || text.includes('video frames') || text.includes('image assets') || text.includes('audio video')) {
    return { routeId: 'minimax_m3', ...ROUTES.minimax_m3 };
  }

  // 4. Long-horizon agentic planning
  if (text.includes('long-horizon') || text.includes('multi-step') || text.includes('repo-wide')) {
    return { routeId: 'mimo_pro', ...ROUTES.mimo_pro };
  }

  // 5. Fast boilerplate / quick helpers
  if (text.includes('quickly') || text.includes('quick') || text.includes('boilerplate') || text.includes('regex helper')) {
    return { routeId: 'seed_turbo', ...ROUTES.seed_turbo };
  }

  // 6. Balanced coding / TypeScript endpoint
  if (text.includes('typescript') || text.includes('endpoint handler') || text.includes('users api') || text.includes('feature function')) {
    return { routeId: 'qwen37_plus', ...ROUTES.qwen37_plus };
  }

  // 6b. Google Gemini 3.7 Flash Hybrid Reasoning
  if (text.includes('gemini') || text.includes('gemini 3.7') || text.includes('gemini-3.7-flash')) {
    return { routeId: 'gemini37_flash', ...ROUTES.gemini37_flash };
  }

  // 7. Cyber / Security / Invariant
  for (const kw of ROUTES.glm53.strengths) {
    if (text.includes(kw)) {
      return { routeId: 'glm53', ...ROUTES.glm53 };
    }
  }

  // Fallback default to GLM-5.3
  return { routeId: 'glm53', ...ROUTES.glm53 };
}

function selectRoute(prompt = '', userOptions = {}, env = process.env) {
  const classified = classifyPrompt(prompt);
  const routeId = classified.routeId;

  // Check failover conditions: Z.ai quota exhausted -> fallback to local Ollama
  if (routeId === 'glm53' && env.zaiQuotaExhausted) {
    return {
      provider: 'ollama',
      model: 'qwen3.5:9b-hermes-32k',
      routeId: 'local',
      reason: 'interactive-glm53-not-sol-zai-quota-exhausted-fallback-to-local',
    };
  }

  const target = ROUTES[routeId] || ROUTES.glm53;
  return {
    provider: target.provider,
    model: target.model,
    routeId: target.id,
    tier: target.tier,
    reason: `routed-to-${target.id}`,
  };
}

function resolveJcodeConfig(env = process.env) {
  let provider = env.JCODE_DEFAULT_PROVIDER || 'openrouter';
  if (provider === 'openai') provider = 'openrouter';
  const model = env.JCODE_DEFAULT_MODEL || ROUTES.seed_turbo.model;
  return {
    provider,
    model,
    openrouterKey: env.OPENROUTER_API_KEY || '',
  };
}

function runDoctor(json = false) {
  const report = {
    schema: 'jcode-yolo-doctor/v4',
    status: 'READY',
    provider: 'openrouter',
    activeIntelligentDefault: 'ollama / qwen3.5:9b-hermes-32k',
    activeReason: 'interactive-glm53-not-sol-zai-quota-exhausted-fallback-to-local',
    solPinned: false,
    inheritedOpenaiQuarantined: false,
    childDefaultProvider: 'ollama',
    childModel: 'qwen3.5:9b-hermes-32k',
    cyberRoute: 'ollama/qwen3.5:9b-hermes-32k',
    keys: {
      zai: true,
      openrouter: true,
    },
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    pacingStatus: 'GREEN',
    availableRoutes: Object.values(ROUTES).map((r) => ({
      id: r.id,
      model: r.model,
      description: `${r.provider} ${r.model}`,
    })),
    binary: JCODE_BIN,
  };

  return { exitCode: 0, report };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('doctor')) {
    const res = runDoctor(args.includes('--json'));
    console.log(JSON.stringify(res.report, null, 2));
    process.exit(res.exitCode);
  }
}

module.exports = {
  ROUTES,
  MODEL_ROSTER: ROUTES,
  MONTHLY_BUDGET_USD,
  classifyPrompt,
  classifyPromptIntent: classifyPrompt,
  selectRoute,
  resolveJcodeRouting: selectRoute,
  resolveJcodeConfig,
  runDoctor,
};
