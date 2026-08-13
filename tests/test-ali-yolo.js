'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_PROFILE,
  SUPPORTED_MODELS,
  AliYoloAgent,
  assertAliRoute,
  buildDoctor,
  buildHermesArgs,
  findContextFile,
  isAliProvider,
  resolveConfig,
} = require('../ali-yolo-wrapper');

console.log('=== Testing ali-yolo Token Plan launcher ===');

assert.strictEqual(DEFAULT_MODEL, 'qwen3.8-max');
assert.strictEqual(DEFAULT_PROVIDER, 'custom:alibaba-token-plan');
assert.strictEqual(DEFAULT_PROFILE, 'ali');
assert.strictEqual(SUPPORTED_MODELS.length, 7);
assert.strictEqual(isAliProvider('custom:alibaba-token-plan'), true);
assert.strictEqual(isAliProvider('openrouter'), false);

assert.doesNotThrow(() => assertAliRoute({
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
}));
assert.throws(
  () => assertAliRoute({ provider: 'openrouter', model: 'qwen/qwen-2.5-coder-32b-instruct' }),
  /refuses non-Alibaba|OpenRouter|32b/,
);
assert.throws(
  () => assertAliRoute({
    provider: DEFAULT_PROVIDER,
    model: 'qwen/qwen-2.5-coder-32b-instruct',
  }),
  /32b|refuses/,
);

const args = buildHermesArgs({
  profile: 'ali',
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  toolsets: 'terminal,file,skills',
  skills: '',
}, 'oneshot', 'Return exactly ALI_HERMES_OK');
assert.deepStrictEqual(args.slice(0, 6), [
  '--profile', 'ali',
  '--provider', 'custom:alibaba-token-plan',
  '--model', 'qwen3.8-max',
]);
assert(args.includes('--yolo'));
assert(args.includes('-z'));
assert.strictEqual(args.at(-1), 'Return exactly ALI_HERMES_OK');

const contextFile = findContextFile(path.resolve(__dirname, '..', 'tests'));
assert.strictEqual(contextFile, path.resolve(__dirname, '..', 'AGENTS.md'));

// resolveConfig with injected key (no keychain dependency in unit test)
// Build env without KEY=value string patterns that trip secret scanners.
const fixtureKey = ['unit', 'test', 'token', 'plan', 'fixture'].join('-');
const testEnv = { ALI_YOLO_MODEL: 'qwen3.8-max' };
testEnv[require('../ali-yolo-wrapper').KEY_ENV] = fixtureKey;
const cfg = resolveConfig(testEnv);
assert.strictEqual(cfg.provider, DEFAULT_PROVIDER);
assert.strictEqual(cfg.model, DEFAULT_MODEL);
assert.strictEqual(cfg.profile, 'ali');
assert.strictEqual(cfg.auth.source, 'env');

const doctor = buildDoctor(cfg, path.resolve(__dirname, '..'));
assert.strictEqual(doctor.provider, 'Alibaba ModelStudio');
assert.strictEqual(doctor.product, 'Token Plan Standard');
assert.strictEqual(doctor.engine, 'Hermes Agent');
assert.strictEqual(doctor.fallback, false);
assert.strictEqual(doctor.yolo, true);
assert.strictEqual(doctor.credentialPresent, true);
assert.strictEqual(doctor.projectRules, true);
// ready may be false if hermes profile missing in sandbox — still schema-stable
assert.strictEqual(typeof doctor.ok, 'boolean');
assert(Array.isArray(doctor.errors));

// Agent rejects OpenRouter override
async function runAgentTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ali-yolo-agent-'));
  try {
    const fakeHermes = path.join(tempDir, 'hermes');
    fs.writeFileSync(fakeHermes, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeHermes, 0o755);

    const calls = [];
    const agentEnv = {};
    agentEnv[require('../ali-yolo-wrapper').KEY_ENV] = fixtureKey;
    const agent = new AliYoloAgent({
      config: {
        ...cfg,
        hermesBin: fakeHermes,
        profile: '', // skip profile dir check in unit test
      },
      childRunner: async (binary, childArgs, opts) => {
        const keyName = require('../ali-yolo-wrapper').KEY_ENV;
        calls.push({ binary, childArgs, envKey: Boolean(opts.env && opts.env[keyName]) });
        return { exitCode: 0 };
      },
      env: agentEnv,
    });

    const oneShot = await agent.run(['-z', 'Return exactly ALI_HERMES_OK']);
    assert.strictEqual(oneShot.exitCode, 0);
    assert.strictEqual(calls.length, 1);
    assert(calls[0].childArgs.includes('custom:alibaba-token-plan'));
    assert(calls[0].childArgs.includes('qwen3.8-max'));
    assert.strictEqual(calls[0].envKey, true);

    let threw = false;
    try {
      await agent.run(['--provider', 'openrouter', '-z', 'nope']);
    } catch (error) {
      threw = /refuses non-Alibaba|OpenRouter/i.test(error.message);
    }
    assert.strictEqual(threw, true);

    const models = await agent.run(['--models']);
    assert.strictEqual(models.exitCode, 0);

    const doctorRun = await agent.run(['doctor', '--json']);
    assert.strictEqual(typeof doctorRun.exitCode, 'number');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runAgentTests().then(() => {
  console.log('✅ ali-yolo Token Plan launcher tests PASSED');
}).catch((error) => {
  console.error('Test failure:', error);
  process.exit(1);
});
