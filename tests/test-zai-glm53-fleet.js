#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zai-glm53-'));
process.env.ZAI_API_SPEND_FILE = path.join(tmp, 'spend.json');

const budget = require('../tools/zai-api-budget-guard');
const fleet = require('../tools/zai-glm53-fleet');

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, err) {
  console.error(`FAIL ${name}: ${err.message}`);
  process.exitCode = 1;
}

function run(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

run('coding plan is not metered', () => {
  assert.strictEqual(
    budget.isMeteredRoute({
      baseUrl: fleet.CODING_BASE,
      provider: 'zai-coding-glm',
      model: 'glm-5.3',
      costTier: 'subscription_coding_plan',
      marginalTokenCostUsd: 0,
    }),
    false,
  );
});

run('paas v4 and openrouter are metered', () => {
  assert.strictEqual(
    budget.isMeteredRoute({
      baseUrl: fleet.METERED_BASE,
      provider: 'zai-glm53-metered',
      model: 'glm-5.3',
      costTier: 'native_metered',
    }),
    true,
  );
  assert.strictEqual(
    budget.isMeteredRoute({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'z-ai/glm-5.3',
      costTier: 'metered',
    }),
    true,
  );
});

run('coding plan checkGate always allows', () => {
  const gate = budget.checkGate(99, fleet.ROUTES['zai-coding-plan']);
  assert.strictEqual(gate.allowed, true);
  assert.match(gate.reason, /Coding Plan/i);
});

run('$10 fail-closed on metered', () => {
  budget.saveSpendState({
    month: budget.monthKey(),
    monthlyBudgetCapUsd: 10,
    currentSpentUsd: 9.99,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    history: [],
  });
  const deny = budget.checkGate(0.05, { forceMetered: true });
  assert.strictEqual(deny.allowed, false);
  assert.match(deny.reason, /exceed/i);
  const allow = budget.checkGate(0.005, { forceMetered: true });
  assert.strictEqual(allow.allowed, true);
});

run('recordSpend then deny at cap', () => {
  budget.saveSpendState({
    month: budget.monthKey(),
    monthlyBudgetCapUsd: 10,
    currentSpentUsd: 9.5,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    history: [],
  });
  const after = budget.recordSpend(0.5, { model: 'z-ai/glm-5.3', route: 'openrouter' });
  assert.ok(after.currentSpentUsd >= 10);
  const gate = budget.checkGate(0.01, { forceMetered: true });
  assert.strictEqual(gate.allowed, false);
});

run('estimateCostUsd matches published 0.9/2.8', () => {
  const cost = budget.estimateCostUsd(1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 3.7) < 1e-9);
});

run('pickEffort smart', () => {
  assert.strictEqual(budget.pickEffort('summarize this note'), 'low');
  assert.strictEqual(budget.pickEffort('implement a fix'), 'high');
  assert.strictEqual(budget.pickEffort('security audit of the auth path'), 'max');
});

run('rewriteThinking never disabled', () => {
  const out = budget.rewriteThinking({ thinking: { type: 'disabled' }, reasoning_effort: 'off' });
  assert.strictEqual(out.thinking.type, 'enabled');
  assert.strictEqual(out.reasoning_effort, 'low');
  const keep = budget.rewriteThinking({ thinking: { type: 'enabled' }, reasoning_effort: 'max' });
  assert.strictEqual(keep.reasoning_effort, 'max');
});

run('upsertYamlBlock rewrites metered alias onto coding URL', () => {
  const dirty = `providers:\n  zai-coding-glm53:\n    base_url: ${fleet.METERED_BASE}\n    model: glm-5.3\n`;
  const next = fleet.upsertYamlBlock(dirty, 'zai-coding-glm53', [
    `base_url: ${fleet.CODING_BASE}`,
    'model: glm-5.3',
  ]);
  assert.ok(next.includes(fleet.CODING_BASE));
  assert.ok(!next.includes(fleet.METERED_BASE));
});

