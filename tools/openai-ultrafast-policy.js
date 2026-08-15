#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODEL = 'gpt-5.6-sol';
const SERVICE_TIER = 'ultrafast';
const MONTHLY_API_CAP_USD = 10;
const STANDARD_SOL_INPUT_USD_PER_M = 5;
const STANDARD_SOL_OUTPUT_USD_PER_M = 30;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

const PRIVATE_RE = /\b(secret|credential|password|passcode|api[ -]?key|private key|pii|medical|payroll|confidential|local only)\b/i;
const URGENCY_RE = /\b(now|urgent|real[- ]?time|live|outage|incident|p0|sev[ -]?[01]|while (?:the )?(?:call|customer|system)|latency[- ]critical)\b/i;
const HIGH_VALUE_RE = /\b(logs?|traces?|root cause|rollback|transactions?|fraud|suspicious|voice|customer support|checkout|inventory|experiment|research|security event|production)\b/i;

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function defaultPaths(home = os.homedir()) {
  const stateDir = path.join(home, '.local', 'state', 'ai-api-budget');
  return {
    hermesEnv: path.join(home, '.hermes', '.env'),
    codexAuth: path.join(home, '.codex', 'auth.json'),
    codexModels: path.join(home, '.codex', 'models_cache.json'),
    openrouterSpend: path.join(home, '.hermes', 'openrouter-monthly-spend.json'),
    glmSpend: path.join(home, '.hermes', 'glm-monthly-spend.json'),
    stateDir,
    ledger: path.join(stateDir, 'openai-ultrafast.json'),
    lock: path.join(stateDir, 'openai-ultrafast.lock'),
    receipts: path.join(stateDir, 'receipts', 'openai-ultrafast'),
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function parseEnvValue(filePath, name) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(new RegExp(`^${name}=([^\\r\\n]+)$`, 'm'));
    return match && match[1].trim()
      ? match[1].trim().replace(/^['"]|['"]$/g, '')
      : null;
  } catch {
    return null;
  }
}

function loadOpenAIApiKey(env = process.env, options = {}) {
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) {
    return { value: env.OPENAI_API_KEY.trim(), source: 'environment' };
  }

  const paths = options.paths || defaultPaths();
  const fromHermes = parseEnvValue(paths.hermesEnv, 'OPENAI_API_KEY');
  if (fromHermes) return { value: fromHermes, source: 'hermes-env' };
  if (options.disableKeychain) return null;

  const keychainRunner = options.keychainRunner || ((service) => spawnSync(
    'security', ['find-generic-password', '-s', service, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ));
  try {
    const result = keychainRunner('OPENAI_API_KEY');
    if (result && result.status === 0 && String(result.stdout || '').trim()) {
      return { value: String(result.stdout).trim(), source: 'keychain' };
    }
  } catch {}
  return null;
}

function getContractPricing(env = process.env) {
  const input = Number(env.OPENAI_ULTRAFAST_INPUT_USD_PER_M);
  const output = Number(env.OPENAI_ULTRAFAST_OUTPUT_USD_PER_M);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0) {
    return null;
  }
  return { inputUsdPerM: input, outputUsdPerM: output, source: 'operator-contract' };
}

function inspectCodex(paths = defaultPaths()) {
  const auth = readJson(paths.codexAuth, {});
  const models = readJson(paths.codexModels, {});
  const modelList = Array.isArray(models.models) ? models.models : [];
  const sol = modelList.find((item) => item && (item.slug === MODEL || item.id === MODEL));
  const tiers = Array.isArray(sol && sol.service_tiers) ? sol.service_tiers : [];
  return {
    authMode: typeof auth.auth_mode === 'string' ? auth.auth_mode : 'unknown',
    chatgptOAuthPresent: auth.auth_mode === 'chatgpt',
    advertisedTiers: tiers.map((tier) => tier && tier.id).filter(Boolean),
    ultrafastAdvertised: tiers.some((tier) => tier && tier.id === SERVICE_TIER),
  };
}

function classifyTask(prompt = '') {
  const text = String(prompt).trim();
  if (PRIVATE_RE.test(text)) return { eligible: false, route: 'local', reason: 'sensitive-local' };
  if (URGENCY_RE.test(text) && HIGH_VALUE_RE.test(text)) {
    return { eligible: true, route: 'ultrafast', reason: 'latency-critical-high-value' };
  }
  return { eligible: false, route: 'subscription-balanced', reason: 'not-latency-critical' };
}

function freshLedger(now = new Date()) {
  return {
    schema: 'openai-ultrafast-budget/v1',
    month: monthKey(now),
    monthlyCapUsd: MONTHLY_API_CAP_USD,
    spentUsd: 0,
    reservations: [],
    lastConfirmedAt: null,
    history: [],
  };
}

function loadLedger(paths = defaultPaths(), now = new Date()) {
  const existing = readJson(paths.ledger, null);
  const ledger = existing && existing.month === monthKey(now)
    ? { ...freshLedger(now), ...existing }
    : freshLedger(now);
  const currentMs = now.getTime();
  ledger.reservations = Array.isArray(ledger.reservations)
    ? ledger.reservations.filter((item) => Number(item.expiresAtMs) > currentMs)
    : [];
  ledger.history = Array.isArray(ledger.history) ? ledger.history.slice(-199) : [];
  return ledger;
}

function externalSpend(paths = defaultPaths(), now = new Date()) {
  const month = monthKey(now);
  const openrouter = readJson(paths.openrouterSpend, {});
  const glm = readJson(paths.glmSpend, {});
  const openrouterUsd = openrouter.month === month && Number.isFinite(Number(openrouter.currentSpentUsd))
    ? Number(openrouter.currentSpentUsd)
    : 0;
  const glmUsd = glm.month === month && Number.isFinite(Number(glm.totalCostUsd))
    ? Number(glm.totalCostUsd)
    : 0;
  return { openrouterUsd, glmUsd, totalUsd: openrouterUsd + glmUsd };
}

function budgetStatus(paths = defaultPaths(), now = new Date()) {
  const ledger = loadLedger(paths, now);
  const external = externalSpend(paths, now);
  const reservedUsd = ledger.reservations.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
  const committedUsd = external.totalUsd + Number(ledger.spentUsd || 0);
  return {
    month: monthKey(now),
    monthlyCapUsd: MONTHLY_API_CAP_USD,
    external,
    ultrafastSpentUsd: Number(ledger.spentUsd || 0),
    reservedUsd,
    committedUsd,
    availableUsd: Math.max(0, MONTHLY_API_CAP_USD - committedUsd - reservedUsd),
    lastUltrafastConfirmedAt: ledger.lastConfirmedAt || null,
  };
}

function withLedgerLock(paths, operation) {
  fs.mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 });
  let descriptor;
  try {
    descriptor = fs.openSync(paths.lock, 'wx', 0o600);
  } catch (error) {
    const wrapped = new Error('API budget ledger is busy; refusing an unreserved request');
    wrapped.code = 'BUDGET_LEDGER_BUSY';
    throw wrapped;
  }
  try {
    return operation();
  } finally {
    try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(paths.lock); } catch {}
  }
}

