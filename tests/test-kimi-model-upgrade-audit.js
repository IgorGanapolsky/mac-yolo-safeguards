'use strict';

const assert = require('assert');

const {
  RECOMMENDED_MODEL,
  collect,
  parseArgs,
  recommendedFallback,
  render,
  scoreCandidate,
} = require('../tools/kimi-model-upgrade-audit');

const {
  FRONTIER_K3_MODEL,
  FRONTIER_K3_GATEWAY_ALIASES,
  frontierK3OptIn,
} = require('../tools/kimi-model-upgrade-audit');

assert.strictEqual(RECOMMENDED_MODEL, 'kimi-k2.7-code');
assert.strictEqual(FRONTIER_K3_MODEL, 'kimi-k3');
assert.ok(FRONTIER_K3_GATEWAY_ALIASES.includes('kimi-code-k3'));
assert.deepStrictEqual(parseArgs(['--config', '/tmp/hermes.yaml', '--json']), {
  config: '/tmp/hermes.yaml',
  json: true,
  help: false,
  gatewayUrl: process.env.HERMES_LITELLM_URL || 'http://127.0.0.1:4010',
});
assert.strictEqual(recommendedFallback().context_length, 256000);
assert.strictEqual(scoreCandidate(recommendedFallback()), 95);
assert(
  scoreCandidate({ provider: 'kimi-coding', model: 'kimi-k2.6', context_length: 256000 }) <
    scoreCandidate(recommendedFallback()),
);
// K3 opt-in scores high but does not beat recommended coding fallback
assert(
  scoreCandidate({ provider: 'kimi-coding', model: 'kimi-k3', context_length: 1000000 }) <
    scoreCandidate(recommendedFallback()),
);
assert.strictEqual(frontierK3OptIn().context_length, 1000000);

const ready = collect({
  skipGateway: true,
  config: {
    model: { provider: 'nous', default: 'stepfun/step-3.7-flash:free' },
    fallback_providers: [recommendedFallback()],
  },
});
assert.strictEqual(ready.score, 95);
assert.strictEqual(ready.findings.length, 0);
assert(render(ready).includes('kimi-coding/kimi-k2.7-code'));
assert(render(ready).includes('kimi-k3'));

const legacy = collect({
  skipGateway: true,
  config: {
    model: {},
    fallback_providers: [{ provider: 'kimi-coding', model: 'kimi-k2.6', context_length: 256000 }],
  },
});
assert(
  legacy.findings.some(
    (finding) => finding.title === 'Kimi K2.7 Code is not configured as a fallback candidate',
  ),
);
assert(legacy.findings.some((finding) => finding.title === 'Legacy Kimi fallback is still present'));

const missing = collect({
  skipGateway: true,
  config: { model: {}, fallback_providers: [] },
});
assert.strictEqual(missing.score, 0);
assert(missing.findings.some((finding) => finding.severity === 'high'));

console.log('Kimi model upgrade audit tests: PASS');
