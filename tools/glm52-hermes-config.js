#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const PROVIDERS = {
  'zenmux-free': {
    provider: 'zenmux-glm52-free',
    name: 'ZenMux GLM 5.2 Free',
    baseUrl: 'https://zenmux.ai/api/v1',
    model: 'z-ai/glm-5.2-free',
    apiKeyEnv: 'ZENMUX_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 4096,
    transport: 'chat_completions',
    costTier: 'free_rate_limited',
    bestFor: 'cheap classification, summarization, routing, and low-risk Hermes sub-agent work',
  },
  openrouter: {
    provider: 'openrouter-glm52',
    defaultProvider: 'openrouter',
    name: 'OpenRouter GLM 5.2',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'z-ai/glm-5.2',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 4096,
    transport: 'chat_completions',
    costTier: 'metered',
    bestFor: 'fallback routing when OpenRouter account health and quotas are already managed',
  },
  'zai-native': {
    provider: 'zai-glm52',
    name: 'Z.ai GLM 5.2',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-5.2',
    apiKeyEnv: 'Z_AI_API_KEY',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    operationalMaxTokens: 4096,
    transport: 'chat_completions',
    costTier: 'native_account',
    bestFor: 'direct Z.ai account usage when native API credentials are available',
  },
};

const usage = `Usage:
  node tools/glm52-hermes-config.js [--route zenmux-free|openrouter|zai-native] [--set-default] [--apply] [--json]

Configures Hermes for GLM 5.2 without writing secrets. The generated Hermes
provider stores api_key as env:VARIABLE_NAME, so the actual key remains in the
operator environment/keychain layer.

Default route: zenmux-free`;

function parseArgs(argv) {
  const args = {
    route: process.env.HERMES_GLM52_ROUTE || 'zenmux-free',
    setDefault: false,
    apply: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--route') args.route = requireValue(argv, ++i, '--route');
    else if (arg === '--set-default') args.setDefault = true;
    else if (arg === '--apply') args.apply = true;
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

function commandToString(command) {
  return command.map(shellQuote).join(' ');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
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
    missingEnv,
    setDefault: args.setDefault,
    commands,
    commandText: commands.map(commandToString),
    notes: [
      'Secrets are not written by this tool; Hermes receives an env:KEY reference.',
      'Use zenmux-free for cheap/rate-limited Hermes chores; keep stronger paid models for high-risk fulfillment.',
      'Restart the Hermes gateway after applying a default-model change.',
    ],
  };
}

function render(plan, results) {
  const lines = [
    '# Hermes GLM 5.2 Config Plan',
    '',
    `Route: ${plan.route}`,
    `Provider: ${plan.provider}`,
    `Model: ${plan.model}`,
    `Base URL: ${plan.baseUrl}`,
    `Context: ${plan.contextLength}`,
    `API key: ${plan.apiKeyReference}`,
    `Set default: ${plan.setDefault ? 'yes' : 'no'}`,
    '',
  ];
  if (plan.missingEnv.length > 0) {
    lines.push(`Missing env for live calls: ${plan.missingEnv.join(', ')}`, '');
  }
  lines.push('## Commands', '');
  for (const command of plan.commandText) lines.push(`- ${command}`);
  if (results) {
    lines.push('', '## Apply Results', '');
    for (const result of results) {
      lines.push(`- ${result.status === 0 ? 'PASS' : 'FAIL'} ${result.command}`);
      if (result.stderr) lines.push(`  stderr: ${result.stderr}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const plan = buildPlan(args);
  const results = args.apply ? applyCommands(plan.commands) : null;
  if (args.json) {
    console.log(JSON.stringify({ ...plan, applyResults: results }, null, 2));
  } else {
    process.stdout.write(render(plan, results));
  }
  if (results && results.some((result) => result.status !== 0)) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  PROVIDERS,
  buildPlan,
  commandToString,
  hermesConfigCommands,
  parseArgs,
  shellQuote,
};
