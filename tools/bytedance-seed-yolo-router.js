#!/usr/bin/env node
'use strict';

/**
 * ByteDance Seed steal for hermes-yolo: catalog-backed OpenRouter routing.
 * Seed 2.1 Turbo is NOT very-low-pay ($0.50/$2.50 per M) — default is the
 * cheapest live Seed (1.6-flash / 2.0-mini). Coding stays glm-coding.
 *
 * Complementary to AGENT-542 (Codex owns hermes-yolo-wrapper.js and
 * tools/hermes-yolo-smart-router.js) and to seed-yolo-wrapper.js (released).
 *
 * Source: https://seed.bytedance.com/en/direction/llm
 */

const fs = require('fs');
const https = require('https');
const granite = require('./ibm-granite-yolo-router');

const POLICY_VERSION = 1;
const SOURCE = 'https://seed.bytedance.com/en/direction/llm';
const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models';
const DEFAULT_PER_CALL_CAP_USD = 0.02;

const GLM_CODING = granite.GLM_CODING;
const LOCAL = granite.LOCAL;

const SNAPSHOT_20260826 = Object.freeze([
  { id: 'bytedance-seed/seed-1.6-flash', name: 'ByteDance Seed: Seed 1.6 Flash', pricing: { prompt: '0.000000075', completion: '0.0000003' }, context_length: 262144 },
  { id: 'bytedance-seed/seed-2.0-mini', name: 'ByteDance Seed: Seed-2.0-Mini', pricing: { prompt: '0.0000001', completion: '0.0000004' }, context_length: 262144 },
  { id: 'bytedance-seed/seed-1.6', name: 'ByteDance Seed: Seed 1.6', pricing: { prompt: '0.00000025', completion: '0.000002' }, context_length: 262144 },
  { id: 'bytedance-seed/seed-2.0-lite', name: 'ByteDance Seed: Seed-2.0-Lite', pricing: { prompt: '0.00000025', completion: '0.000002' }, context_length: 262144 },
  { id: 'bytedance-seed/seed-2-1-turbo', name: 'ByteDance Seed: Seed 2.1 Turbo', pricing: { prompt: '0.0000005', completion: '0.0000025' }, context_length: 262144 },
  { id: 'bytedance-seed/seed-2.0-code', name: 'ByteDance Seed: Seed-2.0-Code', pricing: { prompt: '0.0000005', completion: '0.000003' }, context_length: 262144 },
]);

const EXPENSIVE = new Set([
  'bytedance-seed/seed-2-1-turbo',
  'bytedance-seed/seed-2.0-code',
]);

function honesty() {
  return {
    clonedByteDanceSeed: false,
    clonedSeedance: false,
    dualEditWrapper: false,
    dualEditSmartRouter: false,
    dualEditSeedYoloWrapper: false,
    liveClaim: false,
    source: SOURCE,
    policyVersion: POLICY_VERSION,
  };
}

function taskSignals(task) {
  const text = String(task || '').toLowerCase();
  return {
    sensitive: /\b(ssn|password|secret|api key|private key|pii|passport|credential)\b/.test(text),
    coding: /\b(implement|refactor|fix bug|unit test|pull request|typescript|login form|auth bug)\b/.test(text),
    asksSeed: /\bseed\b|bytedance|byteplus/.test(text),
    asksTurbo: /\b(turbo|seed2\.1|seed 2\.1|seed-2-1)\b/.test(text),
    asksLocal: /\blocal\b|ollama|offline|no.?spend|zero.?cost/.test(text),
    multimodal: /\b(image|screenshot|photo|video|audio|diagram|visual|vision|multimodal)\b/.test(text),
    office: /\b(spreadsheet|slides|lesson[- ]plan|office agent|white-?collar|mockup|floor plan|industry report|workspace bench)\b/.test(text),
    agentic: /\b(tool call|agentic|terminal|web search|multi-step|office agent|productivity agent)\b/.test(text),
    easy: /\b(classify|label|extract|summarize|tl;dr|short answer|yes or no)\b/.test(text),
  };
}

function usdPerMillion(perToken) {
  const n = Number(perToken);
  return Number.isFinite(n) ? n * 1e6 : Infinity;
}

