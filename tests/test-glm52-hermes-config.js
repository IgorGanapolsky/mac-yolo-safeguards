'use strict';

const assert = require('assert');

const {
  PROVIDERS,
  buildPlan,
  commandToString,
  hermesConfigCommands,
  parseArgs,
  shellQuote,
} = require('../tools/glm52-hermes-config');

assert.deepStrictEqual(parseArgs([]).route, 'zenmux-free');
assert.strictEqual(parseArgs(['--route', 'openrouter', '--set-default']).setDefault, true);
assert.throws(() => parseArgs(['--route', 'missing']), /Unsupported route/);

assert.strictEqual(PROVIDERS['zenmux-free'].baseUrl, 'https://zenmux.ai/api/v1');
assert.strictEqual(PROVIDERS['zenmux-free'].model, 'z-ai/glm-5.2-free');
assert.strictEqual(PROVIDERS.openrouter.model, 'z-ai/glm-5.2');
assert.strictEqual(PROVIDERS['zai-native'].model, 'glm-5.2');
assert.strictEqual(PROVIDERS['zenmux-free'].contextLength, 1000000);
assert.strictEqual(PROVIDERS['zenmux-free'].maxOutputTokens, 128000);
assert.strictEqual(PROVIDERS['zenmux-free'].operationalMaxTokens, 4096);

const zenmuxCommands = hermesConfigCommands('zenmux-free', { setDefault: true });
const zenmuxText = zenmuxCommands.map(commandToString).join('\n');
assert.ok(zenmuxText.includes('providers.zenmux-glm52-free.base_url https://zenmux.ai/api/v1'));
assert.ok(zenmuxText.includes('providers.zenmux-glm52-free.key_env ZENMUX_API_KEY'));
assert.ok(zenmuxText.includes('providers.zenmux-glm52-free.api_key env:ZENMUX_API_KEY'));
assert.ok(zenmuxText.includes('providers.zenmux-glm52-free.model z-ai/glm-5.2-free'));
assert.ok(zenmuxText.includes('model.provider custom:zenmux-glm52-free'));
assert.ok(zenmuxText.includes('model.default z-ai/glm-5.2-free'));
assert.ok(zenmuxText.includes('model.max_tokens 4096'));
assert.ok(!zenmuxText.includes('max_output_tokens'));
assert.ok(!zenmuxText.includes('cost_tier'));
assert.ok(!zenmuxText.includes('best_for'));
assert.ok(!zenmuxText.includes('glm-4.7'));
assert.ok(!zenmuxText.includes('your-key'));

const plan = buildPlan({ route: 'zenmux-free', setDefault: false });
assert.strictEqual(plan.apiKeyReference, 'env:ZENMUX_API_KEY');
assert.ok(plan.missingEnv.includes('ZENMUX_API_KEY'));
assert.strictEqual(plan.commands.length, 10);

const openRouterPlan = buildPlan({ route: 'openrouter', setDefault: true });
assert.strictEqual(openRouterPlan.provider, 'openrouter-glm52');
assert.strictEqual(openRouterPlan.model, 'z-ai/glm-5.2');
assert.strictEqual(openRouterPlan.operationalMaxTokens, 4096);
assert.ok(openRouterPlan.commandText.some((line) => line.includes('env:OPENROUTER_API_KEY')));
assert.ok(openRouterPlan.commandText.some((line) => line.includes('providers.openrouter-glm52.key_env OPENROUTER_API_KEY')));
assert.ok(openRouterPlan.commandText.some((line) => line.includes('model.provider openrouter')));
assert.ok(!openRouterPlan.commandText.some((line) => line.includes('model.provider custom:openrouter-glm52')));
assert.ok(openRouterPlan.commandText.some((line) => line.includes('model.max_tokens 4096')));

assert.strictEqual(shellQuote("Igor's model"), "'Igor'\\''s model'");
assert.strictEqual(shellQuote('z-ai/glm-5.2-free'), 'z-ai/glm-5.2-free');

console.log('GLM 5.2 Hermes config tests: PASS');
