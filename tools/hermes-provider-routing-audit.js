#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SAFE_GATEWAY_PATHS = Object.freeze([
  '/health/liveliness',
  '/health/readiness',
  '/v1/models',
]);

function stripComment(value) {
  return String(value || '').split('#', 1)[0].trim().replace(/^['"]|['"]$/g, '');
}

function topLevelSection(text, name) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${name}:`);
  if (start < 0) return '';
  const selected = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    selected.push(line);
  }
  return selected.join('\n');
}

function scalar(section, key) {
  const match = String(section || '').match(new RegExp(`^\\s{2}${key}:\\s*(.+)$`, 'm'));
  return match ? stripComment(match[1]) : '';
}

function parseHermesRouting(configText) {
  const model = topLevelSection(configText, 'model');
  const fallbacks = topLevelSection(configText, 'fallback_providers');
  const rows = [];
  let current = null;
  for (const line of fallbacks.split(/\r?\n/)) {
    const provider = line.match(/^\s*-\s*provider:\s*(.+)$/);
    if (provider) {
      current = { provider: stripComment(provider[1]), model: '' };
      rows.push(current);
      continue;
    }
    const modelMatch = line.match(/^\s+model:\s*(.+)$/);
    if (current && modelMatch) current.model = stripComment(modelMatch[1]);
  }
  return {
    primary: { provider: scalar(model, 'provider'), model: scalar(model, 'default') },
    fallbacks: rows,
  };
}

function parseLiteLlmRouting(configText) {
  const text = String(configText || '');
  const aliases = [...text.matchAll(/^\s*-\s*model_name:\s*([^\s#]+)/gm)].map((match) => match[1]);
  const strategy = (text.match(/^\s*routing_strategy:\s*([^\s#]+)/m) || [])[1] || '';
  const fallbackSection = topLevelSection(text, 'router_settings');
  const fallbackSources = [
    ...[...fallbackSection.matchAll(/^\s*-\s*([A-Za-z0-9._-]+):\s*\[/gm)]
      .map((match) => match[1]),
    ...[...fallbackSection.matchAll(/\{\s*["']([A-Za-z0-9._-]+)["']\s*:\s*\[/g)]
      .map((match) => match[1]),
  ];
  return {
    aliases: [...new Set(aliases)],
    strategy,
    fallbackText: fallbackSection,
    fallbackSources: [...new Set(fallbackSources)],
    preCallChecks: /^\s*enable_pre_call_checks:\s*true\s*(?:#.*)?$/m.test(fallbackSection),
    backgroundHealthChecks: /^\s*background_health_checks:\s*true\s*(?:#.*)?$/m.test(text),
  };
}

function familyForModel(model) {
  const value = String(model || '').toLowerCase();
  if (value.includes('kimi') || value.includes('moonshot')) return 'kimi';
  if (value.includes('glm') || value.includes('z-ai') || value.includes('zai')) return 'glm';
  if (value.includes('local') || value.includes('qwen') || value.includes('gemma') || value.includes('omlx')) return 'local';
  return 'other';
}

function buildAudit(evidence) {
  const hermes = parseHermesRouting(evidence.hermesConfig);
  const gateway = parseLiteLlmRouting(evidence.liteLlmConfig);
  const wrapperRoute = evidence.wrapperRoute || {};
  const primaryFamily = familyForModel(hermes.primary.model);
  const fallbackFamilies = [...new Set(hermes.fallbacks.map((item) => familyForModel(item.model)))];
  const catalogFamilies = [...new Set(gateway.aliases.map(familyForModel))];
  const gatewayFallbackFamilies = [...new Set(
    gateway.aliases
      .filter((alias) => gateway.fallbackText.includes(alias))
      .map(familyForModel),
  )];
  const exactPrimaryInCatalog = gateway.aliases.includes(hermes.primary.model);
  const exactPrimaryHasGatewayFallback = gateway.fallbackSources.includes(hermes.primary.model);
  const wrapperRouteMatchesPrimary = wrapperRoute.provider === hermes.primary.provider
    && wrapperRoute.model === hermes.primary.model;
  const differentFallbackFamily = fallbackFamilies.some((family) => family !== primaryFamily)
    || gatewayFallbackFamilies.some((family) => family !== primaryFamily);
  const safeProbe = evidence.safeProbe || {};
  const checks = {
    gatewayLive: safeProbe.liveliness === 200,
    gatewayReady: safeProbe.readiness === 200,
    modelCatalogReadable: safeProbe.models === 200,
    exactPrimaryInCatalog,
    exactPrimaryHasGatewayFallback,
    kimiConfigured: catalogFamilies.includes('kimi'),
    glmConfigured: catalogFamilies.includes('glm'),
    localConfigured: catalogFamilies.includes('local'),
    latencyOrCostStrategyConfigured: Boolean(gateway.strategy),
    preCallChecks: gateway.preCallChecks,
    crossFamilyFallback: differentFallbackFamily,
    wrapperRouteMatchesPrimary,
    runtimeTaskRouterWired: Boolean(evidence.runtimeTaskRouterWired),
    safeHealthContract: SAFE_GATEWAY_PATHS.every(
      (item) => item.split('/').filter(Boolean).length >= 2,
    ),
  };
  const gaps = [];
  if (!checks.wrapperRouteMatchesPrimary) gaps.push('wrapper_route_drift');
  if (!checks.runtimeTaskRouterWired) gaps.push('task_router_not_wired');
  if (!checks.exactPrimaryInCatalog) gaps.push('primary_alias_missing');
  if (!checks.exactPrimaryHasGatewayFallback) gaps.push('primary_gateway_fallback_missing');
  if (!checks.crossFamilyFallback) gaps.push('single_family_fallback');
  if (!(checks.gatewayLive && checks.gatewayReady && checks.modelCatalogReadable)) gaps.push('safe_gateway_probe_failed');
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    schema: 'hermes/provider-routing-audit-v1',
    checkedAt: evidence.checkedAt || new Date().toISOString(),
    healthy: gaps.length === 0,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    hermes,
    gateway: {
      aliasCount: gateway.aliases.length,
      families: catalogFamilies,
      strategy: gateway.strategy || null,
      backgroundHealthChecks: gateway.backgroundHealthChecks,
      fallbackSources: gateway.fallbackSources,
    },
    wrapperRoute: {
      provider: wrapperRoute.provider || null,
      model: wrapperRoute.model || null,
    },
    checks,
    gaps,
    proofBoundary: {
      configuredIsNotAuthenticated: true,
      safeProbePaths: SAFE_GATEWAY_PATHS,
      upstreamGenerationUsed: false,
      providerAuthentication: 'unknown_without_budgeted_generation_probe',
    },
  };
}

function findGatewayCredentials(configText) {
  const providers = topLevelSection(configText, 'providers');
  const lines = providers.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s{2}litellm-gateway:\s*$/.test(line));
  if (start < 0) return { baseUrl: 'http://127.0.0.1:4010', apiKey: '' };
  const selected = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(line)) break;
    selected.push(line);
  }
  const block = selected.join('\n');
  const baseUrl = stripComment((block.match(/^\s+(?:base_url|api):\s*(.+)$/m) || [])[1] || 'http://127.0.0.1:4010/v1');
  const apiKey = stripComment((block.match(/^\s+api_key:\s*(.+)$/m) || [])[1] || '');
  return { baseUrl: baseUrl.replace(/\/v1\/?$/, ''), apiKey };
}

async function safeGatewayProbe(baseUrl, apiKey, fetchImpl = fetch) {
  const statuses = {};
  for (const endpoint of SAFE_GATEWAY_PATHS) {
    try {
      const response = await fetchImpl(`${baseUrl}${endpoint}`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5_000),
      });
      if (endpoint === '/health/liveliness') statuses.liveliness = response.status;
      if (endpoint === '/health/readiness') statuses.readiness = response.status;
      if (endpoint === '/v1/models') statuses.models = response.status;
    } catch (_error) {
      if (endpoint === '/health/liveliness') statuses.liveliness = 0;
      if (endpoint === '/health/readiness') statuses.readiness = 0;
      if (endpoint === '/v1/models') statuses.models = 0;
    }
  }
  return statuses;
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_error) { return {}; }
}

async function collect(options = {}) {
  const home = options.home || os.homedir();
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const hermesConfigPath = options.hermesConfigPath || path.join(home, '.hermes/config.yaml');
  const liteLlmConfigPath = options.liteLlmConfigPath
    || process.env.HERMES_LITELLM_CONFIG
    || path.join(home, 'workspace/git/igor/hermes-eval/litellm/config.yaml');
  const routeReceiptPath = options.routeReceiptPath || path.join(home, '.hermes/receipts/hermes-yolo/latest.json');
  const wrapperPath = options.wrapperPath || path.join(repoRoot, 'hermes-yolo-wrapper.js');
  const hermesConfig = fs.readFileSync(hermesConfigPath, 'utf8');
  const liteLlmConfig = fs.readFileSync(liteLlmConfigPath, 'utf8');
  const routeReceipt = readJson(routeReceiptPath).route || {};
  const wrapperSource = fs.readFileSync(wrapperPath, 'utf8');
  const credentials = findGatewayCredentials(hermesConfig);
  const safeProbe = options.safeProbe || await safeGatewayProbe(credentials.baseUrl, credentials.apiKey, options.fetchImpl);
  return buildAudit({
    hermesConfig,
    liteLlmConfig,
    wrapperRoute: { provider: routeReceipt.provider, model: routeReceipt.model },
    runtimeTaskRouterWired: /hermes-yolo-route-policy|hermes-economic-router/.test(wrapperSource),
    safeProbe,
  });
}

async function main() {
  const receipt = await collect();
  const receiptDir = process.env.HERMES_PROVIDER_AUDIT_RECEIPT_DIR
    || path.join(os.homedir(), '.hermes/receipts/provider-routing-audit');
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(receiptDir, 'latest.json'), `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = receipt.healthy ? 0 : 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`provider routing audit failed: ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = {
  SAFE_GATEWAY_PATHS,
  buildAudit,
  collect,
  familyForModel,
  findGatewayCredentials,
  parseHermesRouting,
  parseLiteLlmRouting,
  safeGatewayProbe,
  topLevelSection,
};
