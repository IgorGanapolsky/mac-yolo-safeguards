#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GRANITE_42_LOCAL_MODEL = 'hf.co/ibm-granite/granite-4.2-8b-GGUF:Q4_K_M';
const DEFAULT_CATALOG_PATH = path.join(os.homedir(), '.hermes', 'receipts', 'hermes-yolo', 'openrouter-catalog.json');
const DEFAULT_EVALUATIONS_PATH = path.join(os.homedir(), '.hermes', 'receipts', 'hermes-yolo', 'model-evals.json');
const DEFAULT_BUDGET_PATH = path.join(os.homedir(), '.hermes', 'openrouter-monthly-spend.json');
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const EVALUATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BUDGET_TTL_MS = 60 * 60 * 1000;
const PROVIDER_CREDIT_TTL_MS = 60 * 60 * 1000;
const MIN_PRIVATE_SCORE = 0.75;
const MAX_FAILURE_RATE = 0.20;
const MIN_SAMPLE_COUNT = 3;
const FREE_QUALITY_MARGIN = 0.04;

const CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'local_granite42_8b',
    provider: 'custom:ollama-local-64k',
    model: GRANITE_42_LOCAL_MODEL,
    location: 'local',
    contextLength: 131072,
    inputModalities: ['text'],
    supportsTools: true,
    supportsStructuredOutput: true,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    role: 'private-routine',
  }),
  Object.freeze({
    id: 'openrouter_free',
    provider: 'openrouter',
    model: 'openrouter/free',
    location: 'external',
    role: 'opportunistic-free',
  }),
  Object.freeze({
    id: 'openrouter_granite41_8b',
    provider: 'openrouter',
    model: 'ibm-granite/granite-4.1-8b',
    location: 'external',
    role: 'low-cost-routine',
  }),
  Object.freeze({
    id: 'openrouter_seed20_mini',
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2.0-mini',
    location: 'external',
    role: 'low-cost-multimodal-long-context',
  }),
  Object.freeze({
    id: 'openrouter_seed21_turbo',
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2-1-turbo',
    location: 'external',
    role: 'hard-agentic-multimodal',
  }),
]);

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currentMonth(now) {
  return new Date(now).toISOString().slice(0, 7);
}

function ageMs(timestamp, now) {
  const then = Date.parse(timestamp || '');
  const reference = Date.parse(now || new Date().toISOString());
  if (!Number.isFinite(then) || !Number.isFinite(reference)) return Infinity;
  return Math.max(0, reference - then);
}

function classifyTask(task, options = {}) {
  const text = String(task || '').toLowerCase();
  return {
    sensitive: /\b(private|confidential|secret|credential|password|token|customer|client|patient|medical|legal|contract|merger|acquisition|personally identifiable|pii)\b/.test(text),
    requiresTools: /\b(tool|terminal|shell|browser|search|repository|repo|code|implement|debug|fix|test|deploy|commit|pull request|pr)\b/.test(text),
    requiresMultimodal: /\b(image|screenshot|photo|video|audio|diagram|visual|attached)\b/.test(text),
    hardAgentic: /\b(autonomous|autonomously|multi-file|agentic|end[- ]to[- ]end|implement|debug|fix|refactor|deploy|pull request|pr)\b/.test(text),
    expectedContextTokens: Math.max(1, finiteNumber(options.expectedContextTokens, 4096)),
  };
}

function modelFromCatalog(catalog, modelId) {
  const models = catalog && Array.isArray(catalog.models) ? catalog.models : [];
  return models.find((model) => model && model.id === modelId) || null;
}

function evaluationFor(evaluations, candidateId) {
  const records = evaluations && Array.isArray(evaluations.evaluations)
    ? evaluations.evaluations
    : [];
  return records.find((evaluation) => evaluation && evaluation.candidateId === candidateId) || null;
}

function normalizeBudget(budget) {
  if (!budget || typeof budget !== 'object') return null;
  const history = Array.isArray(budget.history) ? budget.history : [];
  const latest = history.length ? history[history.length - 1] : null;
  return {
    month: budget.month || null,
    limitUsd: finiteNumber(budget.limitUsd, finiteNumber(budget.monthlyBudgetCapUsd, NaN)),
    spentUsd: finiteNumber(budget.spentUsd, finiteNumber(budget.currentSpentUsd, NaN)),
    updatedAt: budget.updatedAt || (latest && latest.timestamp) || null,
  };
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const input = finiteNumber(model && model.inputPricePerMillion, Infinity);
  const output = finiteNumber(model && model.outputPricePerMillion, Infinity);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return Infinity;
  return ((Math.max(0, finiteNumber(inputTokens)) * input)
    + (Math.max(0, finiteNumber(outputTokens)) * output)) / 1_000_000;
}

