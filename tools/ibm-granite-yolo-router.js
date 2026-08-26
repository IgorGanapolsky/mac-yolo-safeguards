#!/usr/bin/env node
'use strict';

/**
 * IBM Granite 4.2 steal for hermes-yolo: catalog-backed cheap OpenRouter
 * routing with thinking-mode selection. Does not replace glm-coding.
 *
 * Complementary to AGENT-542 / GH #2117 (codex owns hermes-yolo-wrapper.js
 * and tools/hermes-yolo-smart-router.js). This leaf is the granite catalog
 * + thinking-mode policy those files can import.
 *
 * Usage:
 *   node tools/ibm-granite-yolo-router.js --task "summarize this RFC" [--json]
 *   node tools/ibm-granite-yolo-router.js --doctor --json
 *   node tools/ibm-granite-yolo-router.js --probe-catalog --json
 */

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const POLICY_VERSION = 1;
const SOURCE_TNS = 'https://thenewstack.io/ibm-granite-reasoning-models/';
const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models';
const MONTHLY_CAP_USD = 10;
const DEFAULT_PER_CALL_CAP_USD = 0.02;
const DEFAULT_IN_TOKENS = 2000;
const DEFAULT_OUT_TOKENS = 500;

const GLM_CODING = Object.freeze({
  id: 'coding_primary',
  model: 'glm-coding',
  provider: 'custom:litellm-gateway',
  tier: 'subscription',
  label: 'GLM Coding Plan via LiteLLM — quality lock, $0 marginal',
});

const LOCAL = Object.freeze({
  id: 'local_fast',
  model: 'hermes-local',
  provider: 'custom:litellm-gateway',
  tier: 'local',
  label: 'Local Ollama via gateway — sensitive / zero spend',
});

/** Expected 4.2 OpenRouter slugs. Never treat these as LIVE until catalog has the exact id. */
const EXPECTED_42 = Object.freeze([
  'ibm-granite/granite-4.2-3b',
  'ibm-granite/granite-4.2-8b',
  'ibm-granite/granite-4.2-30b',
  'ibm-granite/granite-4.2-3b:free',
  'ibm-granite/granite-4.2-8b:free',
]);

/** Live OpenRouter snapshot used when tests inject no catalog (2026-08-26 public listing). */
const SNAPSHOT_20260826 = Object.freeze([
  {
    id: 'ibm-granite/granite-4.1-8b',
    name: 'IBM: Granite 4.1 8B',
    pricing: { prompt: '0.00000005', completion: '0.0000001' },
    context_length: 131072,
  },
  {
    id: 'ibm-granite/granite-4.0-h-micro',
    name: 'IBM: Granite 4.0 Micro',
    pricing: { prompt: '0.000000017', completion: '0.000000112' },
    context_length: 131000,
  },
]);

function honesty() {
  return {
    clonedIbmGranite: false,
    clonedOpenRouter: false,
    dualEditWrapper: false,
    dualEditSmartRouter: false,
    dualEditRoutePolicy: false,
    liveClaim: false,
    source: SOURCE_TNS,
    policyVersion: POLICY_VERSION,
  };
}

function taskSignals(task) {
  const text = String(task || '').toLowerCase();
  return {
    sensitive: /\b(ssn|password|secret|api key|private key|pii|passport|credential)\b/.test(text),
    coding: /\b(implement|refactor|fix bug|unit test|pull request|typescript|login form|auth bug)\b/.test(text)
      || /\b(write code|code review|patch the)\b/.test(text),
    asksGranite: /\bgranite\b/.test(text),
    asksLocal: /\blocal\b|ollama|offline|no.?spend|zero.?cost/.test(text),
    smoke: /\bsmoke\b|\bping\b|hermes-yolo-ready|reply with exactly|quick check/.test(text),
    easy: /\b(classify|label|extract|summarize|tl;dr|short answer|yes or no)\b/.test(text),
    math: /\b(math|aime|prove|reason step|chain of thought|why does)\b/.test(text),
    agentic: /\b(tool call|agentic|terminal|web search|multi-step|plan then act)\b/.test(text),
    hard: /\b(architecture|root cause|are you sure|30b|flagship)\b/.test(text),
    longContext: /long[- ]?context|512k|128k|whole[- ]?repo/.test(text),
  };
}

function thinkingModeFor(signals) {
  if (signals.smoke || signals.easy) return 'none';
  if (signals.hard || signals.math || signals.agentic) return 'thinking';
  return 'low-effort';
}

function openRouterReasoning(mode) {
  if (mode === 'none') return { effort: 'none', enabled: false, exclude: false };
  if (mode === 'low-effort') return { effort: 'low', enabled: true, exclude: false };
  return { effort: 'medium', enabled: true, exclude: false };
}