function parseCatalog(raw) {
  const list = Array.isArray(raw) ? raw : (raw && raw.data) || [];
  const models = [];
  for (const item of list) {
    if (!item || !item.id) continue;
    const id = String(item.id);
    if (!id.startsWith('bytedance-seed/')) continue;
    const pricing = item.pricing || {};
    const promptM = usdPerMillion(pricing.prompt);
    const completionM = usdPerMillion(pricing.completion);
    const isFree = /:free$/i.test(id) || (promptM === 0 && completionM === 0);
    let family = 'other';
    if (/seed-2-1|seed2\.1|2\.1/.test(id)) family = '2.1';
    else if (/seed-2\.0/.test(id)) family = '2.0';
    else if (/seed-1\.6/.test(id)) family = '1.6';
    let size = 'base';
    if (/flash/.test(id)) size = 'flash';
    else if (/mini/.test(id)) size = 'mini';
    else if (/lite/.test(id)) size = 'lite';
    else if (/code/.test(id)) size = 'code';
    else if (/turbo/.test(id)) size = 'turbo';
    else if (/pro/.test(id)) size = 'pro';
    models.push({
      id,
      name: item.name || id,
      family,
      size,
      isFree,
      expensive: EXPENSIVE.has(id) || size === 'turbo' || size === 'code' || size === 'pro',
      promptUsdPerM: promptM,
      completionUsdPerM: completionM,
      context: Number(item.context_length) || 0,
    });
  }
  return models;
}

function estimateCostUsd(model, inTok = 2000, outTok = 500) {
  if (!model || !Number.isFinite(model.promptUsdPerM)) return Infinity;
  return (inTok / 1e6) * model.promptUsdPerM + (outTok / 1e6) * model.completionUsdPerM;
}

function pickSeed(models, signals, opts) {
  const perCallCap = opts.perCallCapUsd != null ? opts.perCallCapUsd : DEFAULT_PER_CALL_CAP_USD;
  const paidOk = Boolean(opts.paidOk);
  const wantExpensive = Boolean(signals.asksTurbo && paidOk);
  const ranked = models
    .map((m) => {
      const est = estimateCostUsd(m);
      const reject = [];
      if (!m.isFree && est > perCallCap) reject.push('over_per_call_cap');
      if (m.expensive && !wantExpensive) reject.push('expensive_needs_paid_ok');
      let score = 0;
      if (m.isFree) score += 40;
      if (signals.multimodal && (m.size === 'mini' || m.family === '2.1')) score += 15;
      if (signals.office && (m.size === 'mini' || m.size === 'flash')) score += 18;
      if (signals.easy && (m.size === 'flash' || m.size === 'mini')) score += 20;
      if (wantExpensive && m.size === 'turbo') score += 30;
      score -= Math.min(25, est * 8000);
      return { ...m, estimatedCostUsd: Number(est.toFixed(8)), score, reject };
    })
    .sort((a, b) => b.score - a.score || a.estimatedCostUsd - b.estimatedCostUsd || a.id.localeCompare(b.id));
  const considered = ranked.map((m) => ({
    id: m.id,
    score: m.score,
    estimatedCostUsd: m.estimatedCostUsd,
    reject: m.reject,
  }));
  const viable = ranked.filter((m) => m.reject.length === 0);
  return { pick: viable[0] || null, considered };
}

function selectRoute(opts = {}) {
  const task = opts.task || '';
  const signals = taskSignals(task);
  const catalog = parseCatalog(opts.catalog || SNAPSHOT_20260826);
  const spend = opts.spend || granite.loadSpend(opts.spendFile);
  const h = honesty();
  const considered = [];
  const base = {
    policyVersion: POLICY_VERSION,
    signals,
    catalogCount: catalog.length,
    catalogIds: catalog.map((m) => m.id),
    honesty: h,
    spend: {
      ok: spend.ok,
      remainingUsd: spend.remainingUsd,
      spentUsd: spend.spentUsd,
      capUsd: spend.capUsd,
      reason: spend.reason || null,
    },
  };

  if (signals.sensitive || signals.asksLocal) {
    return { ...base, ...LOCAL, reason: 'sensitive/local → hermes-local, never OpenRouter seed', considered, commandEnv: granite.commandEnv(LOCAL) };
  }

  if (signals.coding && !signals.asksSeed) {
    return { ...base, ...GLM_CODING, reason: 'coding quality lock → glm-coding (seed-2.0-code is metered $0.50/$3.00)', considered, commandEnv: granite.commandEnv(GLM_CODING) };
  }

  const wantsSeed = signals.asksSeed || signals.multimodal || signals.office || Boolean(opts.preferSeed);
  if (!wantsSeed) {
    return { ...base, ...GLM_CODING, reason: 'no seed/multimodal signal → glm-coding', considered, commandEnv: granite.commandEnv(GLM_CODING) };
  }

  if (!catalog.length) {
    return { ...base, ...GLM_CODING, reason: 'seed catalog empty/stale → glm-coding fail-closed', considered, commandEnv: granite.commandEnv(GLM_CODING) };
  }

  const picked = pickSeed(catalog, signals, { perCallCapUsd: opts.perCallCapUsd, paidOk: opts.paidOk });
  considered.push(...picked.considered);
  if (!picked.pick) {
    return { ...base, ...GLM_CODING, reason: 'no seed candidate under cap / without --paid-ok for turbo → glm-coding', considered, commandEnv: granite.commandEnv(GLM_CODING) };
  }

  if (!picked.pick.isFree) {
    if (!spend.ok) {
      return { ...base, ...GLM_CODING, reason: 'metered seed blocked: budget evidence missing', considered, commandEnv: granite.commandEnv(GLM_CODING) };
    }
    if (spend.exhausted || spend.remainingUsd < picked.pick.estimatedCostUsd) {
      return { ...base, ...GLM_CODING, reason: 'metered seed blocked: $10/mo OpenRouter cap exhausted', considered, commandEnv: granite.commandEnv(GLM_CODING) };
    }
  }

  const route = {
    id: `seed_${picked.pick.family}_${picked.pick.size}`,
    model: picked.pick.id,
    provider: 'openrouter',
    tier: picked.pick.isFree ? 'free' : (picked.pick.expensive ? 'metered_opt_in' : 'cheap_metered'),
    label: `${picked.pick.name} via OpenRouter`,
  };
  return {
    ...base,
    ...route,
    reason: `seed ${picked.pick.family} ${picked.pick.size} (${picked.pick.isFree ? 'free' : `~$${picked.pick.estimatedCostUsd.toFixed(6)}`})`,
    estimatedCostUsd: picked.pick.estimatedCostUsd,
    considered,
    commandEnv: granite.commandEnv(route),
  };
}

