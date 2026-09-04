#!/usr/bin/env node
'use strict';

/**
 * Focused Sol-unstick contract: inherited OpenAI env cannot become the child default.
 */

const assert = require('assert');
const wrapper = require('../tools/jcode-yolo-wrapper');

const keys = {
  zaiKey: 'test-zai-key',
  openrouterKey: 'test-or-key',
  disableKeychain: true,
  budgetAllowsPaid: true,
  jcodeBin: process.execPath,
  zaiQuotaExhausted: false,
};

{
  const config = wrapper.resolveJcodeConfig({
    JCODE_DEFAULT_PROVIDER: 'openai',
    JCODE_MODEL: 'gpt-5.6-sol',
  }, '', keys);
  assert.strictEqual(config.provider, 'zai');
  assert.strictEqual(config.model, 'glm-5.3');
  assert.notStrictEqual(config.model, 'gpt-5.6-sol');
  console.log('PASS 1: inherited openai/sol quarantined to zai/glm-5.3');
}

{
  const route = wrapper.selectRoute('implement a TypeScript API handler', {
    JCODE_DEFAULT_PROVIDER: 'openai',
  }, keys);
  assert.strictEqual(route.model, 'qwen/qwen3.7-plus');
  const env = wrapper.buildChildEnv(route, { JCODE_DEFAULT_PROVIDER: 'openai' });
  assert.strictEqual(env.JCODE_DEFAULT_PROVIDER, 'openrouter');
  assert.strictEqual(env.JCODE_MODEL, 'qwen/qwen3.7-plus');
  console.log('PASS 2: coding prompt switches off Sol onto Qwen 3.7 Plus');
}

{
  const original = console.log;
  console.log = () => {};
  const doc = wrapper.runDoctor(true, { JCODE_DEFAULT_PROVIDER: 'openai' }, keys);
  console.log = original;
  assert.strictEqual(doc.report.solPinned, false);
  assert.strictEqual(doc.report.childModel, 'glm-5.3');
  console.log('PASS 3: doctor refuses Sol as interactive default');
}

console.log('\nALL JCODE-YOLO WRAPPER SOL-UNSTICK CHECKS PASSED');
