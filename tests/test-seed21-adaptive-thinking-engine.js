'use strict';

const assert = require('assert');
const { Seed21AdaptiveThinkingEngine } = require('../tools/seed21-adaptive-thinking-engine');

console.log('=== Testing ByteDance Seed 2.1 Adaptive Thinking Engine ===');

const engine = new Seed21AdaptiveThinkingEngine();

// 1. Fast path zero-token thinking for simple edits
const fastPath = engine.allocateThinkingBudget({ prompt: 'fix typo in README' });
assert.strictEqual(fastPath.thinkingMode, 'fast_path');
assert.strictEqual(fastPath.allocatedBudgetTokens, 0);

// 2. Adaptive thinking for multi-file edits
const adaptive = engine.allocateThinkingBudget({ prompt: 'multi-file update across 5 components' });
assert.strictEqual(adaptive.thinkingMode, 'adaptive_thinking');
assert.strictEqual(adaptive.allocatedBudgetTokens, 2048);

// 3. Deep reasoning for architecture tasks
const deep = engine.allocateThinkingBudget({ prompt: 'Design multi-agent refactor architecture' });
assert.strictEqual(deep.thinkingMode, 'deep_reasoning');
assert.strictEqual(deep.allocatedBudgetTokens, 8192);

// 4. Ark API Payload generation
const payload = engine.buildArkPayload('Design multi-agent architecture');
assert.strictEqual(payload.model, 'seed-2.1-pro');
assert.strictEqual(payload.thinking_config.thinking_budget, 8192);

console.log('✅ ByteDance Seed 2.1 Adaptive Thinking Engine Tests PASSED!');
