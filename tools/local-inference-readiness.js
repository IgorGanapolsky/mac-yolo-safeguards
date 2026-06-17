#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/local-inference-readiness.js [--json]

Checks whether Hermes has a real local inference fallback, not just a configured
URL. It verifies configured fallback providers plus common serious-serving
endpoints such as vLLM/LocalAI at http://127.0.0.1:8000/v1.`;

function parseArgs(argv) {
  const args = { json: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function loadHermesConfig() {
  const result = run(`${process.env.HOME}/.hermes/hermes-agent/venv/bin/python`, ['-c', `
import json, pathlib, yaml
cfg = yaml.safe_load(pathlib.Path.home().joinpath(".hermes/config.yaml").read_text()) or {}
print(json.dumps({
  "model": cfg.get("model") or {},
  "fallback_providers": cfg.get("fallback_providers") or [],
  "terminal": cfg.get("terminal") or {},
}))
`]);
  if (result.status !== 0) {
    return { error: (result.stderr || result.stdout || '').trim() || `python exited ${result.status}` };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return { error: error.message };
  }
}

async function fetchJson(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = null;
    }
    return {
      reachable: response.ok,
      status: response.status,
      json,
      bodyPreview: json ? undefined : text.slice(0, 160),
    };
  } catch (error) {
    return { reachable: false, error: error.name, message: String(error.message || error).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function checkOpenAIBase(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return { reachable: false, error: 'missing_base_url' };
  return fetchJson(`${normalized}/models`);
}

async function collect() {
  const config = loadHermesConfig();
  const fallbacks = Array.isArray(config.fallback_providers) ? config.fallback_providers : [];
  const configuredChecks = [];
  for (const provider of fallbacks) {
    const baseUrl = normalizeBaseUrl(provider.base_url);
    const check = await checkOpenAIBase(baseUrl);
    const models = check.json && Array.isArray(check.json.data)
      ? check.json.data.map((model) => model.id).filter(Boolean)
      : [];
    configuredChecks.push({
      provider: provider.provider || '',
      model: provider.model || '',
      baseUrl,
      contextLength: provider.context_length || null,
      reachable: Boolean(check.reachable),
      status: check.status || null,
      error: check.error || null,
      modelAvailable: provider.model ? models.includes(provider.model) : null,
      modelCount: models.length,
      models: models.slice(0, 12),
    });
  }

  const ollama = await fetchJson('http://127.0.0.1:11434/api/tags');
  const vllmBase = process.env.HERMES_VLLM_BASE_URL || 'http://127.0.0.1:8000/v1';
  const vllm = await checkOpenAIBase(vllmBase);

  // Check Apple Foundation Models Swift integration
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const arch = os.arch();
  const swiftArch = arch === 'x64' ? 'x86_64' : arch;
  const appleClientPath = path.join(__dirname, 'apple-foundation-client/.build', `${swiftArch}-apple-macosx`, 'release/apple-foundation-client');
  const hasAppleClient = fs.existsSync(appleClientPath);
  let appleClientRuns = false;
  let appleClientError = null;

  if (hasAppleClient) {
    const result = run(appleClientPath, ['--help']);
    if (result.status === 0 || (result.stderr && result.stderr.includes('Usage:')) || (result.stdout && result.stdout.includes('Usage:'))) {
      appleClientRuns = true;
    } else {
      appleClientError = (result.stderr || result.stdout || '').trim();
    }
  }

  const findings = [];
  if (configuredChecks.length === 0) {
    findings.push({
      severity: 'medium',
      title: 'No Hermes fallback providers configured',
      evidence: 'fallback_providers is empty.',
      recommendation: 'Configure at least one local OpenAI-compatible fallback endpoint.',
    });
  }
  for (const check of configuredChecks) {
    if (!check.reachable) {
      findings.push({
        severity: 'medium',
        title: 'Configured fallback endpoint is unreachable',
        evidence: `${check.baseUrl} ${check.error || `status=${check.status || 'unknown'}`}`,
        recommendation: 'Start the local runtime or change fallback_providers to a reachable endpoint.',
      });
    } else if (check.model && check.modelAvailable === false) {
      findings.push({
        severity: 'medium',
        title: 'Configured fallback model is not advertised by the endpoint',
        evidence: `model=${check.model}; endpoint=${check.baseUrl}; advertised=${check.models.join(', ') || '<none>'}`,
        recommendation: 'Install/load that model or update the configured fallback model.',
      });
    }
  }
  if (!vllm.reachable) {
    findings.push({
      severity: 'low',
      title: 'No serious local serving endpoint detected on vLLM default port',
      evidence: `${vllmBase}/models is not reachable.`,
      recommendation: 'For production-style local inference, evaluate vLLM/LocalAI behind an OpenAI-compatible /v1 endpoint with metrics and concurrency.',
    });
  }
  if (!hasAppleClient) {
    findings.push({
      severity: 'low',
      title: 'Apple Foundation Models integration client not compiled',
      evidence: 'apple-foundation-client binary not found in release build directory.',
      recommendation: 'Run swift build -c release in tools/apple-foundation-client to compile.',
    });
  } else if (!appleClientRuns) {
    findings.push({
      severity: 'medium',
      title: 'Apple Foundation Models integration client execution failed',
      evidence: appleClientError || 'Unknown execution failure',
      recommendation: 'Rebuild the Swift client or verify SDK dependencies.',
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    config,
    checks: {
      configuredFallbacks: configuredChecks,
      ollama: {
        reachable: Boolean(ollama.reachable),
        modelCount: ollama.json && Array.isArray(ollama.json.models) ? ollama.json.models.length : 0,
        error: ollama.error || null,
      },
      seriousServer: {
        baseUrl: vllmBase,
        reachable: Boolean(vllm.reachable),
        status: vllm.status || null,
        error: vllm.error || null,
      },
      appleFoundationClient: {
        compiled: hasAppleClient,
        runs: appleClientRuns,
        error: appleClientError,
      },
    },
    findings,
  };
}

function render(result) {
  const lines = [];
  lines.push('# Local Inference Readiness');
  lines.push('');
  lines.push(`Checked: ${result.checkedAt}`);
  lines.push(`Configured fallback providers: ${result.checks.configuredFallbacks.length}`);
  for (const check of result.checks.configuredFallbacks) {
    lines.push(`- ${check.baseUrl}: ${check.reachable ? 'reachable' : 'unreachable'} / model ${check.model || '<unset>'}${check.modelAvailable === true ? ' available' : check.modelAvailable === false ? ' not advertised' : ''}`);
  }
  lines.push(`- Ollama API: ${result.checks.ollama.reachable ? 'reachable' : 'not reachable'} (${result.checks.ollama.modelCount} model(s))`);
  lines.push(`- Serious OpenAI-compatible server: ${result.checks.seriousServer.reachable ? 'reachable' : 'not reachable'} at ${result.checks.seriousServer.baseUrl}`);
  lines.push(`- Apple Foundation Models client: ${result.checks.appleFoundationClient.compiled ? (result.checks.appleFoundationClient.runs ? 'compiled and runs' : 'compiled but execution failed') : 'not compiled'}`);
  lines.push('');
  if (result.findings.length === 0) {
    lines.push('No findings.');
  } else {
    for (const finding of result.findings) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Next: ${finding.recommendation}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const result = await collect();
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(render(result));
  if (result.findings.some((finding) => finding.severity === 'medium' || finding.severity === 'high' || finding.severity === 'critical')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}

module.exports = { collect, render };
