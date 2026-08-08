'use strict';

const assert = require('assert');
const { loadMemAlignMemoryPack, evaluateCodeWithMemAlign } = require('../tools/memalign-agent-judge');

console.log('=== Testing Databricks MemAlign LLM Judge Engine ===');

const pack = loadMemAlignMemoryPack();
assert.strictEqual(pack.schema, 'databricks-memalign/v1', 'Schema matches databricks-memalign/v1');

const cleanResult = evaluateCodeWithMemAlign('const sum = (a, b) => a + b;');
assert.strictEqual(cleanResult.passed, true, 'Clean code passes MemAlign judge');
assert.strictEqual(cleanResult.alignmentScore, 1.0, 'Alignment score is 1.0');

const botSlopResult = evaluateCodeWithMemAlign('As an AI language model, here is a breakdown of your code.');
assert.strictEqual(botSlopResult.passed, false, 'Bot slop fails MemAlign judge');
assert.ok(botSlopResult.violations.some(v => v.type === 'BOT_SLOP_DETECTED'), 'Detects BOT_SLOP_DETECTED violation');

console.log('✅ Databricks MemAlign LLM Judge Test PASSED!');
