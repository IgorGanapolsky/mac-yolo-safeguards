#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReceipt: buildSearchReceipt,
  parseArgs: parseSearchArgs,
} = require('./hermes-parallel-search');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(REPO, 'config', 'thumbgate-aeo-prompts.json');
const DEFAULT_DIR = path.join(os.homedir(), '.hermes', 'receipts', 'thumbgate-aeo');
const DEFAULT_LATEST = path.join(DEFAULT_DIR, 'latest.json');
const DEFAULT_HISTORY = path.join(DEFAULT_DIR, 'history.jsonl');
const PROVIDER_COST_PER_RUN_USD = 0.001;
const HARD_MONTHLY_BUDGET_USD = 0.1;

const POSITIVE_TERMS = Object.freeze([
  'private', 'reliable', 'safe', 'secure', 'trusted', 'useful', 'recommended', 'local-first',
]);
const NEGATIVE_TERMS = Object.freeze([
  'breach', 'broken', 'fake', 'insecure', 'scam', 'slow', 'unsafe', 'unreliable',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    execute: false,
    write: false,
    json: false,
    config: DEFAULT_CONFIG,
    latest: DEFAULT_LATEST,
    history: DEFAULT_HISTORY,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--config') options.config = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--latest') options.latest = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--history') options.history = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (parsed.schema !== 'thumbgate-aeo-prompts/v1') throw new Error('Unsupported AEO prompt schema');
  if (!Array.isArray(parsed.queries) || parsed.queries.length !== 3) {
    throw new Error('AEO monitor requires exactly three stable prompts');
  }
  if (!Array.isArray(parsed.technicalChecks) || parsed.technicalChecks.length < 4) {
    throw new Error('AEO monitor requires technical discovery checks');
  }
  if (!(Number(parsed.monthlyBudgetUsd) > 0) || Number(parsed.monthlyBudgetUsd) > HARD_MONTHLY_BUDGET_USD) {
    throw new Error(`AEO monthly budget must be between $0 and $${HARD_MONTHLY_BUDGET_USD}`);
  }
  return parsed;
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function countTerms(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
}

function resultText(result) {
  return [result?.title, ...(Array.isArray(result?.excerpts) ? result.excerpts : [])]
    .filter(Boolean)
    .join(' ');
}

function isCanonicalCitation(rawUrl, canonicalHost) {
  try {
    const host = new URL(String(rawUrl || '')).hostname.toLowerCase().replace(/^www\./, '');
    return host === canonicalHost || host.endsWith(`.${canonicalHost}`);
  } catch (_error) {
    return false;
  }
}

function analyzeVisibility(results, config) {
  const safeResults = Array.isArray(results) ? results : [];
  const brand = String(config.brand).toLowerCase();
  const host = String(config.canonicalHost).toLowerCase();
  let citationCount = 0;
  let mentionCount = 0;
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const evidenceUrls = [];

  for (const result of safeResults) {
    const cited = isCanonicalCitation(result?.url, host);
    if (cited) citationCount += 1;
    const text = resultText(result);
    const mentioned = cited || text.toLowerCase().includes(brand) || text.toLowerCase().includes(host);
    if (!mentioned) continue;
    mentionCount += 1;
    if (result?.url) evidenceUrls.push(String(result.url));
    const positive = countTerms(text, POSITIVE_TERMS);
    const negative = countTerms(text, NEGATIVE_TERMS);
    if (negative > positive) sentiment.negative += 1;
    else if (positive > negative) sentiment.positive += 1;
    else sentiment.neutral += 1;
  }

  return {
    resultCount: safeResults.length,
    citationCount,
    mentionCount,
    citationShare: safeResults.length ? round(citationCount / safeResults.length) : 0,
    mentionShare: safeResults.length ? round(mentionCount / safeResults.length) : 0,
    sentiment,
    evidenceUrls: [...new Set(evidenceUrls)].slice(0, 10),
    status: safeResults.length === 0 ? 'no-results' : mentionCount > 0 ? 'present' : 'absent',
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function readHistory(historyPath) {
  try {
    return fs.readFileSync(historyPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (_error) {
    return [];
  }
}

function monthlySpend(historyPath, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  return round(readHistory(historyPath)
    .filter((entry) => String(entry.generatedAt || '').startsWith(month))
    .reduce((sum, entry) => sum + Number(entry.cost?.providerCostUsd || 0), 0), 6);
}

function visibilityDelta(previous, current) {
  const prior = previous?.metrics;
  if (!prior || typeof prior.citationCount !== 'number') {
    return { baseline: true, citationChange: null, mentionChange: null, citationLoss: false };
  }
  const citationChange = current.citationCount - prior.citationCount;
  const mentionChange = current.mentionCount - prior.mentionCount;
  return {
    baseline: false,
    citationChange,
    mentionChange,
    citationLoss: citationChange < 0,
  };
}

async function fetchWithTimeout(url, fetchImpl, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { headers: { accept: 'text/html,text/plain,application/json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeTechnical(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const checks = [];
  for (const check of config.technicalChecks) {
    const url = new URL(check.path, config.baseUrl).toString();
    try {
      const response = await fetchWithTimeout(url, fetchImpl, dependencies.timeoutMs || 10000);
      const body = await response.text();
      const missing = check.includes.filter((needle) => !body.includes(needle));
      checks.push({ id: check.id, url, status: response.status, pass: response.ok && missing.length === 0, missing });
    } catch (error) {
      checks.push({ id: check.id, url, status: null, pass: false, missing: check.includes, error: error.name || 'Error' });
    }
  }
  return { pass: checks.every((check) => check.pass), checks };
}

function buildSearchOptions(config) {
  const args = [
    '--objective', 'Measure neutral web-source visibility for secure Hermes web control and local-to-cloud agent continuity.',
    '--mode', 'turbo',
    '--max-results', '10',
    '--max-chars-total', '5000',
    '--max-chars-per-result', '1200',
    '--client-model', 'thumbgate-aeo-monitor-v1',
    '--latency-target-ms', '30000',
    '--execute', '--paid-ok', '--max-cost-usd', String(PROVIDER_COST_PER_RUN_USD),
  ];
  for (const query of config.queries) args.push('--query', query.prompt);
  return parseSearchArgs(args);
}

async function runMonitor(options = {}, dependencies = {}) {
  const config = dependencies.config || loadConfig(options.config || DEFAULT_CONFIG);
  const now = dependencies.now ? new Date(dependencies.now) : new Date();
  const latestPath = options.latest || DEFAULT_LATEST;
  const historyPath = options.history || DEFAULT_HISTORY;
  const previous = readJson(latestPath);
  const technical = dependencies.technical || await probeTechnical(config, dependencies);
  const spentBefore = monthlySpend(historyPath, now);
  const projectedSpend = round(spentBefore + PROVIDER_COST_PER_RUN_USD, 6);
  const budget = Math.min(Number(config.monthlyBudgetUsd), HARD_MONTHLY_BUDGET_USD);

  let provider = {
    attempted: false,
    status: options.execute ? 'blocked' : 'dry-run',
    estimatedCostUsd: PROVIDER_COST_PER_RUN_USD,
    actualCostUsd: 0,
    resultCount: 0,
    latencyMs: null,
    transport: null,
    blocker: options.execute ? null : 'execution_not_requested',
  };
  let metrics = analyzeVisibility([], config);

  if (options.execute && projectedSpend > budget) {
    provider.blocker = 'monthly_budget_exhausted';
  } else if (options.execute) {
    const searchOptions = buildSearchOptions(config);
    const buildReceiptImpl = dependencies.buildSearchReceipt || buildSearchReceipt;
    const search = await buildReceiptImpl(searchOptions, dependencies.searchDependencies || {});
    provider = {
      attempted: Boolean(search.execution?.attempted),
      status: search.overallStatus,
      estimatedCostUsd: Number(search.pricing?.estimatedCostUsd || PROVIDER_COST_PER_RUN_USD),
      actualCostUsd: search.execution?.attempted ? Number(search.pricing?.estimatedCostUsd || PROVIDER_COST_PER_RUN_USD) : 0,
      resultCount: Number(search.execution?.resultCount || 0),
      latencyMs: search.execution?.durationMs ?? null,
      transport: search.execution?.transport || null,
      blocker: search.readiness?.blocker || null,
    };
    metrics = analyzeVisibility(search.execution?.results, config);
  }

  const delta = visibilityDelta(previous, metrics);
  const providerPass = provider.status === 'pass' || provider.status === 'dry-run';
  const overallStatus = provider.blocker === 'monthly_budget_exhausted'
    ? 'blocked'
    : technical.pass && providerPass ? 'pass' : provider.status === 'fail' ? 'fail' : 'warn';

  return {
    schema: 'thumbgate-aeo-monitor/receipt-v1',
    generatedAt: now.toISOString(),
    querySetVersion: config.version,
    surface: 'Parallel Search web-source citation proxy; not direct Google AI Overview telemetry',
    cadence: config.cadence,
    overallStatus,
    technical,
    provider,
    metrics,
    delta,
    cost: {
      currency: 'USD',
      monthlyHardLimitUsd: budget,
      spentBeforeUsd: spentBefore,
      providerCostUsd: provider.actualCostUsd,
      projectedAfterUsd: round(spentBefore + provider.actualCostUsd, 6),
      scheduledMaximumRunsPerMonth: 5,
      scheduledMaximumUsd: round(PROVIDER_COST_PER_RUN_USD * 5, 6),
    },
  };
}

function historyEntry(receipt) {
  return {
    schema: 'thumbgate-aeo-monitor/trace-v1',
    generatedAt: receipt.generatedAt,
    querySetVersion: receipt.querySetVersion,
    overallStatus: receipt.overallStatus,
    technicalPass: receipt.technical.pass,
    provider: {
      attempted: receipt.provider.attempted,
      status: receipt.provider.status,
      resultCount: receipt.provider.resultCount,
      latencyMs: receipt.provider.latencyMs,
      blocker: receipt.provider.blocker,
    },
    metrics: receipt.metrics,
    delta: receipt.delta,
    cost: receipt.cost,
  };
}

function writeReceipt(receipt, latestPath = DEFAULT_LATEST, historyPath = DEFAULT_HISTORY) {
  fs.mkdirSync(path.dirname(latestPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(historyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(latestPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.appendFileSync(historyPath, `${JSON.stringify(historyEntry(receipt))}\n`, { mode: 0o600 });
  fs.chmodSync(latestPath, 0o600);
  fs.chmodSync(historyPath, 0o600);
  return { latestPath, historyPath };
}

function usage() {
  return `Usage: node tools/thumbgate-aeo-monitor.js [--execute] [--write] [--json]\n\n` +
    `A weekly run makes one $${PROVIDER_COST_PER_RUN_USD.toFixed(3)} Turbo search request. ` +
    `The local monthly hard stop is $${HARD_MONTHLY_BUDGET_USD.toFixed(2)}.`;
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    const receipt = await runMonitor(options);
    if (options.write) receipt.artifacts = writeReceipt(receipt, options.latest, options.history);
    console.log(options.json ? JSON.stringify(receipt, null, 2) : [
      `ThumbGate AEO: ${receipt.overallStatus}`,
      `Technical: ${receipt.technical.pass ? 'pass' : 'fail'}`,
      `Visibility: ${receipt.metrics.status}`,
      `Citations: ${receipt.metrics.citationCount}/${receipt.metrics.resultCount}`,
      `Cost: $${receipt.cost.providerCostUsd} (month $${receipt.cost.projectedAfterUsd}/$${receipt.cost.monthlyHardLimitUsd})`,
    ].join('\n'));
    if (['blocked', 'fail'].includes(receipt.overallStatus)) process.exitCode = 2;
  } catch (error) {
    console.error(`thumbgate-aeo-monitor: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_HISTORY,
  DEFAULT_LATEST,
  HARD_MONTHLY_BUDGET_USD,
  PROVIDER_COST_PER_RUN_USD,
  analyzeVisibility,
  buildSearchOptions,
  historyEntry,
  isCanonicalCitation,
  loadConfig,
  monthlySpend,
  parseArgs,
  probeTechnical,
  runMonitor,
  visibilityDelta,
  writeReceipt,
};

if (require.main === module) main();