function candidateAffinity(candidate, requirements) {
  let affinity = 0;
  if (!requirements.hardAgentic && !requirements.requiresMultimodal && requirements.expectedContextTokens <= 131072) {
    if (candidate.id === 'local_granite42_8b' || candidate.id === 'openrouter_granite41_8b') affinity += 0.03;
  }
  if (requirements.hardAgentic && candidate.id === 'openrouter_seed21_turbo') affinity += 0.08;
  if (requirements.requiresMultimodal && candidate.id === 'openrouter_seed21_turbo') affinity += 0.02;
  if (requirements.requiresMultimodal && candidate.id === 'openrouter_seed20_mini') affinity += 0.04;
  if (requirements.expectedContextTokens > 131072 && candidate.id === 'openrouter_seed20_mini') affinity += 0.04;
  if (requirements.sensitive && candidate.location === 'local') affinity += 0.10;
  return affinity;
}

function evaluateCandidate(candidate, options) {
  const {
    requirements,
    catalog,
    evaluations,
    localModels,
    budget,
    now,
    allowPaid,
    expectedInputTokens,
    expectedOutputTokens,
    maxCallUsd,
  } = options;
  const reasons = [];
  let resolved = candidate;

  if (requirements.sensitive && candidate.location !== 'local') {
    reasons.push('privacy-external-denied');
  }
  if (candidate.id === 'openrouter_seed21_turbo'
    && !requirements.hardAgentic
    && !requirements.requiresMultimodal) {
    reasons.push('premium-agentic-capability-not-needed');
  }
  if (candidate.id === 'openrouter_seed20_mini'
    && !requirements.requiresMultimodal
    && requirements.expectedContextTokens <= 131072) {
    reasons.push('multimodal-long-context-capability-not-needed');
  }

  if (candidate.location === 'local') {
    if (!localModels.includes(candidate.model)) reasons.push('local-model-not-installed');
  } else {
    if (!catalog || ageMs(catalog.fetchedAt, now) > CATALOG_TTL_MS) reasons.push('catalog-stale');
    const catalogModel = modelFromCatalog(catalog, candidate.model);
    if (!catalogModel) {
      reasons.push('model-absent-from-live-catalog');
    } else {
      resolved = { ...candidate, ...catalogModel, id: candidate.id, model: candidate.model };
    }
  }

  const evaluation = evaluationFor(evaluations, candidate.id);
  if (!evaluation) {
    reasons.push('private-eval-missing');
  } else {
    if (evaluation.status !== 'pass') reasons.push('private-eval-failed');
    if (finiteNumber(evaluation.score, -1) < MIN_PRIVATE_SCORE) reasons.push('private-score-below-floor');
    if (finiteNumber(evaluation.failureRate, 1) > MAX_FAILURE_RATE) reasons.push('failure-rate-above-ceiling');
    if (finiteNumber(evaluation.sampleCount, 0) < MIN_SAMPLE_COUNT) reasons.push('private-sample-count-too-low');
    if (ageMs(evaluation.verifiedAt, now) > EVALUATION_TTL_MS) reasons.push('private-eval-stale');
    if (candidate.id === 'openrouter_free' && !String(evaluation.actualModel || '').trim()) {
      reasons.push('free-route-actual-model-unverified');
    }
  }

  const modalities = Array.isArray(resolved.inputModalities) ? resolved.inputModalities : [];
  if (!modalities.includes('text')) reasons.push('text-input-unsupported');
  if (requirements.requiresMultimodal && !modalities.some((value) => ['image', 'video'].includes(value))) {
    reasons.push('multimodal-input-unsupported');
  }
  if (requirements.requiresTools && resolved.supportsTools !== true) reasons.push('tools-unsupported');
  if (finiteNumber(resolved.contextLength, 0) < requirements.expectedContextTokens) reasons.push('context-window-too-small');

  const estimatedCostUsd = estimateCostUsd(resolved, expectedInputTokens, expectedOutputTokens);
  const paid = estimatedCostUsd > 0;
  if (paid) {
    const normalizedBudget = normalizeBudget(budget);
    const providerCredit = catalog && catalog.providerCredit;
    if (!allowPaid) reasons.push('paid-routing-disabled');
    if (!normalizedBudget
      || normalizedBudget.month !== currentMonth(now)
      || !Number.isFinite(normalizedBudget.limitUsd)
      || !Number.isFinite(normalizedBudget.spentUsd)) {
      reasons.push('monthly-budget-state-missing');
    } else if (ageMs(normalizedBudget.updatedAt, now) > BUDGET_TTL_MS) {
      reasons.push('monthly-budget-state-stale');
    }
    if (normalizedBudget && normalizedBudget.spentUsd >= normalizedBudget.limitUsd) {
      reasons.push('monthly-budget-exhausted');
    }
    const remaining = normalizedBudget
      ? normalizedBudget.limitUsd - normalizedBudget.spentUsd
      : 0;
    if (estimatedCostUsd > remaining) reasons.push('monthly-budget-insufficient');
    if (estimatedCostUsd > maxCallUsd) reasons.push('per-call-cost-cap-exceeded');
    if (!providerCredit || !Number.isFinite(providerCredit.remainingUsd)) {
      reasons.push('provider-credit-state-missing');
    } else {
      if (ageMs(providerCredit.checkedAt, now) > PROVIDER_CREDIT_TTL_MS) {
        reasons.push('provider-credit-state-stale');
      }
      if (providerCredit.remainingUsd < estimatedCostUsd) {
        reasons.push('provider-credit-insufficient');
      }
    }
  }

  const privateScore = evaluation ? finiteNumber(evaluation.score, 0) : 0;
  return {
    id: candidate.id,
    provider: candidate.provider,
    model: candidate.model,
    location: candidate.location,
    role: candidate.role,
    eligible: reasons.length === 0,
    reasons,
    privateScore,
    estimatedCostUsd: Number.isFinite(estimatedCostUsd) ? estimatedCostUsd : null,
    routingScore: privateScore + candidateAffinity(candidate, requirements),
    actualModel: evaluation && evaluation.actualModel ? evaluation.actualModel : null,
  };
}

