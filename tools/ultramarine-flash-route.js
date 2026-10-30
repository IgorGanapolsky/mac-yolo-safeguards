#!/usr/bin/env node
'use strict';

/**
 * Fail-closed route for Paper Instruments Ultramarine 1 Flash.
 *
 * Weights: https://huggingface.co/paperinstruments/Ultramarine-1-Flash
 * This file never downloads them. Hugging Face has no inference provider
 * deployed for the repo, and the local serve command needs four B300 GPUs.
 *
 * Call order when a credential exists:
 *   1. Paper Instruments API  ultramarine-1-flash
 *   2. Fireworks serverless   accounts/fireworks/models/ultramarine-1-flash-us
 *   3. Baseten, only when both a key and an https deployment URL are set
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WEIGHTS_REPO = 'paperinstruments/Ultramarine-1-Flash';
const MODEL_ID = 'ultramarine-1-flash';
const MODEL_CARD_CONTEXT_TOKENS = 1048576;
const OPERATIONAL_COMPACTION_TOKENS = 131072;
const OPERATIONAL_COMPACTION_TRIGGER_TOKENS = 101072;
const MAX_COMPLETION_TOKENS = 65536;
const MIN_COMPLETION_TOKENS = 32768;

const PROVIDERS = [
  {
    id: 'ultramarine-api',
    priority: 1,
    endpoint: 'https://api.paperinstruments.com/v1/chat/completions',
    model: MODEL_ID,
    envKeys: ['PAPERINSTRUMENTS_API_KEY'],
    keychain: { service: 'secure-yolo:PAPERINSTRUMENTS_API_KEY', account: 'iganapolsky@gmail.com' },
    vendorRatesPerMillionUsd: { input: 0.15, cachedInput: 0.03, output: 0.5 },
    rateSource: 'https://www.paperinstruments.com/ultramarine',
  },
  {
    id: 'fireworks',
    priority: 2,
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    model: 'accounts/fireworks/models/ultramarine-1-flash-us',
    envKeys: ['FIREWORKS_API_KEY'],
    keychain: { service: 'FIREWORKS_API_KEY', account: 'hermes-fleet' },
    vendorRatesPerMillionUsd: { input: 0.225, cachedInput: 0.045, output: 0.75 },
    rateSource: 'https://fireworks.ai/models/fireworks/ultramarine-1-flash-us',
  },
  {
    id: 'baseten',
    priority: 3,
    endpoint: null,
    model: 'baseten/ultramarine-1-flash',
    envKeys: ['BASETEN_API_KEY'],
    baseUrlEnv: 'BASETEN_ULTRAMARINE_BASE_URL',
    keychain: { service: 'BASETEN_API_KEY', account: 'hermes-fleet' },
    vendorRatesPerMillionUsd: null,
    rateSource: 'https://www.baseten.co/library/ultramarine-1-flash/',
  },
];

const KNOWLEDGE_WORK = /\b(10-k|10-q|10k|10q|earnings|ebitda|workbook|powerpoint|slide deck|memo|diligence|consulting|operations|invoice|ledger|reconcil|spreadsheet|knowledge work|financial model|balance sheet|income statement)\b/i;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function dotenvHas(key, env) {
  if (env && env.ULTRAMARINE_SKIP_DOTENV === '1') return false;
  try {
    const text = fs.readFileSync(path.join(os.homedir(), '.hermes', '.env'), 'utf8');
    const match = text.match(new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=(.*)$', 'm'));
    if (!match) return false;
    return nonEmpty(match[1].trim().replace(/^['"]|['"]$/g, ''));
  } catch {
    return false;
  }
}

function keychainHas(item, env, probe) {
  if (!item || env.ULTRAMARINE_SKIP_KEYCHAIN === '1') return false;
  const run = probe || defaultKeychainProbe;
  try {
    return run(item) === true;
  } catch {
    return false;
  }
}

function defaultKeychainProbe(item) {
  const result = spawnSync(
    '/usr/bin/security',
    ['find-generic-password', '-s', item.service, '-a', item.account],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

function httpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim());
}

function providerConfigured(provider, env, credentials, probe) {
  const creds = credentials || {};
  if (provider.id === 'baseten') {
    const base = creds.basetenBaseUrl || env.BASETEN_ULTRAMARINE_BASE_URL;
    if (!httpsUrl(base)) return false;
    if (creds.baseten === true || creds['baseten'] === true) return true;
    if (provider.envKeys.some((key) => nonEmpty(env[key]) || dotenvHas(key, env))) return true;
    return keychainHas(provider.keychain, env, probe);
  }
  if (creds[provider.id] === true) return true;
  if (provider.envKeys.some((key) => nonEmpty(env[key]) || dotenvHas(key, env))) return true;
  return keychainHas(provider.keychain, env, probe);
}

function publicProvider(provider, env, credentials) {
  const creds = credentials || {};
  const endpoint = provider.id === 'baseten'
    ? String(creds.basetenBaseUrl || env.BASETEN_ULTRAMARINE_BASE_URL || '').trim()
    : provider.endpoint;
  return {
    id: provider.id,
    priority: provider.priority,
    endpoint,
    model: provider.model,
    vendorRatesPerMillionUsd: provider.vendorRatesPerMillionUsd,
    rateSource: provider.rateSource,
  };
}

function contextReport(task) {
  const inputTokens = Math.max(0, Number(task.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(task.outputTokens) || 0);
  const total = inputTokens + outputTokens;
  return {
    modelCardTokens: MODEL_CARD_CONTEXT_TOKENS,
    modelCardSource: 'https://huggingface.co/paperinstruments/Ultramarine-1-Flash',
    trainingContextTokens: OPERATIONAL_COMPACTION_TOKENS,
    operationalCompactionTokens: OPERATIONAL_COMPACTION_TOKENS,
    operationalCompactionTriggerTokens: OPERATIONAL_COMPACTION_TRIGGER_TOKENS,
    fireworksListedContext: '1040k on the Fireworks model page; fit uses the weights card',
    fitsModelCard: total <= MODEL_CARD_CONTEXT_TOKENS,
    fitsOperationalCompaction: total <= OPERATIONAL_COMPACTION_TOKENS,
    inputTokens,
    outputTokens,
  };
}

function readyList(env, credentials, probe) {
  return PROVIDERS.filter((provider) => providerConfigured(provider, env, credentials, probe));
}

function baseReport(env, credentials, probe) {
  const ready = readyList(env, credentials, probe);
  return {
    huggingfaceRepo: WEIGHTS_REPO,
    weightsUrl: 'https://huggingface.co/' + WEIGHTS_REPO,
    weightsDownloaded: false,
    downloadRefused: true,
    totalParamsB: 320,
    activeParamsB: 18,
    called: false,
    measuredSavingsPct: null,
    failoverChain: PROVIDERS.map((provider) => provider.id),
    providers: PROVIDERS.map((provider) => ({
      ...publicProvider(provider, env, credentials),
      configured: ready.some((item) => item.id === provider.id),
    })),
    configuredCount: ready.length,
    context: contextReport({}),
  };
}

function routeUltramarineTask(task = {}, env = process.env, probe) {
  const report = baseReport(env, task.credentials, probe);
  report.context = contextReport(task);
  if (task.downloadWeights === true) {
    return { ...report, ok: false, status: 'download_refused', selectedProvider: null };
  }

  const ready = readyList(env, task.credentials, probe);
  const text = String(task.task || task.text || '');
  const knowledgeWork = task.knowledgeWork === true || task.force === true || KNOWLEDGE_WORK.test(text);
  const preferred = task.preferredProvider ? PROVIDERS.find((provider) => provider.id === task.preferredProvider) : null;

  let status = 'not_configured';
  let selected = null;
  if (task.preferredProvider && !preferred) {
    status = 'unknown_provider';
  } else if (!ready.length || (preferred && !ready.some((provider) => provider.id === preferred.id))) {
    status = 'not_configured';
  } else if (!knowledgeWork) {
    status = 'not_knowledge_work';
  } else {
    const tokens = (Number(task.inputTokens) || 0) + (Number(task.outputTokens) || 0);
    if ((task.inputTokens != null || task.outputTokens != null) && tokens > MODEL_CARD_CONTEXT_TOKENS) {
      status = 'context_overflow';
    } else {
      selected = preferred || ready[0];
      status = 'ready';
    }
  }

  return {
    ...report,
    ok: status === 'ready',
    status,
    knowledgeWork,
    selectedProvider: selected ? publicProvider(selected, env, task.credentials) : null,
  };
}

function buildChatBody(task, provider) {
  const requested = Number(task.maxCompletionTokens);
  const maxCompletionTokens = Number.isFinite(requested)
    ? Math.max(MIN_COMPLETION_TOKENS, Math.min(MAX_COMPLETION_TOKENS, Math.floor(requested)))
    : MAX_COMPLETION_TOKENS;
  return {
    model: provider.model,
    messages: Array.isArray(task.messages) && task.messages.length
      ? task.messages
      : [{ role: 'user', content: String(task.task || task.text || '') }],
    temperature: 1,
    top_p: 0.95,
    reasoning_effort: 'max',
    max_completion_tokens: maxCompletionTokens,
  };
}

function tokenFor(provider, env, deps) {
  if (deps && typeof deps.tokenFor === 'function') return deps.tokenFor(provider.id);
  const key = provider.envKeys.find((name) => nonEmpty(env[name]));
  return key ? env[key].trim() : '';
}

async function dispatchUltramarine(task, env = process.env, deps = {}) {
  const route = routeUltramarineTask(task, env, deps.keychainProbe);
  if (!route.ok || !route.selectedProvider) return { ...route, called: false };
  if (typeof deps.fetch !== 'function') return { ...route, called: false };

  const ready = readyList(env, task.credentials, deps.keychainProbe);
  const start = ready.findIndex((provider) => provider.id === route.selectedProvider.id);
  const attempts = [];
  for (const provider of ready.slice(start)) {
    const view = publicProvider(provider, env, task.credentials);
    const token = tokenFor(provider, env, deps);
    if (!nonEmpty(token) || !httpsUrl(view.endpoint)) {
      attempts.push({ id: provider.id, called: false });
      continue;
    }
    const response = await deps.fetch(view.endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildChatBody(task, view)),
    });
    const httpStatus = Number(response && response.status);
    attempts.push({ id: provider.id, called: true, httpStatus });
    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        ...route,
        ok: true,
        status: 'called',
        called: true,
        selectedProvider: view,
        httpStatus,
        attempts,
        authorization: 'redacted',
      };
    }
  }

  return {
    ...route,
    ok: false,
    status: 'provider_error',
    called: attempts.some((attempt) => attempt.called),
    attempts,
    authorization: 'redacted',
  };
}

function formatStatus(report) {
  const lines = [
    report.configuredCount
      ? 'Ultramarine 1 Flash has a configured provider. No request was sent.'
      : 'Ultramarine 1 Flash route is not configured.',
    'Weights stay at ' + report.huggingfaceRepo + ' and were not downloaded.',
    'Order: Paper Instruments API, then Fireworks accounts/fireworks/models/ultramarine-1-flash-us, then a Baseten https deployment URL.',
    'Model card context is ' + report.context.modelCardTokens + ' tokens. This harness compacts at ' + report.context.operationalCompactionTokens + '.',
  ];
  for (const provider of report.providers) {
    lines.push(provider.id + ': ' + (provider.configured ? 'configured' : 'absent'));
  }
  if (report.status && report.status !== 'not_configured') lines.push('Task status: ' + report.status);
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const taskFlag = argv.indexOf('--task');
  const task = taskFlag >= 0 ? argv[taskFlag + 1] : '';
  const report = argv.includes('--route') || argv.includes('--call')
    ? routeUltramarineTask({ task }, process.env)
    : { ...baseReport(process.env), ok: false, status: 'not_configured' };
  if (!argv.includes('--route') && !argv.includes('--call')) {
    report.status = report.configuredCount ? 'configured' : 'not_configured';
  }

  let exitCode = report.configuredCount && !argv.includes('--route') && !argv.includes('--call')
    ? 0
    : (report.ok ? 0 : 2);

  if (argv.includes('--call')) {
    if (!report.ok) {
      exitCode = 2;
    } else {
      const dispatched = await dispatchUltramarine({ task, force: true }, process.env);
      if (argv.includes('--json')) console.log(JSON.stringify(dispatched));
      else console.log(formatStatus(dispatched));
      process.exit(dispatched.called && dispatched.ok ? 0 : 2);
    }
  }

  if (argv.includes('--json')) console.log(JSON.stringify(report));
  else console.log(formatStatus(report));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error && error.message ? error.message : error).replace(/sk-[A-Za-z0-9_\-]+/g, '[redacted]'));
    process.exit(2);
  });
}

module.exports = {
  WEIGHTS_REPO,
  MODEL_ID,
  PROVIDERS,
  routeUltramarineTask,
  buildChatBody,
  dispatchUltramarine,
  formatStatus,
};
