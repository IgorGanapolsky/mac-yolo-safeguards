'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CAPABILITIES,
  buildPlan,
  collect,
  parseArgs,
  render,
} = require('../tools/merge-gateway-readiness');

assert.ok(CAPABILITIES.some((capability) => capability.key === 'customer_cost_attribution'));
assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--fail-on-high']).failOnHigh, true);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

const weakPlan = buildPlan({
  evidence: {
    hasLocalDefault: false,
    hasOpenRouterConfigured: true,
    hasOpenRouterFailures: true,
    hasSelfHarness: false,
    hasRevenueControls: false,
    hasSlimYoloWrapper: false,
    ciCoversSelfHarness: false,
    hasMergeGatewayProvider: false,
    hasGatewayDocs: false,
  },
});
assert.ok(weakPlan.migrationNeedScore >= 80);
assert.ok(weakPlan.recommendation.includes('Evaluate Merge Gateway'));
assert.ok(weakPlan.blockers.some((blocker) => blocker.includes('OpenRouter credit/context failures')));
assert.ok(weakPlan.capabilities.some((capability) => capability.key === 'dlp_prompt_injection' && capability.productionGap));

const mitigatedPlan = buildPlan({
  evidence: {
    hasLocalDefault: true,
    hasOpenRouterConfigured: true,
    hasOpenRouterFailures: false,
    hasSelfHarness: true,
    hasRevenueControls: true,
    hasSlimYoloWrapper: true,
    ciCoversSelfHarness: true,
    hasMergeGatewayProvider: false,
    hasGatewayDocs: false,
  },
});
assert.ok(mitigatedPlan.migrationNeedScore < weakPlan.migrationNeedScore);
assert.ok(mitigatedPlan.recommendation.includes('Stay local/OpenRouter'));
assert.ok(render(mitigatedPlan).includes('Merge Gateway Readiness'));
assert.ok(render(mitigatedPlan).includes('Do not replace OpenRouter for experimentation'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-gateway-readiness-'));
const repo = path.join(tmp, 'repo');
fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(repo, 'tools', 'revenue-control-checks.js'), 'captured_cents stripe customer checkout payment');
fs.writeFileSync(path.join(repo, 'tools', 'hermes-self-harness.js'), 'Hermes Self-Harness self-harness-inspired criticalOpenCount');
fs.writeFileSync(path.join(repo, 'hermes-yolo-wrapper.js'), "const DEFAULT_TOOLSETS = 'terminal,file,web,code_execution,memory,clarify';");
fs.writeFileSync(path.join(repo, 'scripts', 'ci-verify.sh'), 'node tests/test-hermes-self-harness.js');
const config = path.join(tmp, 'config.yaml');
const errors = path.join(tmp, 'errors.log');
fs.writeFileSync(config, 'provider: custom:ollama-local-64k\nopenrouter: {}\n');
fs.writeFileSync(errors, '');
const evidence = collect({ repo, hermesConfig: config, errorsLog: errors });
assert.strictEqual(evidence.hasLocalDefault, true);
assert.strictEqual(evidence.hasSelfHarness, true);
assert.strictEqual(evidence.hasRevenueControls, true);
assert.strictEqual(evidence.hasOpenRouterFailures, false);

fs.rmSync(tmp, { recursive: true, force: true });

console.log('Merge Gateway readiness tests: PASS');
