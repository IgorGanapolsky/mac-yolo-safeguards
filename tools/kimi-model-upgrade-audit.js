#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RECOMMENDED_PROVIDER = 'kimi-coding';
const RECOMMENDED_MODEL = 'kimi-k2.7-code';
/** July 2026 open-weight flagship — API opt-in only; never local on Mac Pro/mini. */
const FRONTIER_K3_MODEL = 'kimi-k3';
const FRONTIER_K3_CONTEXT = 1000000;
const FRONTIER_K3_GATEWAY_ALIASES = ['kimi-k3', 'kimi-code-k3', 'kimi-code-k3-256k'];
const LEGACY_KIMI_MODELS = new Set(['kimi-k2.6', 'kimi-k2.7']);
const MIN_CONTEXT = 256000;
const DEFAULT_GATEWAY = process.env.HERMES_LITELLM_URL || 'http://127.0.0.1:4010';

const usage = `Usage:
  node tools/kimi-model-upgrade-audit.js [--json] [--config path] [--gateway-url URL]

Audits whether Hermes is ready to use Kimi K2.7 Code as a high-context coding
fallback, and whether Kimi K3 (1M ctx / open-weight 2.8T) is wired as opt-in
gateway routes — without blindly switching the primary model.`;

function parseArgs(argv) {
  const args = {
    json: false,
    config: path.join(os.homedir(), '.hermes/config.yaml'),
    help: false,
    gatewayUrl: DEFAULT_GATEWAY,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--config') args.config = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--gateway-url') args.gatewayUrl = requireValue(argv, ++i, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { error: `missing config: ${configPath}`, config: {} };
  }
  const result = run('python3', ['-c', `
import json, pathlib, sys, yaml
path = pathlib.Path(sys.argv[1])
cfg = yaml.safe_load(path.read_text()) or {}
print(json.dumps({
  "model": cfg.get("model") or {},
  "fallback_providers": cfg.get("fallback_providers") or [],
}))
`, configPath]);
  if (result.status !== 0) {
    return { error: (result.stderr || result.stdout || '').trim(), config: {} };
  }
  try {
    return { config: JSON.parse(result.stdout) };
  } catch (error) {
    return { error: error.message, config: {} };
  }
}

function kimiFallbacks(config) {
  const fallbacks = Array.isArray(config.fallback_providers) ? config.fallback_providers : [];
  return fallbacks.filter((provider) => {
    const p = String(provider.provider || '').toLowerCase();
    const m = String(provider.model || '').toLowerCase();
    return p.includes('kimi') || m.includes('kimi') || /^k3(-|$)/.test(m);
  });
}

function scoreCandidate(provider) {
  const model = String(provider.model || '');
  let score = 0;
  if (String(provider.provider || '') === RECOMMENDED_PROVIDER) score += 20;
  if (model === RECOMMENDED_MODEL) score += 45;
  else if (/kimi-k2\.7/.test(model)) score += 30;
  else if (/kimi-k2\.6/.test(model)) score += 10;
  // K3 is frontier long-horizon — score high for context but do not outrank K2.7 Code for daily coding ROI
  else if (model === FRONTIER_K3_MODEL || model === 'k3' || model === 'kimi-code-k3') score += 35;
  if (Number(provider.context_length || 0) >= FRONTIER_K3_CONTEXT) score += 30;
  else if (Number(provider.context_length || 0) >= MIN_CONTEXT) score += 25;
  if (!provider.base_url) score += 5;
  if (provider.api_mode === 'chat_completions') score += 5;
  return Math.min(100, score);
}

function recommendedFallback() {
  return {
    provider: RECOMMENDED_PROVIDER,
    model: RECOMMENDED_MODEL,
    context_length: MIN_CONTEXT,
  };
}

function frontierK3OptIn() {
  return {
    model: FRONTIER_K3_MODEL,
    context_length: FRONTIER_K3_CONTEXT,
    gateway_aliases: FRONTIER_K3_GATEWAY_ALIASES.slice(),
    weights: 'https://huggingface.co/moonshotai/Kimi-K3',
    note:
      '2.8T MoE open-weight — API only on Mac Pro/mini; never auto-primary; ' +
      'Moonshot top-up required for kimi-k3; membership quota for kimi-code-k3',
  };
}