function doctor(opts = {}) {
  const catalog = parseCatalog(opts.catalog || SNAPSHOT_20260826);
  const spend = opts.spend || granite.loadSpend(opts.spendFile);
  return {
    schema: 'bytedance-seed-yolo/doctor-v1',
    honesty: honesty(),
    liveOpenRouterSeed: catalog.map((m) => ({
      id: m.id,
      family: m.family,
      size: m.size,
      expensive: m.expensive,
      isFree: m.isFree,
      promptUsdPerM: m.promptUsdPerM,
      completionUsdPerM: m.completionUsdPerM,
    })),
    spend,
    notes: [
      'Seed 2.1 Turbo is $0.50/$2.50 per M — not the cheap rail. Default is 1.6-flash or 2.0-mini.',
      'Seed2.1 Pro is not listed on OpenRouter as of 2026-08-26 (live: flash/mini/1.6/lite/turbo/2.0-code). No :free Seed.',
      'Office/spreadsheet/slides steal from seed.bytedance.com Seed2.1 — cheap Seed, not Turbo.',
      'Coding stays glm-coding. Do not edit Codex AGENT-542 files or seed-yolo-wrapper.js.',
    ],
  };
}

function parseArgs(argv) {
  const out = {
    task: '', json: false, doctor: false, probeCatalog: false, paidOk: false, preferSeed: false,
    catalogFile: '', spendFile: '', help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--doctor') out.doctor = true;
    else if (a === '--probe-catalog') out.probeCatalog = true;
    else if (a === '--paid-ok') out.paidOk = true;
    else if (a === '--prefer-seed') out.preferSeed = true;
    else if (a === '--catalog-file') out.catalogFile = argv[++i] || '';
    else if (a === '--spend-file') out.spendFile = argv[++i] || '';
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  return out;
}

async function fetchCatalog(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const url = new URL(OPENROUTER_MODELS);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Accept: 'application/json', 'User-Agent': 'bytedance-seed-yolo-router/1' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (err) { reject(err); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('catalog timeout')); });
    req.end();
  });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('Usage: node tools/bytedance-seed-yolo-router.js --task "..." [--json] [--doctor] [--probe-catalog] [--paid-ok]\n');
    return 0;
  }
  let catalog = args.catalogFile ? JSON.parse(fs.readFileSync(args.catalogFile, 'utf8')) : SNAPSHOT_20260826;
  if (args.probeCatalog) catalog = await fetchCatalog();
  if (args.doctor && !args.task) {
    const report = doctor({ catalog, spendFile: args.spendFile });
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `seed models=${report.liveOpenRouterSeed.map((m) => m.id).join(',')}\n`);
    return 0;
  }
  const route = selectRoute({
    task: args.task,
    catalog,
    spendFile: args.spendFile,
    paidOk: args.paidOk,
    preferSeed: args.preferSeed,
  });
  const payload = { schema: 'bytedance-seed-yolo/route-v1', route };
  if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${route.id} → ${route.provider} / ${route.model}\nreason: ${route.reason}\n`);
  return 0;
}

module.exports = {
  POLICY_VERSION,
  SNAPSHOT_20260826,
  EXPENSIVE,
  honesty,
  taskSignals,
  parseCatalog,
  estimateCostUsd,
  selectRoute,
  doctor,
  parseArgs,
  main,
};

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}