function selectQualifiedCandidate(eligible) {
  if (eligible.length === 0) return null;
  const ordered = [...eligible].sort((a, b) => (
    b.routingScore - a.routingScore
    || a.estimatedCostUsd - b.estimatedCostUsd
    || a.id.localeCompare(b.id)
  ));
  const best = ordered[0];
  const zeroCost = ordered
    .filter((candidate) => candidate.estimatedCostUsd === 0)
    .sort((a, b) => b.routingScore - a.routingScore || a.id.localeCompare(b.id))[0];
  if (zeroCost && best.routingScore - zeroCost.routingScore <= FREE_QUALITY_MARGIN) return zeroCost;
  return best;
}

function selectSmartRoute(options = {}) {
  const env = options.env || process.env;
  const baseRoute = options.baseRoute || { provider: 'custom:litellm-gateway', model: 'glm-coding' };
  if (env.HERMES_YOLO_DYNAMIC_ROUTING !== '1') {
    return {
      schema: 'hermes-yolo/smart-route-result-v1',
      enabled: false,
      selected: baseRoute,
      considered: [],
      requirements: classifyTask(options.task, options),
      reason: 'dynamic-routing-disabled',
      fallback: false,
      blocked: false,
    };
  }

  const now = options.now || new Date().toISOString();
  const requirements = classifyTask(options.task, options);
  const considered = CANDIDATES.map((candidate) => evaluateCandidate(candidate, {
    requirements,
    catalog: options.catalog,
    evaluations: options.evaluations,
    localModels: Array.isArray(options.localModels) ? options.localModels : [],
    budget: options.budget,
    now,
    allowPaid: env.HERMES_YOLO_DYNAMIC_ALLOW_PAID === '1',
    expectedInputTokens: finiteNumber(options.expectedInputTokens, 4000),
    expectedOutputTokens: finiteNumber(options.expectedOutputTokens, 1500),
    maxCallUsd: finiteNumber(options.maxCallUsd, 0.01),
  }));
  const selected = selectQualifiedCandidate(considered.filter((candidate) => candidate.eligible));

  if (!selected && requirements.sensitive) {
    return {
      schema: 'hermes-yolo/smart-route-result-v1',
      enabled: true,
      selected: null,
      considered,
      requirements,
      reason: 'sensitive-task-has-no-qualified-local-model',
      fallback: false,
      blocked: true,
    };
  }
  if (!selected) {
    return {
      schema: 'hermes-yolo/smart-route-result-v1',
      enabled: true,
      selected: baseRoute,
      considered,
      requirements,
      reason: 'no-qualified-dynamic-candidate',
      fallback: true,
      blocked: false,
    };
  }
  return {
    schema: 'hermes-yolo/smart-route-result-v1',
    enabled: true,
    selected,
    considered,
    requirements,
    reason: `selected-${selected.id}`,
    fallback: false,
    blocked: false,
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function buildContentFreeDecisionReceipt(decision, options = {}) {
  const selected = decision && decision.selected;
  return {
    schema: 'hermes-yolo/smart-route-decision-v1',
    generatedAt: options.generatedAt || new Date().toISOString(),
    taskDigest: digest(options.task),
    requirements: decision ? decision.requirements : null,
    decision: {
      enabled: Boolean(decision && decision.enabled),
      selectedId: selected && selected.id ? selected.id : null,
      provider: selected ? selected.provider : null,
      model: selected ? selected.model : null,
      actualModel: selected && selected.actualModel ? selected.actualModel : null,
      reason: decision ? decision.reason : 'missing-decision',
      fallback: Boolean(decision && decision.fallback),
      blocked: Boolean(decision && decision.blocked),
      estimatedCostUsd: selected && Number.isFinite(selected.estimatedCostUsd)
        ? selected.estimatedCostUsd
        : null,
    },
    considered: decision && Array.isArray(decision.considered)
      ? decision.considered.map((candidate) => ({
        id: candidate.id,
        eligible: candidate.eligible,
        reasons: candidate.reasons,
        privateScore: candidate.privateScore,
        estimatedCostUsd: candidate.estimatedCostUsd,
      }))
      : [],
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function listLocalModels() {
  try {
    const output = execFileSync('ollama', ['list'], { encoding: 'utf8', timeout: 5000 });
    return output.split('\n').slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function parseOpenRouterCatalog(payload, fetchedAt = new Date().toISOString()) {
  const data = payload && Array.isArray(payload.data) ? payload.data : [];
  return {
    schema: 'hermes-yolo/openrouter-catalog-v1',
    fetchedAt,
    models: data.map((model) => {
      const parameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
      const architecture = model.architecture || {};
      return {
        id: model.id,
        contextLength: finiteNumber(model.context_length),
        inputModalities: Array.isArray(architecture.input_modalities) ? architecture.input_modalities : ['text'],
        outputModalities: Array.isArray(architecture.output_modalities) ? architecture.output_modalities : ['text'],
        supportsTools: parameters.includes('tools'),
        supportsStructuredOutput: parameters.includes('structured_outputs') || parameters.includes('response_format'),
        inputPricePerMillion: finiteNumber(model.pricing && model.pricing.prompt) * 1_000_000,
        outputPricePerMillion: finiteNumber(model.pricing && model.pricing.completion) * 1_000_000,
      };
    }).filter((model) => CANDIDATES.some((candidate) => candidate.model === model.id)),
  };
}

function fetchOpenRouterCatalog(options = {}) {
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const request = options.request || https.get;
  return new Promise((resolve, reject) => {
    const req = request('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'mac-yolo-safeguards/hermes-yolo-smart-router' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`OpenRouter catalog HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(parseOpenRouterCatalog(JSON.parse(body), fetchedAt));
        } catch (error) {
          reject(new Error(`OpenRouter catalog parse failed: ${error.message}`));
        }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('OpenRouter catalog timed out')));
    req.on('error', reject);
  });
}

function fetchOpenRouterCredits(options = {}) {
  const apiKey = options.apiKey || loadOpenRouterApiKey(options.env);
  if (!apiKey) return Promise.reject(new Error('OPENROUTER_API_KEY is not configured'));
  const request = options.request || https.request;
  const checkedAt = options.checkedAt || new Date().toISOString();
  return new Promise((resolve, reject) => {
    const req = request('https://openrouter.ai/api/v1/credits', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'mac-yolo-safeguards/hermes-yolo-smart-router',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          reject(new Error(`OpenRouter credits returned invalid JSON (HTTP ${response.statusCode})`));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`OpenRouter credits HTTP ${response.statusCode}`));
          return;
        }
        const data = parsed.data || {};
        const totalCreditsUsd = finiteNumber(data.total_credits, NaN);
        const totalUsageUsd = finiteNumber(data.total_usage, NaN);
        if (!Number.isFinite(totalCreditsUsd) || !Number.isFinite(totalUsageUsd)) {
          reject(new Error('OpenRouter credits response omitted totals'));
          return;
        }
        resolve({
          checkedAt,
          totalCreditsUsd,
          totalUsageUsd,
          remainingUsd: Number((totalCreditsUsd - totalUsageUsd).toFixed(8)),
        });
      });
    });
    req.setTimeout(15_000, () => req.destroy(new Error('OpenRouter credits timed out')));
    req.on('error', reject);
    req.end();
  });
}