function probeGatewayModels(gatewayUrl) {
  const base = String(gatewayUrl || DEFAULT_GATEWAY).replace(/\/+$/, '');
  const result = run(
    'curl',
    ['-sS', '--max-time', '4', '-H', 'Accept: application/json', `${base}/v1/models`],
    { timeout: 6000 },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || 'curl failed').slice(0, 160),
      modelIds: [],
    };
  }
  try {
    const body = JSON.parse(result.stdout || '{}');
    const modelIds = Array.isArray(body.data)
      ? body.data.map((m) => m.id).filter(Boolean)
      : [];
    return { ok: true, modelIds, error: null };
  } catch (error) {
    return { ok: false, error: error.message, modelIds: [] };
  }
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence, recommendation });
}

function collect(options = {}) {
  const loaded = options.config
    ? { config: options.config }
    : loadConfig(options.configPath || path.join(os.homedir(), '.hermes/config.yaml'));
  const config = loaded.config || {};
  const findings = [];
  const candidates = kimiFallbacks(config).map((provider) => ({
    provider: provider.provider || '',
    model: provider.model || '',
    contextLength: Number(provider.context_length || 0),
    baseUrl: provider.base_url || '',
    apiMode: provider.api_mode || '',
    score: scoreCandidate(provider),
    recommended:
      provider.provider === RECOMMENDED_PROVIDER && provider.model === RECOMMENDED_MODEL,
    legacy: LEGACY_KIMI_MODELS.has(provider.model),
    frontierK3: /k3/i.test(String(provider.model || '')),
  }));
  const best = candidates.slice().sort((a, b) => b.score - a.score)[0] || null;

  if (loaded.error) {
    addFinding(
      findings,
      'medium',
      'Hermes config could not be inspected',
      loaded.error,
      'Run this audit on a Hermes host with readable config.yaml.',
    );
  }
  if (candidates.length === 0) {
    addFinding(
      findings,
      'high',
      'No Kimi coding fallback is configured',
      'fallback_providers contains no Kimi provider/model.',
      `Add a fallback candidate: ${JSON.stringify(recommendedFallback())}.`,
    );
  } else if (!candidates.some((candidate) => candidate.recommended)) {
    addFinding(
      findings,
      'medium',
      'Kimi K2.7 Code is not configured as a fallback candidate',
      `configured=${candidates.map((c) => `${c.provider}/${c.model}`).join(', ')}`,
      `Add ${RECOMMENDED_PROVIDER}/${RECOMMENDED_MODEL} as a fallback candidate and benchmark before promoting it to primary.`,
    );
  }
  for (const candidate of candidates) {
    if (candidate.legacy) {
      addFinding(
        findings,
        'low',
        'Legacy Kimi fallback is still present',
        `${candidate.provider}/${candidate.model}`,
        `Keep only as a rollback after ${RECOMMENDED_MODEL} passes repo-local benchmarks.`,
      );
    }
    if (candidate.frontierK3 && candidate.contextLength < FRONTIER_K3_CONTEXT) {
      addFinding(
        findings,
        'low',
        'Kimi K3 fallback context under-declared vs 1M window',
        `${candidate.provider}/${candidate.model} context_length=${candidate.contextLength || '<missing>'}`,
        `Set context_length >= ${FRONTIER_K3_CONTEXT} for K3 long-horizon sessions (still opt-in only).`,
      );
    } else if (!candidate.frontierK3 && candidate.contextLength < MIN_CONTEXT) {
      addFinding(
        findings,
        'medium',
        'Kimi fallback context is below the high-ROI floor',
        `${candidate.provider}/${candidate.model} context_length=${candidate.contextLength || '<missing>'}`,
        `Set context_length >= ${MIN_CONTEXT} for long-horizon Hermes coding sessions.`,
      );
    }
  }

  let gateway = { ok: false, modelIds: [], error: 'skipped' };
  if (options.skipGateway !== true) {
    gateway = probeGatewayModels(options.gatewayUrl || DEFAULT_GATEWAY);
    if (!gateway.ok) {
      addFinding(
        findings,
        'medium',
        'LiteLLM gateway unreachable for Kimi route probe',
        gateway.error || 'unreachable',
        'Ensure com.igor.hermes-litellm is running on this host (port 4010).',
      );
    } else {
      const present = FRONTIER_K3_GATEWAY_ALIASES.filter((id) =>
        gateway.modelIds.includes(id),
      );
      const missing = FRONTIER_K3_GATEWAY_ALIASES.filter(
        (id) => !gateway.modelIds.includes(id),
      );
      if (missing.length) {
        addFinding(
          findings,
          'medium',
          'Kimi K3 gateway aliases not fully wired',
          `missing=${missing.join(', ')}; present=${present.join(',') || 'none'}`,
          'Add kimi-k3 / kimi-code-k3 / kimi-code-k3-256k to hermes-eval/litellm/config.yaml and restart LiteLLM. OPT-IN by name only.',
        );
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    recommended: recommendedFallback(),
    frontierK3: frontierK3OptIn(),
    currentPrimary: config.model || {},
    candidates,
    best,
    score: best ? best.score : 0,
    gateway: {
      url: options.gatewayUrl || DEFAULT_GATEWAY,
      ok: gateway.ok,
      kimiRoutes: (gateway.modelIds || []).filter((id) => /kimi|k3/i.test(id)),
      k3Wired: FRONTIER_K3_GATEWAY_ALIASES.every((id) =>
        (gateway.modelIds || []).includes(id),
      ),
    },
    promotionPolicy: {
      rule:
        'Use Kimi K2.7 Code as the coding fallback candidate until repo-local benchmarks pass. ' +
        'Kimi K3 (2.8T / 1M ctx) is OPT-IN by gateway name only — never auto-primary, never local weights on Mac Pro/mini. ' +
        'Do not promote on social proof alone.',
      requiredEvidence: [
        'tools/kimi-model-upgrade-audit.js score >= 90 (coding fallback)',
        'gateway lists kimi-k3 + kimi-code-k3 aliases',
        'live completion succeeds after Moonshot top-up or Kimi Code quota refresh',
        'scripts/ci-verify.sh passes after a Kimi-generated patch',
        'Hermes productivity audit remains GO',
      ],
      antiPatterns: [
        'Downloading moonshotai/Kimi-K3 weights onto a laptop',
        'Adding kimi-k3 to auto-fallback chains while per-token / suspended',
        'Replacing glm-coding primary because Threads said open source',
      ],
    },
    findings,
  };
}

function render(report) {
  const lines = [
    '# Kimi Model Upgrade Audit',
    '',
    `Recommended coding fallback: ${report.recommended.provider}/${report.recommended.model}`,
    `Frontier K3 (opt-in): ${report.frontierK3.model} ctx=${report.frontierK3.context_length}`,
    `Score: ${report.score}/100`,
    `Best current candidate: ${report.best ? `${report.best.provider}/${report.best.model}` : '<none>'}`,
    `Gateway K3 wired: ${report.gateway?.k3Wired ? 'yes' : 'no'} (${(report.gateway?.kimiRoutes || []).join(', ') || 'none'})`,
    '',
    '## Candidates',
    '',
  ];
  if (report.candidates.length === 0) {
    lines.push('- none');
  } else {
    for (const candidate of report.candidates) {
      lines.push(
        `- ${candidate.provider}/${candidate.model} context=${candidate.contextLength || '<missing>'} score=${candidate.score}`,
      );
    }
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '');
    for (const finding of report.findings) {
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
  const report = collect({ configPath: args.config, gatewayUrl: args.gatewayUrl });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(render(report));
  if (report.findings.some((finding) => finding.severity === 'high')) {
    process.exitCode = 1;
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
  RECOMMENDED_MODEL,
  FRONTIER_K3_MODEL,
  FRONTIER_K3_GATEWAY_ALIASES,
  collect,
  parseArgs,
  recommendedFallback,
  frontierK3OptIn,
  render,
  scoreCandidate,
};