function usdPerMillion(perToken) {
  const n = Number(perToken);
  if (!Number.isFinite(n)) return Infinity;
  return n * 1e6;
}

function parseCatalog(raw) {
  const list = Array.isArray(raw) ? raw : (raw && raw.data) || [];
  const models = [];
  for (const item of list) {
    if (!item || !item.id) continue;
    const id = String(item.id);
    const blob = `${id} ${item.name || ''}`.toLowerCase();
    if (!blob.includes('granite') && !id.startsWith('ibm-granite/')) continue;
    const pricing = item.pricing || {};
    const promptM = usdPerMillion(pricing.prompt);
    const completionM = usdPerMillion(pricing.completion);
    const isFree = /:free$/i.test(id) || (promptM === 0 && completionM === 0);
    let family = 'other';
    if (/granite-4\.2/.test(id)) family = '4.2';
    else if (/granite-4\.1/.test(id)) family = '4.1';
    else if (/granite-4\.0/.test(id)) family = '4.0';
    let size = 'unknown';
    if (/\b30b\b/.test(id) || /30b/.test(id)) size = '30b';
    else if (/\b8b\b/.test(id) || /8b/.test(id)) size = '8b';
    else if (/\b3b\b/.test(id) || /3b/.test(id) || /micro/.test(id)) size = '3b';
    models.push({
      id,
      name: item.name || id,
      family,
      size,
      isFree,
      promptUsdPerM: promptM,
      completionUsdPerM: completionM,
      context: Number(item.context_length) || 0,
    });
  }
  return models;
}

function estimateCostUsd(model, inTok = DEFAULT_IN_TOKENS, outTok = DEFAULT_OUT_TOKENS) {
  if (!model || !Number.isFinite(model.promptUsdPerM)) return Infinity;
  return (inTok / 1e6) * model.promptUsdPerM + (outTok / 1e6) * model.completionUsdPerM;
}

function loadSpend(spendFile) {
  const file = spendFile || process.env.HERMES_OR_SPEND_FILE
    || path.join(os.homedir(), '.hermes', 'openrouter-monthly-spend.json');
  if (!fs.existsSync(file)) {
    return { ok: false, reason: 'budget_evidence_missing', remainingUsd: 0, capUsd: MONTHLY_CAP_USD, spentUsd: 0, file };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const spent = parsed.month === month ? Number(parsed.currentSpentUsd) || 0 : 0;
    const cap = Number(parsed.monthlyBudgetCapUsd) || MONTHLY_CAP_USD;
    return {
      ok: true,
      remainingUsd: Math.max(0, cap - spent),
      capUsd: cap,
      spentUsd: spent,
      exhausted: spent >= cap,
      file,
    };
  } catch (err) {
    return { ok: false, reason: 'budget_evidence_unreadable', remainingUsd: 0, capUsd: MONTHLY_CAP_USD, spentUsd: 0, error: err.message, file };
  }
}

function wantedSize(signals) {
  if (signals.hard && /30b/.test(String(signals._task || ''))) return '30b';
  if (signals.smoke || signals.easy) return '3b';
  return '8b';
}

function scoreCandidate(model, { size, thinking }) {
  let score = 0;
  if (model.family === '4.2') score += 80;
  else if (model.family === '4.1') score += 40;
  else if (model.family === '4.0') score += 10;
  if (model.size === size) score += 30;
  else if (size === '3b' && model.size === '8b') score += 12;
  else if (size === '8b' && model.size === '3b') score += 8;
  if (model.isFree) score += 25;
  if (thinking === 'thinking' && model.family === '4.2') score += 10;
  const est = estimateCostUsd(model);
  score -= Math.min(20, est * 1000);
  return score;
}

function pickGranite(models, signals, opts) {
  const size = wantedSize(signals);
  const thinking = thinkingModeFor(signals);
  const perCallCap = opts.perCallCapUsd != null ? opts.perCallCapUsd : DEFAULT_PER_CALL_CAP_USD;
  const considered = [];
  const exact = models.filter((m) => m.size === size);
  const pool = exact.length
    ? exact
    : (size === '3b' ? models.filter((m) => m.size === '8b' || m.size === '3b') : models);
  const ranked = pool
    .map((m) => {
      const est = estimateCostUsd(m);
      const reasons = [];
      if (!m.isFree && est > perCallCap) reasons.push('over_per_call_cap');
      if (size === '30b' && m.size !== '30b') reasons.push('not_30b');
      return { ...m, estimatedCostUsd: Number(est.toFixed(8)), score: scoreCandidate(m, { size, thinking }), reject: reasons };
    })
    .sort((a, b) => b.score - a.score || a.estimatedCostUsd - b.estimatedCostUsd || a.id.localeCompare(b.id));

  for (const m of ranked) considered.push({ id: m.id, score: m.score, estimatedCostUsd: m.estimatedCostUsd, reject: m.reject });

  const viable = ranked.filter((m) => m.reject.length === 0);
  if (!viable.length) return { pick: null, considered, size, thinking };
  return { pick: viable[0], considered, size, thinking };
}

