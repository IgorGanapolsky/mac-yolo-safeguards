#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  SAFE_GATEWAY_PATHS,
  buildAudit,
  findGatewayCredentials,
  parseHermesRouting,
  parseLiteLlmRouting,
  safeGatewayProbe,
} = require('../tools/hermes-provider-routing-audit');

const hermesConfig = `
model:
  provider: custom:litellm-gateway
  default: kimi-code-fast
providers:
  litellm-gateway:
    base_url: http://127.0.0.1:4010/v1
    api_key: local-secret
fallback_providers:
  - provider: custom:litellm-gateway
    model: glm-coding
  - provider: custom:litellm-gateway
    model: hermes-local
`;

const liteLlmConfig = `
model_list:
  - model_name: kimi-code-fast
  - model_name: glm-coding
  - model_name: hermes-local
router_settings:
  routing_strategy: latency-based-routing
  enable_pre_call_checks: true # refuse unhealthy deployments before routing
  fallbacks:
    - kimi-code-fast: [glm-coding, hermes-local]
general_settings:
  background_health_checks: true # safe only when checks do not generate completions
`;

assert.deepStrictEqual(parseHermesRouting(hermesConfig), {
  primary: { provider: 'custom:litellm-gateway', model: 'kimi-code-fast' },
  fallbacks: [
    { provider: 'custom:litellm-gateway', model: 'glm-coding' },
    { provider: 'custom:litellm-gateway', model: 'hermes-local' },
  ],
});
const parsedGateway = parseLiteLlmRouting(liteLlmConfig);
assert.deepStrictEqual(parsedGateway.aliases, ['kimi-code-fast', 'glm-coding', 'hermes-local']);
assert.strictEqual(parsedGateway.strategy, 'latency-based-routing');
assert.strictEqual(parsedGateway.preCallChecks, true);
assert.strictEqual(parsedGateway.backgroundHealthChecks, true);
assert.deepStrictEqual(parsedGateway.fallbackSources, ['kimi-code-fast']);

const inlineFallbacks = parseLiteLlmRouting(liteLlmConfig.replace(
  'fallbacks:\n    - kimi-code-fast: [glm-coding, hermes-local]',
  'fallbacks: [{"kimi-code-fast": ["glm-coding", "hermes-local"]}]',
));
assert.deepStrictEqual(inlineFallbacks.fallbackSources, ['kimi-code-fast']);
assert.deepStrictEqual(findGatewayCredentials(hermesConfig), {
  baseUrl: 'http://127.0.0.1:4010',
  apiKey: 'local-secret',
});
assert(!SAFE_GATEWAY_PATHS.includes('/health'), 'aggregate /health spends upstream calls and is forbidden');

const healthy = buildAudit({
  hermesConfig,
  liteLlmConfig,
  wrapperRoute: { provider: 'custom:litellm-gateway', model: 'kimi-code-fast' },
  runtimeTaskRouterWired: true,
  safeProbe: { liveliness: 200, readiness: 200, models: 200 },
  checkedAt: '2026-08-02T00:00:00.000Z',
});
assert.strictEqual(healthy.healthy, true);
assert.strictEqual(healthy.score, 100);
assert.deepStrictEqual(healthy.gateway.families.sort(), ['glm', 'kimi', 'local']);
assert.strictEqual(healthy.proofBoundary.upstreamGenerationUsed, false);
assert.strictEqual(healthy.proofBoundary.providerAuthentication, 'unknown_without_budgeted_generation_probe');

const missingPrimaryFallback = buildAudit({
  hermesConfig,
  liteLlmConfig: liteLlmConfig.replace(
    '- kimi-code-fast: [glm-coding, hermes-local]',
    '- glm-coding: [hermes-local]',
  ),
  wrapperRoute: { provider: 'custom:litellm-gateway', model: 'kimi-code-fast' },
  runtimeTaskRouterWired: true,
  safeProbe: { liveliness: 200, readiness: 200, models: 200 },
});
assert.strictEqual(missingPrimaryFallback.healthy, false);
assert(missingPrimaryFallback.gaps.includes('primary_gateway_fallback_missing'));

const drift = buildAudit({
  hermesConfig,
  liteLlmConfig,
  wrapperRoute: { provider: 'custom:litellm-gateway', model: 'glm-coding' },
  runtimeTaskRouterWired: false,
  safeProbe: { liveliness: 200, readiness: 200, models: 200 },
});
assert.strictEqual(drift.healthy, false);
assert(drift.gaps.includes('wrapper_route_drift'));
assert(drift.gaps.includes('task_router_not_wired'));

const called = [];
async function fakeFetch(url, options) {
  called.push({ url, options });
  return { status: 200 };
}
safeGatewayProbe('http://127.0.0.1:4010', 'secret', fakeFetch).then((result) => {
  assert.deepStrictEqual(result, { liveliness: 200, readiness: 200, models: 200 });
  assert.deepStrictEqual(called.map((item) => new URL(item.url).pathname), SAFE_GATEWAY_PATHS);
  assert(called.every((item) => item.options.headers.Authorization === 'Bearer secret'));
  const source = fs.readFileSync(path.join(__dirname, '../tools/hermes-provider-routing-audit.js'), 'utf8');
  assert(!/['"]\/health['"]/.test(source), 'the active aggregate health endpoint must never enter the audit');
  console.log('Hermes provider routing audit tests: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
