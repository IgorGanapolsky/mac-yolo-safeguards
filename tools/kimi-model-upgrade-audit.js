#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RECOMMENDED_PROVIDER = 'kimi-coding';
const RECOMMENDED_MODEL = 'kimi-k2.7-code';
const LEGACY_KIMI_MODELS = new Set(['kimi-k2.6', 'kimi-k2.7']);
const MIN_CONTEXT = 256000;

const usage = `Usage:
  node tools/kimi-model-upgrade-audit.js [--json] [--config path]

Audits whether Hermes is ready to use Kimi K2.7 Code as a high-context coding
fallback without blindly switching the primary model.`;

function parseArgs(argv) {
  const args = { json: false, config: path.join(os.homedir(), '.hermes/config.yaml'), help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--config') args.config = path.resolve(requireValue(argv, ++i, arg));
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
  return fallbacks.filter((provider) => String(provider.provider || '').toLowerCase().includes('kimi')
    || String(provider.model || '').toLowerCase().includes('kimi'));
}

function scoreCandidate(provider) {
  const model = String(provider.model || '');
  let score = 0;
  if (String(provider.provider || '') === RECOMMENDED_PROVIDER) score += 20;
  if (model === RECOMMENDED_MODEL) score += 45;
  else if (/kimi-k2\.7/.test(model)) score += 30;
  else if (/kimi-k2\.6/.test(model)) score += 10;
  if (Number(provider.context_length || 0) >= MIN_CONTEXT) score += 25;
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

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence, recommendation });
}

function collect(options = {}) {
  const loaded = options.config ? { config: options.config } : loadConfig(options.configPath || path.join(os.homedir(), '.hermes/config.yaml'));
  const config = loaded.config || {};
  const findings = [];
  const candidates = kimiFallbacks(config).map((provider) => ({
    provider: provider.provider || '',
    model: provider.model || '',
    contextLength: Number(provider.context_length || 0),
    baseUrl: provider.base_url || '',
    apiMode: provider.api_mode || '',
    score: scoreCandidate(provider),
    recommended: provider.provider === RECOMMENDED_PROVIDER && provider.model === RECOMMENDED_MODEL,
    legacy: LEGACY_KIMI_MODELS.has(provider.model),
  }));
  const best = candidates.slice().sort((a, b) => b.score - a.score)[0] || null;

  if (loaded.error) {
    addFinding(findings, 'medium', 'Hermes config could not be inspected', loaded.error, 'Run this audit on a Hermes host with readable config.yaml.');
  }
  if (candidates.length === 0) {
    addFinding(
      findings,
      'high',
      'No Kimi coding fallback is configured',
      'fallback_providers contains no Kimi provider/model.',
      `Add a fallback candidate: ${JSON.stringify(recommendedFallback())}.`
    );
  } else if (!candidates.some((candidate) => candidate.recommended)) {
    addFinding(
      findings,
      'medium',
      'Kimi K2.7 Code is not configured as a fallback candidate',
      `configured=${candidates.map((candidate) => `${candidate.provider}/${candidate.model}`).join(', ')}`,
      `Add ${RECOMMENDED_PROVIDER}/${RECOMMENDED_MODEL} as a fallback candidate and benchmark before promoting it to primary.`
    );
  }
  for (const candidate of candidates) {
    if (candidate.legacy) {
      addFinding(
        findings,
        'low',
        'Legacy Kimi fallback is still present',
        `${candidate.provider}/${candidate.model}`,
        `Keep only as a rollback after ${RECOMMENDED_MODEL} passes repo-local benchmarks.`
      );
    }
    if (candidate.contextLength < MIN_CONTEXT) {
      addFinding(
        findings,
        'medium',
        'Kimi fallback context is below the high-ROI floor',
        `${candidate.provider}/${candidate.model} context_length=${candidate.contextLength || '<missing>'}`,
        `Set context_length >= ${MIN_CONTEXT} for long-horizon Hermes coding sessions.`
      );
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    recommended: recommendedFallback(),
    currentPrimary: config.model || {},
    candidates,
    best,
    score: best ? best.score : 0,
    promotionPolicy: {
      rule: 'Use Kimi K2.7 Code as a fallback candidate until it passes repo-local coding, vision, Graphify/RAG, and CI-fix benchmarks. Do not replace the primary model on social proof alone.',
      requiredEvidence: [
        'tools/kimi-model-upgrade-audit.js score >= 90',
        'scripts/kimi_hermes_bridge.py doctor succeeds',
        'scripts/ci-verify.sh passes after a Kimi-generated patch',
        'Hermes productivity audit remains GO',
      ],
    },
    findings,
  };
}

function render(report) {
  const lines = [
    '# Kimi Model Upgrade Audit',
    '',
    `Recommended: ${report.recommended.provider}/${report.recommended.model}`,
    `Score: ${report.score}/100`,
    `Best current candidate: ${report.best ? `${report.best.provider}/${report.best.model}` : '<none>'}`,
    '',
    '## Candidates',
    '',
  ];
  if (report.candidates.length === 0) {
    lines.push('- none');
  } else {
    for (const candidate of report.candidates) {
      lines.push(`- ${candidate.provider}/${candidate.model} context=${candidate.contextLength || '<missing>'} score=${candidate.score}`);
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
  const report = collect({ configPath: args.config });
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
  collect,
  parseArgs,
  recommendedFallback,
  render,
  scoreCandidate,
};
