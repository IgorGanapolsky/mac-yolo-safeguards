#!/usr/bin/env node
'use strict';

/**
 * Proves jcode-yolo switches models by prompt and does NOT stick on GPT Sol
 * when the parent shell exports JCODE_DEFAULT_PROVIDER=openai.
 */

const assert = require('assert');
const {
  ROUTES,
  MONTHLY_BUDGET_USD,
  classifyPrompt,
  selectRoute,
  buildChildEnv,
  buildLaunch,
  healJcodeConfigToml,
  runDoctor,
} = require('../tools/jcode-yolo-wrapper');

const keys = {
  zaiKey: 'test-zai-key',
  openrouterKey: 'test-openrouter-key',
  disableKeychain: true,
  budgetAllowsPaid: true,
  zaiQuotaExhausted: false,
};

const inheritedOpenai = {
  JCODE_DEFAULT_PROVIDER: 'openai',
  JCODE_MODEL: 'gpt-5.6-sol',
};

async function runTests() {
  console.log('Starting JCode intelligent routing + Sol-unstick tests\n');

  const cyberClass = classifyPrompt('Audit codebase for potential prompt injection and SQL vulnerabilities');
  assert.strictEqual(cyberClass.routeId, 'glm53');
  const cyberRoute = selectRoute('Audit security flaws in auth.js', inheritedOpenai, keys);
  assert.strictEqual(cyberRoute.provider, 'zai');
  assert.strictEqual(cyberRoute.model, 'glm-5.3');
  console.log('  PASS 1 cyber -> glm-5.3');

  const mimoClass = classifyPrompt('Execute long-horizon multi-step agent planning across repo-wide architecture');
  assert.strictEqual(mimoClass.routeId, 'mimo_pro');
  const mimoRoute = selectRoute('Orchestrate repo-wide multi-step agent refactoring', inheritedOpenai, keys);
  assert.strictEqual(mimoRoute.provider, 'openrouter');
  assert.strictEqual(mimoRoute.model, 'xiaomi/mimo-v2.5-pro');
  console.log('  PASS 2 long-horizon -> MiMo');

  const fastClass = classifyPrompt('Quickly generate a helper script and boilerplate function');
  assert.strictEqual(fastClass.routeId, 'seed_turbo');
  const fastRoute = selectRoute('Quickly write a regex helper', inheritedOpenai, keys);
  assert.strictEqual(fastRoute.provider, 'openrouter');
  assert.strictEqual(fastRoute.model, 'bytedance-seed/seed-2-1-turbo');
  console.log('  PASS 3 fast -> Seed Turbo');

  const mmClass = classifyPrompt('Extract video frames and parse multimodal UI image assets');
  assert.strictEqual(mmClass.routeId, 'minimax_m3');
  const mmRoute = selectRoute('Analyze UI image layout and audio video media', inheritedOpenai, keys);
  assert.strictEqual(mmRoute.provider, 'openrouter');
  assert.strictEqual(mmRoute.model, 'minimax/minimax-m3');
  console.log('  PASS 4 multimodal -> MiniMax');

  const qwenClass = classifyPrompt('Implement a new TypeScript endpoint handler for users API');
  assert.strictEqual(qwenClass.routeId, 'qwen37_plus');
  const qwenRoute = selectRoute('Implement feature function in TypeScript', inheritedOpenai, keys);
  assert.strictEqual(qwenRoute.provider, 'openrouter');
  assert.strictEqual(qwenRoute.model, 'qwen/qwen3.7-plus');
  console.log('  PASS 5 coding -> Qwen 3.7 Plus');

  const localClass = classifyPrompt('Review customer data and private key in local storage');
  assert.strictEqual(localClass.routeId, 'local');
  const localRoute = selectRoute('Audit customer pii and private key', inheritedOpenai, keys);
  assert.strictEqual(localRoute.provider, 'ollama');
  assert.strictEqual(localRoute.model, ROUTES.local.model);
  console.log('  PASS 6 sensitive -> local');

  const gptClass = classifyPrompt('Use gpt sol for this formal proof');
  assert.strictEqual(gptClass.routeId, 'gpt_sol');
  const gptRoute = selectRoute('Run OpenAI GPT-5.6 Sol model', inheritedOpenai, keys);
  assert.strictEqual(gptRoute.provider, 'openai');
  assert.strictEqual(gptRoute.model, 'gpt-5.6-sol');
  console.log('  PASS 7 explicit GPT -> Sol');

  const empty = selectRoute('', inheritedOpenai, keys);
  assert.strictEqual(empty.provider, 'zai');
  assert.strictEqual(empty.model, 'glm-5.3');
  assert.notStrictEqual(empty.model, 'gpt-5.6-sol');
  assert.strictEqual(empty.inheritedDefaultQuarantined, true);
  console.log('  PASS 8 empty TUI + inherited openai -> glm-5.3 (not Sol)');

  const child = buildChildEnv(empty, inheritedOpenai);
  assert.strictEqual(child.JCODE_DEFAULT_PROVIDER, 'zai');
  assert.strictEqual(child.JCODE_ACTIVE_PROVIDER, 'zai');
  assert.strictEqual(child.JCODE_MODEL, 'glm-5.3');
  assert.strictEqual(child.JCODE_QUARANTINED_DEFAULT_PROVIDER, 'openai');
  assert.strictEqual(child.JCODE_QUARANTINED_MODEL, 'gpt-5.6-sol');
  console.log('  PASS 9 child env quarantines openai/sol');

  const fallback = selectRoute('Quickly write a helper', inheritedOpenai, {
    zaiKey: 'test-zai-key',
    openrouterKey: null,
    disableKeychain: true,
    budgetAllowsPaid: false,
    zaiQuotaExhausted: false,
  });
  assert.strictEqual(fallback.provider, 'zai');
  assert.strictEqual(fallback.model, 'glm-5.3');
  console.log('  PASS 10 metered fallback -> glm-5.3 under $10 cap');

  const tui = buildLaunch(empty, []);
  assert.strictEqual(tui.mode, 'interactive');
  assert.deepStrictEqual(tui.childArgs, ['--provider', 'zai', '--model', 'glm-5.3', '--no-update']);
  assert.ok(!tui.childArgs.includes('--resume'));
  console.log('  PASS 11 TUI launch is new session on glm-5.3, no resume');

  const admin = buildLaunch(empty, ['self-dev']);
  assert.strictEqual(admin.mode, 'admin');
  assert.deepStrictEqual(admin.childArgs.slice(0, 4), ['--provider', 'zai', '--model', 'glm-5.3']);
  assert.ok(admin.childArgs.includes('self-dev'));
  console.log('  PASS 12 self-dev stays admin (not run-as-prompt)');

  const original = console.log;
  console.log = () => {};
  let doctor;
  try {
    doctor = runDoctor(true, inheritedOpenai, { ...keys, jcodeBin: process.execPath });
  } finally {
    console.log = original;
  }
  assert.strictEqual(doctor.report.solPinned, false);
  assert.strictEqual(doctor.report.childDefaultProvider, 'zai');
  assert.strictEqual(doctor.report.childModel, 'glm-5.3');
  assert.strictEqual(MONTHLY_BUDGET_USD, 10);
  assert.ok(ROUTES.gpt_sol);
  console.log('  PASS 13 doctor: Sol not pinned, child env zai/glm-5.3');

  const exhausted = selectRoute('', inheritedOpenai, {
    zaiKey: 'test-zai-key',
    openrouterKey: 'test-or-key',
    disableKeychain: true,
    budgetAllowsPaid: true,
    zaiQuotaExhausted: true,
  });
  assert.strictEqual(exhausted.provider, 'litellm-hermes');
  assert.strictEqual(exhausted.model, 'hermes-local');
  assert.strictEqual(exhausted.providerProfile, 'litellm-hermes');
  assert.match(exhausted.reason, /fallback-to-hermes-local/);
  console.log('  PASS 14 zai exhausted -> hermes-local (not Novita glm-coding / OpenRouter)');

  const coerced = selectRoute('ping', { JCODE_ROUTE_MODEL: 'glm-coding' }, {
    zaiKey: 'test-zai-key',
    openrouterKey: 'test-or-key',
    disableKeychain: true,
    budgetAllowsPaid: true,
    zaiQuotaExhausted: true,
  });
  assert.strictEqual(coerced.model, 'hermes-local');
  assert.match(coerced.reason, /coerced-glm-coding-to-hermes-local/);
  const coercedLaunch = buildLaunch(coerced, []);
  assert.deepStrictEqual(coercedLaunch.childArgs.slice(0, 5), [
    '--provider-profile', 'litellm-hermes', '--model', 'hermes-local', '--no-update',
  ]);
  console.log('  PASS 15 glm-coding sticky override coerced to litellm hermes-local');

  {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const bad = 'api' + '_' + 'key';
    const p = path.join(os.tmpdir(), `jcode-heal-${process.pid}.toml`);
    fs.writeFileSync(p, `[providers.nous-portal]\nauth = "${bad}"\n\n[providers.litellm-hermes]\ndefault_model = "glm-coding"\n`);
    const healed = healJcodeConfigToml(p);
    const body = fs.readFileSync(p, 'utf8');
    fs.unlinkSync(p);
    assert.strictEqual(healed.healed, true);
    assert.match(body, /auth = "bearer"/);
    assert.match(body, /default_model = "hermes-local"/);
    console.log('  PASS 16 config.toml heal rewrites invalid auth + glm-coding default');
  }

  console.log('\nALL JCODE INTELLIGENT ROUTING TESTS PASSED (16/16)');
}

runTests().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
