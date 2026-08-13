'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_MODEL,
  DEFAULT_PROFILE,
  SeedYoloAgent,
  assertCostPolicy,
  assertSeedIdentity,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  isSeedModelId,
  resolveConfig,
} = require('../tools/seed-yolo-wrapper');

console.log('=== Testing seed-yolo Seed model lock ===');

async function testSuite() {
  assert.strictEqual(DEFAULT_MODEL, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(DEFAULT_PROFILE, 'seed');
  assert.strictEqual(isSeedModelId('bytedance-seed/seed-2-1-turbo'), true);
  assert.strictEqual(isSeedModelId('qwen3.5:9b-hermes-64k'), false);
  assert.strictEqual(isSeedModelId('openrouter/free'), false);

  const freeConfig = {
    provider: 'openrouter',
    model: 'openrouter/free',
    profile: 'seed',
    toolsets: 'terminal,file,web,code_execution,clarify,skills,memory',
    skills: '',
    hermesBin: path.join(os.homedir(), '.local', 'bin', 'hermes'),
    costGuarded: false,
    allowMetered: false,
    openrouterKey: null,
  };
  assert.doesNotThrow(() => assertCostPolicy(freeConfig));
  assert.throws(
    () => assertSeedIdentity({ provider: 'openrouter', model: 'openrouter/free' }, {}),
    /must be a Seed id/,
  );
  assert.throws(
    () => assertCostPolicy({
      ...freeConfig,
      model: 'bytedance-seed/seed-2-1-turbo',
      allowMetered: false,
    }),
    /refusing metered route/,
  );
  assert.throws(
    () => assertSeedIdentity({
      provider: 'custom:ollama-local-64k',
      model: 'qwen3.5:9b-hermes-64k',
    }, {}),
    /refuses local\/non-seed/,
  );
  assert.doesNotThrow(() => assertSeedIdentity({
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-64k',
  }, { SEED_YOLO_ALLOW_NON_SEED: '1' }));

  // Key present → Seed default + metered allowed (unless SEED_YOLO_ALLOW_METERED=0).
  const keyOnly = resolveConfig({ OPENROUTER_API_KEY: 'sk-or-test-key-not-real' });
  assert.strictEqual(keyOnly.provider, 'openrouter');
  assert.strictEqual(keyOnly.model, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(keyOnly.profile, 'seed');
  assert.strictEqual(keyOnly.allowMetered, true);
  assert.doesNotThrow(() => assertCostPolicy(keyOnly));
  assert.doesNotThrow(() => assertSeedIdentity(keyOnly, {}));

  const denyMetered = resolveConfig({
    OPENROUTER_API_KEY: 'sk-or-test-key-not-real',
    SEED_YOLO_ALLOW_METERED: '0',
  });
  assert.strictEqual(denyMetered.model, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(denyMetered.allowMetered, false);
  assert.throws(() => assertCostPolicy(denyMetered), /refusing metered route/);

  const paid = resolveConfig({
    OPENROUTER_API_KEY: 'sk-or-test-key-not-real',
    SEED_YOLO_ALLOW_METERED: '1',
  });
  assert.strictEqual(paid.provider, 'openrouter');
  assert.strictEqual(paid.model, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(paid.allowMetered, true);
  assert.doesNotThrow(() => assertCostPolicy(paid));

  const args = buildHermesArgs(paid, 'oneshot', 'inspect this repository');
  assert.deepStrictEqual(args.slice(0, 6), [
    '--profile', 'seed',
    '--provider', 'openrouter',
    '--model', 'bytedance-seed/seed-2-1-turbo',
  ]);
  assert(args.includes('--yolo'));
  assert(args.includes('--accept-hooks'));
  assert(args.includes('--toolsets'));
  assert(args.includes('-z'));
  assert.strictEqual(args.at(-1), 'inspect this repository');

  const contextFile = findContextFile(path.resolve(__dirname, '..', 'tools'));
  assert.strictEqual(contextFile, path.resolve(__dirname, '..', 'AGENTS.md'));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-yolo-agent-test-'));
  try {
    const fakeHermes = path.join(tempDir, 'hermes');
    fs.writeFileSync(fakeHermes, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeHermes, 0o755);
    const fakeConfig = { ...paid, hermesBin: fakeHermes, profile: '' };
    const doctorRunner = (_binary, doctorArgs) => {
      if (doctorArgs.includes('tools')) {
        return {
          status: 0,
          stdout: fakeConfig.toolsets.split(',').filter((n) => !['browseros-neo', 'context7'].includes(n)).map((name) => `enabled  ${name}`).join('\n'),
          stderr: '',
        };
      }
      if (doctorArgs.includes('mcp')) {
        return { status: 0, stdout: 'enabled  browseros-neo\nenabled  context7\n', stderr: '' };
      }
      return { status: 0, stdout: '152 enabled, 0 disabled', stderr: '' };
    };
    const report = inspectHermes(fakeConfig, doctorRunner);
    assert.strictEqual(report.ready, true);
    assert.strictEqual(report.seedIdentity, true);
    assert.strictEqual(report.enabledSkills, 152);
    assert.strictEqual(report.contextAutoInjection, true);

    const disabledMcpRunner = (_binary, doctorArgs) => {
      if (doctorArgs.includes('tools')) {
        return {
          status: 0,
          stdout: fakeConfig.toolsets.split(',').filter((n) => !['browseros-neo', 'context7'].includes(n)).map((name) => `enabled  ${name}`).join('\n'),
          stderr: '',
        };
      }
      if (doctorArgs.includes('mcp')) {
        return { status: 0, stdout: 'browseros-neo disabled\ncontext7 disabled\n', stderr: '' };
      }
      return { status: 0, stdout: '152 enabled, 0 disabled', stderr: '' };
    };
    const notReady = inspectHermes(fakeConfig, disabledMcpRunner);
    assert.strictEqual(notReady.ready, false);
    assert(notReady.missingToolsets.includes('browseros-neo'));

    const calls = [];
    const agent = new SeedYoloAgent({
      config: { ...fakeConfig, profile: 'seed' },
      childRunner: async (binary, childArgs) => {
        calls.push({ binary, childArgs });
        return { exitCode: 0 };
      },
      doctorRunner,
      env: { OPENROUTER_API_KEY: 'sk-or-test-key-not-real', SEED_YOLO_ALLOW_METERED: '1' },
    });
    const oneShot = await agent.run(['-z', 'read package.json']);
    assert.strictEqual(oneShot.exitCode, 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].childArgs.at(-1), 'read package.json');
    assert(calls[0].childArgs.includes('bytedance-seed/seed-2-1-turbo'));
    assert(calls[0].childArgs.includes('--profile'));
    assert(calls[0].childArgs.includes('seed'));

    // Refuse qwen override without escape hatch.
    const bad = new SeedYoloAgent({
      config: {
        ...fakeConfig,
        provider: 'custom:ollama-local-64k',
        model: 'qwen3.5:9b-hermes-64k',
        profile: 'seed',
      },
      childRunner: async () => ({ exitCode: 0 }),
      doctorRunner,
      env: {},
    });
    let threw = false;
    try {
      await bad.run(['-z', 'hi']);
    } catch (e) {
      threw = /refuses local|Seed id/i.test(e.message);
    }
    assert.strictEqual(threw, true);

    const doctor = await agent.run(['doctor', '--json']);
    assert.strictEqual(doctor.exitCode, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('✅ seed-yolo Seed model lock tests PASSED');
}

testSuite().catch((error) => {
  console.error('Test failure:', error);
  process.exit(1);
});
