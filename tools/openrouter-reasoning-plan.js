#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');

const usage = `Usage:
  node tools/openrouter-reasoning-plan.js [--effort high] [--model model-slug] [--json] [--out file]

Builds a provider-neutral reasoning configuration for Hermes/OpenRouter. The
point is one effort dial that can map to OpenAI-style effort, Anthropic-style
token budgets, and Google-style thinking enablement without rewriting agent
code for each provider.`;

function parseArgs(argv) {
  const args = {
    effort: process.env.HERMES_REASONING_EFFORT || 'high',
    model: process.env.HERMES_OPENROUTER_MODEL || '',
    json: false,
    out: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--effort') args.effort = requireValue(argv, ++i, '--effort');
    else if (arg === '--model') args.model = requireValue(argv, ++i, '--model');
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  args.effort = normalizeEffort(args.effort);
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function normalizeEffort(effort) {
  const value = String(effort || '').toLowerCase();
  if (!EFFORTS.includes(value)) {
    throw new Error(`Unsupported effort: ${effort}. Expected one of ${EFFORTS.join(', ')}`);
  }
  return value;
}

function maxTokensForEffort(effort) {
  return {
    none: 0,
    minimal: 256,
    low: 700,
    medium: 1600,
    high: 3200,
    xhigh: 6400,
  }[normalizeEffort(effort)];
}

function openRouterReasoning(effort) {
  const normalized = normalizeEffort(effort);
  if (normalized === 'none') {
    return { effort: 'none', enabled: false, exclude: false };
  }
  return { effort: normalized, enabled: true, exclude: false };
}

function providerNativeMappings(effort) {
  const normalized = normalizeEffort(effort);
  const maxTokens = maxTokensForEffort(normalized);
  return {
    openrouter: {
      reasoning: openRouterReasoning(normalized),
    },
    openai: {
      reasoning: { effort: normalized },
    },
    anthropic: {
      thinking: normalized === 'none'
        ? { type: 'disabled' }
        : { type: 'enabled', budget_tokens: maxTokens },
    },
    google: {
      thinking: { enabled: normalized !== 'none', budget_tokens: maxTokens },
    },
  };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function loadHermesConfig() {
  const py = path.join(os.homedir(), '.hermes/hermes-agent/venv/bin/python');
  if (!fs.existsSync(py)) return { error: 'Hermes Python runtime not found' };
  const result = run(py, ['-c', `
import json, pathlib, yaml
path = pathlib.Path.home() / ".hermes/config.yaml"
cfg = yaml.safe_load(path.read_text()) if path.exists() else {}
print(json.dumps({
  "model": (cfg or {}).get("model") or {},
  "fallback_providers": (cfg or {}).get("fallback_providers") or [],
}))
`]);
  if (result.status !== 0) return { error: (result.stderr || result.stdout || '').trim() };
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return { error: error.message };
  }
}

function hasOpenRouter(config) {
  const model = config.model || {};
  const fallbacks = Array.isArray(config.fallback_providers) ? config.fallback_providers : [];
  return String(model.provider || '').toLowerCase().includes('openrouter')
    || fallbacks.some((provider) => String(provider.provider || provider.base_url || '').toLowerCase().includes('openrouter'));
}

function buildPlan(options = {}) {
  const effort = normalizeEffort(options.effort || 'high');
  const config = options.config || loadHermesConfig();
  const model = options.model || (config.model && config.model.default) || '';
  const mappings = providerNativeMappings(effort);
  const findings = [];
  if (config.error) {
    findings.push({
      severity: 'medium',
      title: 'Hermes config could not be inspected',
      evidence: config.error,
      recommendation: 'Run this tool on a machine with Hermes installed before changing provider routing.',
    });
  } else if (!hasOpenRouter(config)) {
    findings.push({
      severity: 'low',
      title: 'OpenRouter is not configured as a Hermes provider or fallback',
      evidence: `model.provider=${(config.model || {}).provider || '<unset>'}`,
      recommendation: 'Add OpenRouter as a fallback for provider/model outages and normalize reasoning with one effort dial.',
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    effort,
    model,
    openRouterPayload: {
      model: model || 'your-model',
      messages: [],
      reasoning: mappings.openrouter.reasoning,
    },
    providerNativeMappings: mappings,
    hermesConfig: config,
    recommendedHermesPolicy: {
      reasoningEffortEnv: 'HERMES_REASONING_EFFORT',
      defaultEffort: effort,
      rule: 'Agents choose effort by task risk: minimal for classification, medium for normal coding, high/xhigh for multi-step debugging, CI failures, or user distrust loops.',
    },
    findings,
  };
}

function writeReport(plan, outFile) {
  const target = outFile || path.join(DEFAULT_OUT_DIR, 'openrouter-reasoning-plan.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`);
  return target;
}

function render(plan) {
  const lines = [
    '# OpenRouter Reasoning Plan',
    '',
    `Effort: ${plan.effort}`,
    `Model: ${plan.model || '<unset>'}`,
    '',
    '## OpenRouter Payload',
    '',
    '```json',
    JSON.stringify(plan.openRouterPayload, null, 2),
    '```',
    '',
    '## Provider Native Mappings',
    '',
    `- OpenAI effort: ${plan.providerNativeMappings.openai.reasoning.effort}`,
    `- Anthropic thinking budget: ${plan.providerNativeMappings.anthropic.thinking.budget_tokens || 0}`,
    `- Google thinking enabled: ${plan.providerNativeMappings.google.thinking.enabled}`,
    '',
  ];
  if (plan.findings.length > 0) {
    lines.push('## Findings', '');
    for (const finding of plan.findings) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Next: ${finding.recommendation}`);
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
  const out = args.out ? writeReport(plan, args.out) : null;
  if (args.json) {
    console.log(JSON.stringify({ ...plan, outputPath: out }, null, 2));
  } else {
    process.stdout.write(render(plan));
    if (out) console.log(`Report: ${out}`);
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
  buildPlan,
  maxTokensForEffort,
  normalizeEffort,
  openRouterReasoning,
  providerNativeMappings,
  render,
};
