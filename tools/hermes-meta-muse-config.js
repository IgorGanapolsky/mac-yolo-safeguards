#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SPEC = Object.freeze({
  provider: 'meta-muse-spark',
  hermesProvider: 'custom:meta-muse-spark',
  name: 'Meta Muse Spark 1.1',
  baseUrl: 'https://api.meta.ai/v1',
  model: 'muse-spark-1.1',
  apiKeyEnv: 'MODEL_API_KEY',
  transport: 'chat_completions',
  nativeContextLength: 1_000_000,
  operationalContextLength: 16_384,
  operationalMaxTokens: 1_024,
  maxTurns: 4,
  reasoningEffort: 'high',
  pricing: {
    currency: 'USD',
    perMillionTokens: {
      input: 1.25,
      cachedInput: 0.15,
      output: 4.25,
    },
    webSearchPerThousand: 2.5,
    source: 'https://dev.meta.ai/docs/getting-started/pricing-rate-limits',
  },
});

const usage = `Usage:
  node tools/hermes-meta-muse-config.js [--apply] [--isolated]
       [--hermes-home PATH] [--set-default] [--json]

Adds Meta Muse Spark to Hermes without writing an API key. --isolated creates
the fail-closed meta-yolo profile: the Meta provider is the only inference
route, fallback chains are empty, and the operational context/turn budget is
bounded to a worst-case $0.10 per default run.`;

function parseArgs(argv, env = process.env) {
  const args = {
    apply: false,
    isolated: false,
    setDefault: false,
    json: false,
    help: false,
    hermesHome: null,
    hermesBin: env.HERMES_BIN || 'hermes',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--isolated') args.isolated = true;
    else if (arg === '--set-default') args.setDefault = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--hermes-home') args.hermesHome = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-bin') args.hermesBin = requireValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.isolated && args.setDefault) {
    throw new Error('--isolated already pins the default; omit --set-default');
  }
  const defaultHome = args.isolated
    ? path.join(os.homedir(), '.hermes', 'meta-muse-profile')
    : path.join(os.homedir(), '.hermes');
  args.hermesHome = path.resolve(args.hermesHome || defaultHome);
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function providerCommands(hermesBin = 'hermes') {
  const prefix = `providers.${SPEC.provider}`;
  return [
    [hermesBin, 'config', 'set', `${prefix}.name`, SPEC.name],
    [hermesBin, 'config', 'set', `${prefix}.api`, SPEC.baseUrl],
    [hermesBin, 'config', 'set', `${prefix}.base_url`, SPEC.baseUrl],
    [hermesBin, 'config', 'set', `${prefix}.transport`, SPEC.transport],
    [hermesBin, 'config', 'set', `${prefix}.key_env`, SPEC.apiKeyEnv],
    [hermesBin, 'config', 'set', `${prefix}.api_key`, `env:${SPEC.apiKeyEnv}`],
    [hermesBin, 'config', 'set', `${prefix}.default_model`, SPEC.model],
    [hermesBin, 'config', 'set', `${prefix}.model`, SPEC.model],
    [hermesBin, 'config', 'set', `${prefix}.context_length`, String(SPEC.operationalContextLength)],
    [hermesBin, 'config', 'set', `${prefix}.discover_models`, 'false'],
    [hermesBin, 'config', 'set', `${prefix}.extra_body.reasoning_effort`, SPEC.reasoningEffort],
  ];
}

function isolatedCommands(hermesBin = 'hermes') {
  return [
    [hermesBin, 'config', 'set', 'model.provider', SPEC.hermesProvider],
    [hermesBin, 'config', 'set', 'model.default', SPEC.model],
    [hermesBin, 'config', 'set', 'model.context_length', String(SPEC.operationalContextLength)],
    [hermesBin, 'config', 'set', 'model.max_tokens', String(SPEC.operationalMaxTokens)],
    [hermesBin, 'config', 'set', 'agent.max_turns', String(SPEC.maxTurns)],
    [hermesBin, 'config', 'set', 'compression.enabled', 'false'],
    [hermesBin, 'config', 'set', 'fallback_providers', '[]'],
    [hermesBin, 'config', 'set', 'fallback_model', '{}'],
  ];
}