function loadOpenRouterApiKey(env = process.env) {
  if (String(env.OPENROUTER_API_KEY || '').trim()) return String(env.OPENROUTER_API_KEY).trim();
  try {
    const body = fs.readFileSync(path.join(os.homedir(), '.hermes', '.env'), 'utf8');
    const match = body.match(/^OPENROUTER_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (_) {
    return null;
  }
}

function openRouterCompletion(payload, options = {}) {
  const apiKey = options.apiKey || loadOpenRouterApiKey(options.env);
  if (!apiKey) return Promise.reject(new Error('OPENROUTER_API_KEY is not configured'));
  const request = options.request || https.request;
  const timeoutMs = finiteNumber(options.timeoutMs, 45_000);
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const body = JSON.stringify(payload);
    const req = request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'HTTP-Referer': 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
        'X-Title': 'Hermes YOLO private model evaluation',
        'User-Agent': 'mac-yolo-safeguards/hermes-yolo-smart-router',
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(responseBody);
        } catch (_) {
          reject(new Error(`OpenRouter completion returned invalid JSON (HTTP ${response.statusCode})`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`OpenRouter completion HTTP ${response.statusCode}: ${String(parsed.error && parsed.error.message || 'request failed').slice(0, 240)}`));
          return;
        }
        resolve({ response: parsed, latencyMs: Date.now() - startedAt });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('OpenRouter completion timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

const PRIVATE_EVAL_PROBES = Object.freeze([
  Object.freeze({
    id: 'exact-output',
    messages: [{ role: 'user', content: 'Return exactly ROUTE_OK and nothing else.' }],
    maxTokens: 16,
  }),
  Object.freeze({
    id: 'structured-json',
    messages: [{ role: 'user', content: 'Return only this JSON object with no markdown: {"status":"ok","count":3}' }],
    maxTokens: 32,
  }),
  Object.freeze({
    id: 'required-tool-call',
    messages: [{ role: 'user', content: 'Use the lookup_build_status tool with build_id 42. Do not answer in plain text.' }],
    tools: [{
      type: 'function',
      function: {
        name: 'lookup_build_status',
        description: 'Look up a build by numeric identifier.',
        parameters: {
          type: 'object',
          properties: { build_id: { type: 'integer' } },
          required: ['build_id'],
          additionalProperties: false,
        },
      },
    }],
    toolChoice: { type: 'function', function: { name: 'lookup_build_status' } },
    maxTokens: 64,
  }),
]);

function responseMessage(response) {
  return response && response.choices && response.choices[0]
    ? response.choices[0].message || {}
    : {};
}

function normalizedContent(message) {
  if (typeof message.content === 'string') return message.content.trim();
  if (!Array.isArray(message.content)) return '';
  return message.content.map((part) => part && part.text || '').join('').trim();
}

function gradePrivateProbe(probeId, response) {
  const message = responseMessage(response);
  if (probeId === 'exact-output') {
    return normalizedContent(message) === 'ROUTE_OK';
  }
  if (probeId === 'structured-json') {
    const raw = normalizedContent(message).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.status === 'ok' && parsed.count === 3
        && Object.keys(parsed).sort().join(',') === 'count,status';
    } catch (_) {
      return false;
    }
  }
  if (probeId === 'required-tool-call') {
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    return calls.some((call) => {
      if (!call || !call.function || call.function.name !== 'lookup_build_status') return false;
      try {
        return JSON.parse(call.function.arguments || '{}').build_id === 42;
      } catch (_) {
        return false;
      }
    });
  }
  return false;
}

function evaluationSummary(candidateId, probeReceipts, verifiedAt = new Date().toISOString()) {
  const sampleCount = probeReceipts.length;
  const passed = probeReceipts.filter((receipt) => receipt.pass).length;
  const score = sampleCount ? passed / sampleCount : 0;
  const failureRate = sampleCount ? (sampleCount - passed) / sampleCount : 1;
  const actualModels = [...new Set(probeReceipts.map((receipt) => receipt.actualModel).filter(Boolean))];
  return {
    candidateId,
    status: sampleCount >= MIN_SAMPLE_COUNT
      && score >= MIN_PRIVATE_SCORE
      && failureRate <= MAX_FAILURE_RATE
      ? 'pass'
      : 'fail',
    score: Number(score.toFixed(4)),
    failureRate: Number(failureRate.toFixed(4)),
    sampleCount,
    verifiedAt,
    actualModel: actualModels[actualModels.length - 1] || null,
    actualModels,
    totalCostUsd: Number(probeReceipts.reduce((sum, receipt) => sum + finiteNumber(receipt.costUsd), 0).toFixed(8)),
    probes: probeReceipts,
  };
}

async function evaluateOpenRouterCandidate(candidate, options = {}) {
  const completion = options.completion || openRouterCompletion;
  const verifiedAt = options.verifiedAt || new Date().toISOString();
  const receipts = [];
  for (const probe of PRIVATE_EVAL_PROBES) {
    const requestBody = {
      model: candidate.model,
      messages: probe.messages,
      temperature: 0,
      max_tokens: probe.maxTokens,
      usage: { include: true },
      ...(probe.tools ? { tools: probe.tools, tool_choice: probe.toolChoice } : {}),
    };
    try {
      const result = await completion(requestBody, options);
      const response = result.response || {};
      const usage = response.usage || {};
      receipts.push({
        probeId: probe.id,
        pass: gradePrivateProbe(probe.id, response),
        actualModel: response.model || null,
        latencyMs: finiteNumber(result.latencyMs),
        inputTokens: finiteNumber(usage.prompt_tokens),
        outputTokens: finiteNumber(usage.completion_tokens),
        costUsd: finiteNumber(usage.cost),
        outputDigest: digest(JSON.stringify(responseMessage(response))),
        error: null,
      });
    } catch (error) {
      receipts.push({
        probeId: probe.id,
        pass: false,
        actualModel: null,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        outputDigest: null,
        error: String(error && error.message || error).slice(0, 240),
      });
    }
  }
  return evaluationSummary(candidate.id, receipts, verifiedAt);
}

async function runPrivateEvaluations(options = {}) {
  const requestedId = options.candidateId || null;
  const candidates = CANDIDATES.filter((candidate) => (
    candidate.location === 'external' && (!requestedId || candidate.id === requestedId)
  ));
  if (requestedId && candidates.length === 0) throw new Error(`Unknown external candidate: ${requestedId}`);
  const evaluations = [];
  for (const candidate of candidates) {
    const catalogModel = modelFromCatalog(options.catalog, candidate.model);
    const providerCredit = options.catalog && options.catalog.providerCredit;
    const paid = catalogModel
      && (finiteNumber(catalogModel.inputPricePerMillion) > 0
        || finiteNumber(catalogModel.outputPricePerMillion) > 0);
    if (paid && (!providerCredit
      || !Number.isFinite(providerCredit.remainingUsd)
      || providerCredit.remainingUsd <= 0
      || ageMs(providerCredit.checkedAt, options.verifiedAt || new Date().toISOString()) > PROVIDER_CREDIT_TTL_MS)) {
      evaluations.push({
        candidateId: candidate.id,
        status: 'fail',
        score: 0,
        failureRate: 1,
        sampleCount: 0,
        verifiedAt: options.verifiedAt || new Date().toISOString(),
        actualModel: null,
        actualModels: [],
        totalCostUsd: 0,
        blocker: 'provider-credit-unavailable',
        probes: [],
      });
      continue;
    }
    evaluations.push(await evaluateOpenRouterCandidate(candidate, options));
  }
  return {
    schema: 'hermes-yolo/model-evals-v1',
    generatedAt: options.verifiedAt || new Date().toISOString(),
    evaluations,
  };
}

function cliValue(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] || 'doctor';
  const catalogPath = cliValue(argv, '--catalog', env.HERMES_YOLO_OPENROUTER_CATALOG || DEFAULT_CATALOG_PATH);
  const evaluationsPath = cliValue(argv, '--evaluations', env.HERMES_YOLO_MODEL_EVALS || DEFAULT_EVALUATIONS_PATH);
  const budgetPath = cliValue(argv, '--budget', env.HERMES_YOLO_OPENROUTER_BUDGET || DEFAULT_BUDGET_PATH);
  if (command === 'refresh') {
    const outputPath = cliValue(argv, '--out', catalogPath);
    const catalog = await fetchOpenRouterCatalog();
    try {
      catalog.providerCredit = await fetchOpenRouterCredits({ env });
    } catch (error) {
      catalog.providerCredit = {
        checkedAt: new Date().toISOString(),
        remainingUsd: null,
        error: String(error && error.message || error).slice(0, 240),
      };
    }
    writeJsonAtomic(outputPath, catalog);
    return {
      ok: true,
      outputPath,
      modelCount: catalog.models.length,
      fetchedAt: catalog.fetchedAt,
      providerCreditRemainingUsd: catalog.providerCredit.remainingUsd,
    };
  }
  if (command === 'evaluate') {
    const outputPath = cliValue(argv, '--out', evaluationsPath);
    const result = await runPrivateEvaluations({
      env,
      candidateId: cliValue(argv, '--candidate'),
      apiKey: loadOpenRouterApiKey(env),
      catalog: readJson(catalogPath),
    });
    writeJsonAtomic(outputPath, result);
    return {
      ok: result.evaluations.every((evaluation) => evaluation.status === 'pass'),
      outputPath,
      evaluations: result.evaluations,
      budgetSyncRequired: result.evaluations.some((evaluation) => evaluation.totalCostUsd > 0),
    };
  }
  if (command === 'route') {
    const task = cliValue(argv, '--task', '');
    return selectSmartRoute({
      task,
      env,
      baseRoute: {
        provider: env.HERMES_YOLO_PROVIDER || 'custom:litellm-gateway',
        model: env.HERMES_YOLO_MODEL || 'glm-coding',
      },
      catalog: readJson(catalogPath),
      evaluations: readJson(evaluationsPath),
      budget: readJson(budgetPath),
      localModels: listLocalModels(),
      expectedContextTokens: finiteNumber(cliValue(argv, '--context-tokens', 4096), 4096),
      expectedInputTokens: finiteNumber(cliValue(argv, '--input-tokens', 4000), 4000),
      expectedOutputTokens: finiteNumber(cliValue(argv, '--output-tokens', 1500), 1500),
      maxCallUsd: finiteNumber(env.HERMES_YOLO_DYNAMIC_MAX_CALL_USD, 0.01),
    });
  }
  if (command === 'doctor') {
    const catalog = readJson(catalogPath);
    const evaluations = readJson(evaluationsPath);
    const budget = readJson(budgetPath);
    return {
      ok: Boolean(catalog && evaluations && budget),
      dynamicRoutingEnabled: env.HERMES_YOLO_DYNAMIC_ROUTING === '1',
      catalog: { path: catalogPath, present: Boolean(catalog), fetchedAt: catalog && catalog.fetchedAt },
      evaluations: { path: evaluationsPath, present: Boolean(evaluations), count: evaluations && Array.isArray(evaluations.evaluations) ? evaluations.evaluations.length : 0 },
      budget: { path: budgetPath, present: Boolean(budget), month: budget && budget.month },
      granite42Installed: listLocalModels().includes(GRANITE_42_LOCAL_MODEL),
    };
  }
  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  runCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result && result.blocked ? 3 : result && result.ok === false ? 1 : 0;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CANDIDATES,
  GRANITE_42_LOCAL_MODEL,
  buildContentFreeDecisionReceipt,
  classifyTask,
  estimateCostUsd,
  evaluateOpenRouterCandidate,
  evaluationSummary,
  fetchOpenRouterCatalog,
  fetchOpenRouterCredits,
  gradePrivateProbe,
  listLocalModels,
  loadOpenRouterApiKey,
  openRouterCompletion,
  parseOpenRouterCatalog,
  normalizeBudget,
  readJson,
  runCli,
  runPrivateEvaluations,
  selectSmartRoute,
  writeJsonAtomic,
};