function estimateMaxCost(prompt, maxOutputTokens, pricing) {
  const worstCaseInputTokens = Buffer.byteLength(String(prompt), 'utf8') + 64;
  const raw = (worstCaseInputTokens / 1_000_000) * pricing.inputUsdPerM
    + (maxOutputTokens / 1_000_000) * pricing.outputUsdPerM;
  return Math.max(0.01, raw * 1.1);
}

function reserveBudget(paths, prompt, maxOutputTokens, pricing, now = new Date()) {
  return withLedgerLock(paths, () => {
    const ledger = loadLedger(paths, now);
    const status = budgetStatus(paths, now);
    const amountUsd = estimateMaxCost(prompt, maxOutputTokens, pricing);
    if (amountUsd > status.availableUsd) {
      const error = new Error(`request reservation $${amountUsd.toFixed(4)} exceeds shared API budget availability $${status.availableUsd.toFixed(4)}`);
      error.code = 'BUDGET_EXHAUSTED';
      throw error;
    }
    const reservation = {
      id: `${now.getTime().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      amountUsd,
      createdAt: now.toISOString(),
      expiresAtMs: now.getTime() + RESERVATION_TTL_MS,
    };
    ledger.reservations.push(reservation);
    atomicWriteJson(paths.ledger, ledger);
    return reservation;
  });
}

function usageCost(usage, pricing) {
  const inputTokens = Number(usage && usage.input_tokens) || 0;
  const outputTokens = Number(usage && usage.output_tokens) || 0;
  return {
    inputTokens,
    outputTokens,
    costUsd: (inputTokens / 1_000_000) * pricing.inputUsdPerM
      + (outputTokens / 1_000_000) * pricing.outputUsdPerM,
  };
}

function finalizeReservation(paths, reservation, result, now = new Date()) {
  return withLedgerLock(paths, () => {
    const ledger = loadLedger(paths, now);
    ledger.reservations = ledger.reservations.filter((item) => item.id !== reservation.id);
    if (result.costUsd > 0) ledger.spentUsd += result.costUsd;
    if (result.serviceTier === SERVICE_TIER) ledger.lastConfirmedAt = now.toISOString();
    ledger.history.push({
      timestamp: now.toISOString(),
      reservationId: reservation.id,
      serviceTier: result.serviceTier || null,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      costUsd: result.costUsd || 0,
      status: result.status,
    });
    atomicWriteJson(paths.ledger, ledger);
    return ledger;
  });
}

function releaseReservation(paths, reservation, status, now = new Date()) {
  return finalizeReservation(paths, reservation, {
    serviceTier: null, inputTokens: 0, outputTokens: 0, costUsd: 0, status,
  }, now);
}

function writeReceipt(paths, prompt, receipt) {
  fs.mkdirSync(paths.receipts, { recursive: true, mode: 0o700 });
  const safe = {
    schema: 'openai-ultrafast-receipt/v1',
    timestamp: receipt.timestamp,
    promptSha256: crypto.createHash('sha256').update(String(prompt)).digest('hex'),
    promptStored: false,
    ...receipt,
  };
  const fileName = `${safe.timestamp.replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`;
  const eventPath = path.join(paths.receipts, fileName);
  fs.writeFileSync(eventPath, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  atomicWriteJson(path.join(paths.receipts, 'latest.json'), safe);
  return { safe, eventPath };
}

function responseText(body) {
  if (typeof body.output_text === 'string') return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  return output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((item) => item && item.text).filter(Boolean).join('\n');
}

class OpenAIUltrafastPolicy {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.paths = options.paths || defaultPaths(options.home);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.now = options.now || (() => new Date());
    this.keychainRunner = options.keychainRunner;
  }

  doctor() {
    const now = this.now();
    const auth = loadOpenAIApiKey(this.env, {
      paths: this.paths,
      keychainRunner: this.keychainRunner,
      disableKeychain: Boolean(this.keychainRunner === null),
    });
    const pricing = getContractPricing(this.env);
    const codex = inspectCodex(this.paths);
    const budget = budgetStatus(this.paths, now);
    let status = 'ACCESS_UNCONFIRMED';
    if (!auth) status = 'API_KEY_MISSING';
    else if (!pricing) status = 'CONTRACT_PRICING_REQUIRED';
    else if (budget.availableUsd <= 0) status = 'BUDGET_EXHAUSTED';
    else if (budget.lastUltrafastConfirmedAt) status = 'READY_CONFIRMED';
    return {
      schema: 'openai-ultrafast-doctor/v1',
      status,
      ready: status === 'READY_CONFIRMED',
      model: MODEL,
      requestedServiceTier: SERVICE_TIER,
      accessControlledPreview: true,
      apiKeyPresent: Boolean(auth),
      apiKeySource: auth ? auth.source : null,
      contractPricingConfigured: Boolean(pricing),
      pricingSource: pricing ? pricing.source : null,
      codex,
      budget,
      exactServerTierProofRequired: true,
    };
  }

  route(prompt) {
    const classification = classifyTask(prompt);
    const doctor = this.doctor();
    if (!classification.eligible) return { ...classification, selected: classification.route, doctor };
    if (!doctor.apiKeyPresent) return { ...classification, selected: 'subscription-balanced', reason: 'ultrafast-api-key-missing', doctor };
    if (!doctor.contractPricingConfigured) return { ...classification, selected: 'subscription-balanced', reason: 'ultrafast-price-unknown', doctor };
    if (doctor.budget.availableUsd <= 0) return { ...classification, selected: 'subscription-balanced', reason: 'shared-api-budget-exhausted', doctor };
    return { ...classification, selected: SERVICE_TIER, reason: 'eligible-access-probe-or-confirmed-run', doctor };
  }

  async execute(prompt, options = {}) {
    const now = this.now();
    const classification = classifyTask(prompt);
    if (!classification.eligible && !options.probe) {
      const error = new Error('Ultrafast is reserved for latency-critical high-value work');
      error.code = 'ROUTE_NOT_ELIGIBLE';
      throw error;
    }
    const auth = loadOpenAIApiKey(this.env, {
      paths: this.paths,
      keychainRunner: this.keychainRunner,
      disableKeychain: Boolean(this.keychainRunner === null),
    });
    if (!auth) {
      const error = new Error('A metered OPENAI_API_KEY is required; ChatGPT OAuth is not an API key');
      error.code = 'API_KEY_MISSING';
      throw error;
    }
    const pricing = getContractPricing(this.env);
    if (!pricing) {
      const error = new Error('Ultrafast preview pricing is not public; configure the contracted input/output rates before any call');
      error.code = 'CONTRACT_PRICING_REQUIRED';
      throw error;
    }
    const maxOutputTokens = Math.max(1, Math.min(Number(options.maxOutputTokens) || 256, 2048));
    const reservation = reserveBudget(this.paths, prompt, maxOutputTokens, pricing, now);
    let body;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 45000);
      let response;
      try {
        response = await this.fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.value}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            service_tier: SERVICE_TIER,
            input: String(prompt),
            max_output_tokens: maxOutputTokens,
            store: false,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      body = await response.json();
      if (!response.ok) {
        const error = new Error(`OpenAI request failed with HTTP ${response.status}`);
        error.code = 'OPENAI_REQUEST_FAILED';
        error.httpStatus = response.status;
        throw error;
      }
    } catch (error) {
      releaseReservation(this.paths, reservation, error.code || 'request-failed', this.now());
      writeReceipt(this.paths, prompt, {
        timestamp: this.now().toISOString(), status: 'failed', serviceTier: null,
        inputTokens: 0, outputTokens: 0, costUsd: 0, errorCode: error.code || 'REQUEST_FAILED',
      });
      throw error;
    }

    const returnedTier = body.service_tier || null;
    const billingRates = returnedTier === SERVICE_TIER
      ? pricing
      : {
        inputUsdPerM: Math.max(pricing.inputUsdPerM, STANDARD_SOL_INPUT_USD_PER_M),
        outputUsdPerM: Math.max(pricing.outputUsdPerM, STANDARD_SOL_OUTPUT_USD_PER_M),
      };
    const usage = usageCost(body.usage, billingRates);
    const resultStatus = returnedTier === SERVICE_TIER ? 'confirmed' : 'tier-mismatch';
    finalizeReservation(this.paths, reservation, {
      ...usage, serviceTier: returnedTier, status: resultStatus,
    }, this.now());
    const { safe, eventPath } = writeReceipt(this.paths, prompt, {
      timestamp: this.now().toISOString(),
      status: resultStatus,
      model: body.model || MODEL,
      responseId: body.id || null,
      serviceTier: returnedTier,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      exactServerTierConfirmed: returnedTier === SERVICE_TIER,
    });
    if (returnedTier !== SERVICE_TIER) {
      const error = new Error(`server returned service_tier=${returnedTier || 'missing'}; Ultrafast is not proven`);
      error.code = 'ULTRAFAST_NOT_CONFIRMED';
      error.receipt = safe;
      throw error;
    }
    return { text: responseText(body), receipt: safe, receiptPath: eventPath };
  }
}

function parseArgs(argv) {
  const args = { command: 'doctor', json: false, prompt: '', maxOutputTokens: 256 };
  const rest = [...argv];
  if (['doctor', 'route', 'run', 'probe'].includes(rest[0])) args.command = rest.shift();
  else if (rest.length && !rest[0].startsWith('--')) args.command = 'run';
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--json') args.json = true;
    else if (item === '--prompt' && rest[index + 1]) args.prompt = rest[++index];
    else if (item === '--max-output-tokens' && rest[index + 1]) args.maxOutputTokens = Number(rest[++index]);
    else if (!item.startsWith('--')) args.prompt += `${args.prompt ? ' ' : ''}${item}`;
  }
  if (args.command === 'probe') args.prompt = 'Urgent production incident probe: reply with exactly ULTRAFAST_ACCESS_OK.';
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const policy = new OpenAIUltrafastPolicy();
  if (args.command === 'doctor') {
    const report = policy.doctor();
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 2 : 0)}\n`);
    return report.ready ? 0 : 2;
  }
  if (args.command === 'route') {
    process.stdout.write(`${JSON.stringify(policy.route(args.prompt), null, args.json ? 2 : 0)}\n`);
    return 0;
  }
  try {
    const result = await policy.execute(args.prompt, {
      probe: args.command === 'probe', maxOutputTokens: args.command === 'probe' ? 16 : args.maxOutputTokens,
    });
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`[ultrafast-yolo] BLOCKED: ${error.message}\n`);
    return error.code === 'ULTRAFAST_NOT_CONFIRMED' ? 69 : 78;
  }
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode; });
}

module.exports = {
  MODEL,
  SERVICE_TIER,
  MONTHLY_API_CAP_USD,
  OpenAIUltrafastPolicy,
  budgetStatus,
  classifyTask,
  defaultPaths,
  estimateMaxCost,
  getContractPricing,
  inspectCodex,
  loadOpenAIApiKey,
  main,
  reserveBudget,
};