function buildCommands(args) {
  const commands = providerCommands(args.hermesBin);
  if (args.isolated || args.setDefault) {
    commands.push(
      [args.hermesBin, 'config', 'set', 'model.provider', SPEC.hermesProvider],
      [args.hermesBin, 'config', 'set', 'model.default', SPEC.model],
      [args.hermesBin, 'config', 'set', 'model.context_length', String(SPEC.operationalContextLength)],
      [args.hermesBin, 'config', 'set', 'model.max_tokens', String(SPEC.operationalMaxTokens)],
    );
  }
  if (args.isolated) {
    commands.push(...isolatedCommands(args.hermesBin).slice(4));
  }
  return commands;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function commandToString(command) {
  return command.map(shellQuote).join(' ');
}

function applyCommands(commands, hermesHome, env = process.env, spawn = spawnSync) {
  const results = [];
  for (const command of commands) {
    const [binary, ...args] = command;
    const result = spawn(binary, args, {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      env: { ...env, HERMES_HOME: hermesHome },
    });
    const item = {
      command: commandToString(command),
      status: result.status,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
      error: result.error ? result.error.message : null,
    };
    results.push(item);
    if (item.status !== 0) break;
  }
  return results;
}

function worstCaseCost(maxTurns = SPEC.maxTurns) {
  const oneTurn = (
    (SPEC.operationalContextLength * SPEC.pricing.perMillionTokens.input)
    + (SPEC.operationalMaxTokens * SPEC.pricing.perMillionTokens.output)
  ) / 1_000_000;
  return oneTurn * maxTurns;
}

function buildPlan(args, env = process.env) {
  const commands = buildCommands(args);
  return {
    schema: 'hermes-meta-muse-config/plan-v1',
    checkedAt: new Date().toISOString(),
    hermesHome: args.hermesHome,
    configPath: path.join(args.hermesHome, 'config.yaml'),
    isolated: args.isolated,
    setDefault: args.isolated || args.setDefault,
    provider: SPEC.provider,
    hermesProvider: SPEC.hermesProvider,
    model: SPEC.model,
    baseUrl: SPEC.baseUrl,
    apiKeyReference: `env:${SPEC.apiKeyEnv}`,
    apiKeyPresentInEnvironment: Boolean(env[SPEC.apiKeyEnv]),
    nativeContextLength: SPEC.nativeContextLength,
    operationalContextLength: SPEC.operationalContextLength,
    operationalMaxTokens: SPEC.operationalMaxTokens,
    maxTurns: args.isolated ? SPEC.maxTurns : null,
    worstCaseCostUsd: args.isolated ? Number(worstCaseCost().toFixed(6)) : null,
    fallbackProviders: args.isolated ? [] : 'unchanged',
    pricing: SPEC.pricing,
    commands,
    commandText: commands.map(commandToString),
    guarantees: [
      'No API key is written to config.yaml.',
      args.isolated
        ? 'The isolated profile has no main-model fallback route; Meta failures fail closed.'
        : 'The existing Hermes default provider and fallback chain are unchanged.',
      'The operational context and output budgets are intentionally smaller than the native 1M context window.',
    ],
  };
}

function render(plan, results) {
  const lines = [
    '# Hermes Meta Muse Spark config',
    '',
    `Home: ${plan.hermesHome}`,
    `Provider: ${plan.hermesProvider}`,
    `Model: ${plan.model}`,
    `API key: ${plan.apiKeyReference}`,
    `Isolated fail-closed profile: ${plan.isolated ? 'yes' : 'no'}`,
    `Worst-case default run: ${plan.worstCaseCostUsd == null ? 'n/a' : `$${plan.worstCaseCostUsd.toFixed(6)}`}`,
    '',
    '## Commands',
    '',
    ...plan.commandText.map((command) => `- ${command}`),
  ];
  if (results) {
    lines.push('', '## Apply', '');
    for (const result of results) {
      lines.push(`- ${result.status === 0 ? 'PASS' : 'FAIL'} ${result.command}`);
      if (result.error) lines.push(`  ${result.error}`);
      if (result.stderr) lines.push(`  ${result.stderr}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const plan = buildPlan(args);
  const results = args.apply ? applyCommands(plan.commands, plan.hermesHome) : null;
  if (args.json) console.log(JSON.stringify({ ...plan, applyResults: results }, null, 2));
  else process.stdout.write(render(plan, results));
  if (results && results.some((result) => result.status !== 0)) process.exit(1);
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
  SPEC,
  applyCommands,
  buildCommands,
  buildPlan,
  commandToString,
  isolatedCommands,
  parseArgs,
  providerCommands,
  shellQuote,
  worstCaseCost,
};
