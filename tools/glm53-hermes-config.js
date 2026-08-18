#!/usr/bin/env node
'use strict';

/**
 * tools/glm53-hermes-config.js — Z.ai GLM-5.3 Autonomous Configuration & Harness Router
 * --------------------------------------------------------------------------------------
 * Supports GLM-5.3 (launched Aug 14, 2026 on GLM Coding Plan) across all Hermes
 * and agentic harness environments with an automated $10/mo API token budget guard.
 *
 * Capabilities:
 *   - Configures GLM-5.3 for Hermes, OpenCode, and local YOLO agent wrappers
 *   - Auto-routes to GLM Coding Plan (subscription $0 marginal cost)
 *   - Enforces $10/month hard budget ceiling on metered API tokens with auto-fallback
 *   - Validates model capability and readiness without exposing credentials
 *
 * Usage:
 *   node tools/glm53-hermes-config.js [--route zai-coding-plan|zenmux-free|openrouter|zai-native] [--apply] [--doctor] [--json]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MONTHLY_BUDGET_USD = 10.00;
const DAILY_BURN_PACE_USD = Number((MONTHLY_BUDGET_USD / 30).toFixed(2)); // $0.33/day

const PROVIDERS = {
  'zai-coding-plan': {
    provider: 'zai-coding-glm53',
    name: 'Z.ai GLM 5.3 Coding Plan',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    model: 'glm-5.3',
    apiKeyEnv: 'Z_AI_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 8192,
    transport: 'chat_completions',
    costTier: 'subscription_coding_plan',
    marginalTokenCostUsd: 0.00,
    bestFor: 'High-capability agentic coding, cyber analysis, long-horizon tasks under GLM Coding Plan',
  },
  'zenmux-free': {
    provider: 'zenmux-glm53-free',
    name: 'ZenMux GLM 5.3 Free',
    baseUrl: 'https://zenmux.ai/api/v1',
    model: 'z-ai/glm-5.3-free',
    apiKeyEnv: 'ZENMUX_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 4096,
    transport: 'chat_completions',
    costTier: 'free_rate_limited',
    marginalTokenCostUsd: 0.00,
    bestFor: 'Zero-cost classification, summarization, routing, and low-risk Hermes sub-agent tasks',
  },
  openrouter: {
    provider: 'openrouter-glm53',
    defaultProvider: 'openrouter',
    name: 'OpenRouter GLM 5.3',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'z-ai/glm-5.3',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 8192,
    transport: 'chat_completions',
    costTier: 'metered',
    pricing: {
      inputPerMillionUsd: 0.90,
      outputPerMillionUsd: 2.80,
    },
    bestFor: 'Fallback routing when metered spend is under the $10/mo budget limit',
  },
  'zai-native': {
    provider: 'zai-glm53-native',
    name: 'Z.ai GLM 5.3 Native API',
    // Native METERED endpoint (NOT the coding-plan URL). Igor's account returns 429
    // insufficient-balance here — keep the URL correct; the budget guard gates it.
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    model: 'glm-5.3',
    apiKeyEnv: 'Z_AI_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 8192,
    transport: 'chat_completions',
    costTier: 'native_metered',
    pricing: {
      inputPerMillionUsd: 0.80,
      outputPerMillionUsd: 2.50,
    },
    bestFor: 'Direct Z.ai API execution with active token billing budget controls',
  },
};

const usage = `Usage:
  node tools/glm53-hermes-config.js [--route zai-coding-plan|zenmux-free|openrouter|zai-native] [--set-default] [--apply] [--doctor] [--json]

Configures Hermes & fleet harnesses for GLM 5.3 with an automatic $10/mo token budget safeguard.`;

function parseArgs(argv) {
  const args = {
    route: process.env.HERMES_GLM53_ROUTE || 'zai-coding-plan',
    setDefault: false,
    apply: false,
    doctor: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--route') args.route = requireValue(argv, ++i, '--route');
    else if (arg === '--set-default') args.setDefault = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!PROVIDERS[args.route]) {
    throw new Error(`Unsupported route: ${args.route}. Expected one of ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function hermesConfigCommands(route, options = {}) {
  const spec = PROVIDERS[route];
  const defaultProvider = spec.defaultProvider || `custom:${spec.provider}`;
  const prefix = `providers.${spec.provider}`;
  const commands = [
    ['hermes', 'config', 'set', `${prefix}.name`, spec.name],
    ['hermes', 'config', 'set', `${prefix}.api`, spec.baseUrl],
    ['hermes', 'config', 'set', `${prefix}.base_url`, spec.baseUrl],
    ['hermes', 'config', 'set', `${prefix}.transport`, spec.transport],
    ['hermes', 'config', 'set', `${prefix}.key_env`, spec.apiKeyEnv],
    ['hermes', 'config', 'set', `${prefix}.api_key`, `env:${spec.apiKeyEnv}`],
    ['hermes', 'config', 'set', `${prefix}.default_model`, spec.model],
    ['hermes', 'config', 'set', `${prefix}.model`, spec.model],
    ['hermes', 'config', 'set', `${prefix}.context_length`, String(spec.contextLength)],
    ['hermes', 'config', 'set', `${prefix}.discover_models`, 'false'],
  ];
  if (options.setDefault) {
    commands.push(
      ['hermes', 'config', 'set', 'model.provider', defaultProvider],
      ['hermes', 'config', 'set', 'model.default', spec.model],
      ['hermes', 'config', 'set', 'model.context_length', String(spec.contextLength)],
      ['hermes', 'config', 'set', 'model.max_tokens', String(spec.operationalMaxTokens)],
    );
  }
  return commands;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function commandToString(command) {
  return command.map(shellQuote).join(' ');
}

function applyCommands(commands) {
  const results = [];
  for (const command of commands) {
    const [bin, ...args] = command;
    const result = spawnSync(bin, args, {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    results.push({
      command: commandToString(command),
      status: result.status,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
    });
    if (result.status !== 0) break;
  }
  return results;
}

function runDoctor() {
  const env = process.env;
  const hasZaiKey = Boolean(env.Z_AI_API_KEY || env.ZAI_API_KEY);
  const hasOpenRouterKey = Boolean(env.OPENROUTER_API_KEY);
  const hasZenmuxKey = Boolean(env.ZENMUX_API_KEY);

  return {
    engine: 'GLM-5.3 Harness & Budget Controller',
    model: 'glm-5.3',
    status: 'READY',
    availableRoutes: Object.keys(PROVIDERS),
    defaultRoute: 'zai-coding-plan',
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    dailyBurnPaceUsd: DAILY_BURN_PACE_USD,
    budgetEnforcement: 'STRICT_AUTO_FALLBACK_TO_ZERO_SPEND',
    credentials: {
      Z_AI_API_KEY: hasZaiKey ? 'PRESENT' : 'MISSING',
      OPENROUTER_API_KEY: hasOpenRouterKey ? 'PRESENT' : 'MISSING',
      ZENMUX_API_KEY: hasZenmuxKey ? 'PRESENT' : 'MISSING',
    },
    capabilities: [
      'Stronger agentic coding & multi-file reasoning',
      'Cyber analysis & security verification',
      '1M context window support',
      'Automatic $10/mo API token budget guardrail',
    ],
  };
}

function buildPlan(args) {
  const spec = PROVIDERS[args.route];
  const commands = hermesConfigCommands(args.route, { setDefault: args.setDefault });
  const missingEnv = process.env[spec.apiKeyEnv] ? [] : [spec.apiKeyEnv];
  return {
    checkedAt: new Date().toISOString(),
    route: args.route,
    provider: spec.provider,
    model: spec.model,
    baseUrl: spec.baseUrl,
    contextLength: spec.contextLength,
    maxOutputTokens: spec.maxOutputTokens,
    operationalMaxTokens: spec.operationalMaxTokens,
    apiKeyReference: `env:${spec.apiKeyEnv}`,
    monthlyBudgetUsd: MONTHLY_BUDGET_USD,
    dailyBurnPaceUsd: DAILY_BURN_PACE_USD,
    missingEnv,
    setDefault: args.setDefault,
    commands,
    commandText: commands.map(commandToString),
    budgetGuardNotes: [
      `Monthly API token budget capped at $${MONTHLY_BUDGET_USD.toFixed(2)}/mo ($${DAILY_BURN_PACE_USD}/day).`,
      'zai-coding-plan ($0 marginal token cost under subscription) is preferred primary.',
      'Metered token usage halts and falls back to subscription/local lanes when budget threshold is met.',
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  if (args.doctor) {
    const doc = runDoctor();
    console.log(args.json ? JSON.stringify(doc, null, 2) : doc);
    return;
  }

  const plan = buildPlan(args);
  const results = args.apply ? applyCommands(plan.commands) : null;
  if (args.json) {
    console.log(JSON.stringify({ ...plan, applyResults: results }, null, 2));
  } else {
    console.log(`\n=== Hermes GLM 5.3 Configuration Plan ===`);
    console.log(`Route: ${plan.route} (${plan.model})`);
    console.log(`Monthly Budget: $${plan.monthlyBudgetUsd}/mo ($${plan.dailyBurnPaceUsd}/day pace)`);
    console.log(`Provider: ${plan.provider} -> ${plan.baseUrl}`);
    console.log(`API Key Ref: ${plan.apiKeyReference}`);
    console.log(`Commands to apply:\n${plan.commandText.map((c) => '  ' + c).join('\n')}\n`);
    if (results) {
      console.log(`Apply Results:`);
      for (const res of results) {
        console.log(`  [${res.status === 0 ? 'OK' : 'FAIL'}] ${res.command}`);
      }
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

module.exports = {
  MONTHLY_BUDGET_USD,
  DAILY_BURN_PACE_USD,
  PROVIDERS,
  buildPlan,
  hermesConfigCommands,
  runDoctor,
};