function selectRoute(opts = {}) {
  const task = opts.task || '';
  const signals = { ...taskSignals(task), _task: task };
  const catalog = parseCatalog(opts.catalog || SNAPSHOT_20260826);
  const spend = opts.spend || loadSpend(opts.spendFile);
  const paidOk = Boolean(opts.paidOk);
  const granite42Live = catalog.some((m) => m.family === '4.2');
  const considered = [];
  const h = honesty();
  h.granite42OpenRouterLive = granite42Live;
  h.liveClaim = false;

  const base = {
    policyVersion: POLICY_VERSION,
    signals,
    granite42OpenRouterLive: granite42Live,
    catalogCount: catalog.length,
    catalogIds: catalog.map((m) => m.id),
    expected42: EXPECTED_42,
    honesty: h,
    spend: {
      ok: spend.ok,
      remainingUsd: spend.remainingUsd,
      spentUsd: spend.spentUsd,
      capUsd: spend.capUsd,
      reason: spend.reason || null,
    },
    thinkingMode: thinkingModeFor(signals),
  };

  if (signals.sensitive || signals.asksLocal) {
    return {
      ...base,
      ...LOCAL,
      reason: signals.sensitive ? 'sensitive → local, never OpenRouter granite' : 'task asked local/offline',
      considered,
      commandEnv: commandEnv(LOCAL),
    };
  }

  if (signals.coding && !signals.asksGranite) {
    return {
      ...base,
      ...GLM_CODING,
      reason: 'coding quality lock → glm-coding (Granite coding is average per TNS)',
      considered,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  const wantsGranite = signals.asksGranite || signals.easy || signals.math || signals.agentic || signals.smoke
    || Boolean(opts.preferGranite);
  if (!wantsGranite) {
    return {
      ...base,
      ...GLM_CODING,
      reason: 'default interactive work stays glm-coding until granite is the cheaper fit',
      considered,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  if (!catalog.length) {
    return {
      ...base,
      ...GLM_CODING,
      reason: 'granite catalog empty/stale → glm-coding fail-closed',
      considered,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  const picked = pickGranite(catalog, signals, { perCallCapUsd: opts.perCallCapUsd });
  considered.push(...picked.considered);

  if (!picked.pick) {
    return {
      ...base,
      ...GLM_CODING,
      reason: 'no granite candidate under per-call cap → glm-coding',
      considered,
      thinkingMode: picked.thinking,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  const metered = !picked.pick.isFree;
  if (metered) {
    if (!spend.ok) {
      return {
        ...base,
        ...GLM_CODING,
        reason: 'metered granite blocked: budget evidence missing',
        considered,
        thinkingMode: picked.thinking,
        commandEnv: commandEnv(GLM_CODING),
      };
    }
    if (spend.exhausted || spend.remainingUsd < picked.pick.estimatedCostUsd) {
      return {
        ...base,
        ...GLM_CODING,
        reason: 'metered granite blocked: $10/mo OpenRouter cap exhausted or remaining < estimate',
        considered,
        thinkingMode: picked.thinking,
        commandEnv: commandEnv(GLM_CODING),
      };
    }
    if (!paidOk && !signals.asksGranite && !opts.preferGranite) {
      // Cheap metered granite is the point of this leaf. Allow it when budget
      // evidence exists and the estimate is under the per-call cap — this is
      // "very low pay", not a frontier spend. Explicit paidOk still required
      // for 30B.
      if (picked.pick.size === '30b') {
        return {
          ...base,
          ...GLM_CODING,
          reason: '30B granite requires --paid-ok (not auto)',
          considered,
          thinkingMode: picked.thinking,
          commandEnv: commandEnv(GLM_CODING),
        };
      }
    }
  }

  if (picked.pick.size === '30b' && !paidOk && !signals.asksGranite) {
    return {
      ...base,
      ...GLM_CODING,
      reason: '30B granite is opt-in --paid-ok only',
      considered,
      thinkingMode: picked.thinking,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  const invented42 = EXPECTED_42.includes(picked.pick.id) && !granite42Live;
  if (invented42) {
    return {
      ...base,
      ...GLM_CODING,
      reason: 'refusing invented Granite 4.2 OpenRouter id',
      considered,
      commandEnv: commandEnv(GLM_CODING),
    };
  }

  const route = {
    id: `granite_${picked.pick.family}_${picked.pick.size}`,
    model: picked.pick.id,
    provider: 'openrouter',
    tier: picked.pick.isFree ? 'free' : 'cheap_metered',
    label: `${picked.pick.name} via OpenRouter (${picked.pick.isFree ? 'free' : 'very-low-pay'})`,
  };
  return {
    ...base,
    ...route,
    reason: `granite ${picked.pick.family} ${picked.pick.size} (${picked.pick.isFree ? 'free' : `~$${picked.pick.estimatedCostUsd.toFixed(6)}`}) thinking=${picked.thinking}`,
    thinkingMode: picked.thinking,
    openRouterReasoning: openRouterReasoning(picked.thinking),
    estimatedCostUsd: picked.pick.estimatedCostUsd,
    considered,
    commandEnv: commandEnv({ ...route, thinkingMode: picked.thinking }),
  };
}

function commandEnv(route) {
  return {
    HERMES_YOLO_PROVIDER: route.provider,
    HERMES_YOLO_MODEL: route.model,
    HERMES_ROUTE_ID: route.id,
    HERMES_GRANITE_THINKING: route.thinkingMode || '',
  };
}

function fetchCatalog(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const url = new URL(OPENROUTER_MODELS);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Accept: 'application/json', 'User-Agent': 'ibm-granite-yolo-router/1' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`catalog HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('catalog timeout'));
    });
    req.end();
  });
}

function doctor(opts = {}) {
  const catalog = parseCatalog(opts.catalog || SNAPSHOT_20260826);
  const spend = opts.spend || loadSpend(opts.spendFile);
  const live42 = catalog.filter((m) => m.family === '4.2').map((m) => m.id);
  return {
    schema: 'ibm-granite-yolo/doctor-v1',
    honesty: honesty(),
    granite42OpenRouterLive: live42.length > 0,
    granite42Ids: live42,
    liveOpenRouterGranite: catalog.map((m) => ({
      id: m.id,
      family: m.family,
      size: m.size,
      isFree: m.isFree,
      promptUsdPerM: m.promptUsdPerM,
      completionUsdPerM: m.completionUsdPerM,
    })),
    spend,
    notes: [
      'OpenRouter did not list Granite 4.2 on 2026-08-26; 4.1-8b is the cheap live rail ($0.05/$0.10 per M).',
      'Coding stays glm-coding. Sensitive stays local. Do not edit hermes-yolo-wrapper.js (Codex AGENT-542).',
      'Do not auto-pull 30B GGUF on 24GB Macs.',
    ],
  };
}

function parseArgs(argv) {
  const out = {
    task: '',
    json: false,
    doctor: false,
    probeCatalog: false,
    paidOk: false,
    preferGranite: false,
    catalogFile: '',
    spendFile: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--doctor') out.doctor = true;
    else if (a === '--probe-catalog') out.probeCatalog = true;
    else if (a === '--paid-ok') out.paidOk = true;
    else if (a === '--prefer-granite') out.preferGranite = true;
    else if (a === '--catalog-file') out.catalogFile = argv[++i] || '';
    else if (a === '--spend-file') out.spendFile = argv[++i] || '';
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  return out;
}

function loadCatalogFile(file) {
  if (!file) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`Usage: node tools/ibm-granite-yolo-router.js --task "..." [--json] [--doctor] [--probe-catalog] [--paid-ok]\n`);
    return 0;
  }
  let catalog = args.catalogFile ? loadCatalogFile(args.catalogFile) : SNAPSHOT_20260826;
  let catalogFetchedAt = null;
  if (args.probeCatalog) {
    const live = await fetchCatalog();
    catalog = live;
    catalogFetchedAt = new Date().toISOString();
  }
  if (args.doctor && !args.task) {
    const report = doctor({ catalog, spendFile: args.spendFile });
    report.catalogFetchedAt = catalogFetchedAt;
    if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      process.stdout.write(`granite42Live=${report.granite42OpenRouterLive} models=${report.liveOpenRouterGranite.map((m) => m.id).join(',') || '(none)'}\n`);
    }
    return 0;
  }
  const route = selectRoute({
    task: args.task,
    catalog,
    spendFile: args.spendFile,
    paidOk: args.paidOk,
    preferGranite: args.preferGranite,
  });
  const payload = {
    schema: 'ibm-granite-yolo/route-v1',
    catalogFetchedAt,
    route,
  };
  if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${route.id} → ${route.provider} / ${route.model}\nreason: ${route.reason}\n`);
  return 0;
}

module.exports = {
  POLICY_VERSION,
  EXPECTED_42,
  SNAPSHOT_20260826,
  GLM_CODING,
  LOCAL,
  honesty,
  taskSignals,
  thinkingModeFor,
  openRouterReasoning,
  parseCatalog,
  estimateCostUsd,
  loadSpend,
  selectRoute,
  commandEnv,
  doctor,
  parseArgs,
  main,
  fetchCatalog,
};

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}