run('applyHermesConfig + doctor isolate to tmp', () => {
  const hermesDir = path.join(tmp, 'hermes');
  const hermesConfig = path.join(hermesDir, 'config.yaml');
  fs.mkdirSync(hermesDir, { recursive: true });
  fs.writeFileSync(
    hermesConfig,
    `model:\n  default: glm-coding\nproviders:\n  zai-coding-glm53:\n    base_url: ${fleet.METERED_BASE}\n    model: glm-5.3\n`,
  );
  const envPath = path.join(hermesDir, '.env');
  fs.writeFileSync(envPath, 'Z_AI_API_KEY=test-not-a-real-key\n');
  fleet.applyHermesConfig({ hermesDir, hermesConfig });
  const raw = fs.readFileSync(hermesConfig, 'utf8');
  assert.ok(raw.includes(fleet.CODING_BASE));
  assert.ok(raw.includes('zai-glm53-metered'));
  assert.ok(!/zai-coding-glm53:[\s\S]{0,200}api\.z\.ai\/api\/paas\/v4/.test(raw));
  const doc = fleet.runDoctor({ hermesDir, hermesConfig, hermesEnv: envPath });
  assert.strictEqual(doc.dangerousMeteredAlias, false);
  assert.strictEqual(doc.codingPlanConfigured, true);
  assert.strictEqual(doc.zaiKeyPresent, true);
  assert.strictEqual(doc.status, 'healthy');
});

run('applyClaudeSettings does not hijack Anthropic Claude Code', () => {
  const home = path.join(tmp, 'home');
  const hermesDir = path.join(home, '.hermes');
  const claudeSettings = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(claudeSettings, JSON.stringify({ env: { ENABLE_SECURITY_REMINDER: '0' } }, null, 2));
  const out = fleet.applyClaudeSettings({ home, hermesDir, claudeSettings });
  assert.strictEqual(out.mutatedSettings, false);
  const settings = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
  assert.ok(!settings.env.ANTHROPIC_BASE_URL);
  const envFile = fs.readFileSync(out.envFile, 'utf8');
  assert.ok(envFile.includes('glm-5.3[1m]'));
  assert.ok(!envFile.includes('sk-'));
});

run('classifyRoute prefers coding plan', () => {
  const out = fleet.classifyRoute('implement a fix');
  assert.strictEqual(out.primary.baseUrl, fleet.CODING_BASE);
  assert.strictEqual(out.primary.marginalTokenCostUsd, 0);
  assert.strictEqual(out.effort, 'high');
  assert.strictEqual(out.thinking.thinking.type, 'enabled');
});

run('patchLiteLLMConfig adds glm-5.3 alias + thinking', () => {
  const cfg = path.join(tmp, 'litellm-config.yaml');
  fs.writeFileSync(
    cfg,
    `model_list:
  - model_name: glm-coding
    litellm_params:
      model: openai/glm-5.2
      api_base: https://api.z.ai/api/coding/paas/v4
      api_key: os.environ/Z_AI_API_KEY
      timeout: 45
    model_info: {mode: chat, max_input_tokens: 1000000, max_output_tokens: 128000}

  - model_name: glm-5.2
    litellm_params:
      model: openai/glm-5.2
      api_base: https://api.z.ai/api/coding/paas/v4
      api_key: os.environ/Z_AI_API_KEY
      timeout: 45
    model_info: {mode: chat, max_input_tokens: 1000000, max_output_tokens: 128000}
`,
  );
  const first = fleet.patchLiteLLMConfig(cfg);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.changed, true);
  const raw = fs.readFileSync(cfg, 'utf8');
  assert.ok(raw.includes('model_name: glm-5.3'));
  assert.ok(raw.includes('openai/glm-5.3'));
  assert.ok(raw.includes('"thinking"'));
  const second = fleet.patchLiteLLMConfig(cfg);
  assert.strictEqual(second.changed, false);
});

run('CLI --json doctor never prints a key', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'zai-glm53-fleet.js'), 'budget', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ZAI_API_SPEND_FILE: process.env.ZAI_API_SPEND_FILE },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.monthlyBudgetCapUsd, 10);
  assert.ok(!/sk-[A-Za-z0-9]/.test(r.stdout));
});

run('bin/zai-glm53 exists and is executable', () => {
  const bin = path.join(ROOT, 'bin', 'zai-glm53');
  assert.ok(fs.existsSync(bin));
  const st = fs.statSync(bin);
  assert.ok((st.mode & 0o111) !== 0);
});

if (process.exitCode) {
  console.error('zai-glm53 fleet tests FAILED');
  process.exit(1);
}
console.log('zai-glm53 fleet tests: PASS');
