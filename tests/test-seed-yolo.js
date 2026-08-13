'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
  DEFAULT_MODEL,
  SeedYoloAgent,
  assertCostPolicy,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  resolveConfig,
} = require('../tools/seed-yolo-wrapper');

console.log('=== Testing seed-yolo OpenRouter Seed launcher ===');

async function testSuite() {
  assert.strictEqual(DEFAULT_MODEL, 'openrouter/free');

  const freeConfig = {
    provider: 'openrouter',
    model: 'openrouter/free',
    toolsets: 'terminal,file,web,code_execution,clarify,skills,memory',
    skills: '',
    hermesBin: path.join(os.homedir(), '.local', 'bin', 'hermes'),
    costGuarded: false,
    allowMetered: false,
    openrouterKey: null,
  };
  assert.doesNotThrow(() => assertCostPolicy(freeConfig));
  assert.throws(
    () => assertCostPolicy({ ...freeConfig, model: 'bytedance-seed/seed-2-1-turbo', allowMetered: false }),
    /refusing metered route/,
  );
  assert.doesNotThrow(() => assertCostPolicy({
    ...freeConfig,
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-32k',
  }));

  const paid = resolveConfig({ OPENROUTER_API_KEY: 'sk-or-test-key-not-real' });
  assert.strictEqual(paid.provider, 'openrouter');
  assert.strictEqual(paid.model, 'bytedance-seed/seed-2-1-turbo');
  assert.strictEqual(paid.allowMetered, true);
  assert.doesNotThrow(() => assertCostPolicy(paid));
  assert(paid.toolsets.includes('browseros-neo') || paid.toolsets.includes('file'));

  const args = buildHermesArgs(paid, 'oneshot', 'inspect this repository');
  assert.deepStrictEqual(args.slice(0, 4), [
    '--provider', 'openrouter', '--model', 'bytedance-seed/seed-2-1-turbo',
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
    const fakeConfig = { ...paid, hermesBin: fakeHermes };
    const doctorRunner = (_binary, doctorArgs) => {
      if (doctorArgs[0] === 'tools') {
        return {
          status: 0,
          stdout: fakeConfig.toolsets.split(',').filter((n) => !['browseros-neo','context7'].includes(n)).map((name) => `enabled  ${name}`).join('\n'),
          stderr: '',
        };
      }
      if (doctorArgs[0] === 'mcp') {
        return { status: 0, stdout: 'browseros-neo\ncontext7\n', stderr: '' };
      }
      return { status: 0, stdout: '152 enabled, 0 disabled', stderr: '' };
    };
    const report = inspectHermes(fakeConfig, doctorRunner);
    assert.strictEqual(report.ready, true);
    assert.strictEqual(report.enabledSkills, 152);
    assert.strictEqual(report.contextAutoInjection, true);

    const calls = [];
    const agent = new SeedYoloAgent({
      config: fakeConfig,
      childRunner: async (binary, childArgs) => {
        calls.push({ binary, childArgs });
        return { exitCode: 0 };
      },
      doctorRunner,
      env: { OPENROUTER_API_KEY: 'sk-or-test-key-not-real' },
    });
    const oneShot = await agent.run(['-z', 'read package.json']);
    assert.strictEqual(oneShot.exitCode, 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].childArgs.at(-1), 'read package.json');
    assert(calls[0].childArgs.includes('bytedance-seed/seed-2-1-turbo'));

    const doctor = await agent.run(['doctor', '--json']);
    assert.strictEqual(doctor.exitCode, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('✅ seed-yolo OpenRouter Seed launcher tests PASSED');
}

testSuite().catch((error) => {
  console.error('Test failure:', error);
  process.exit(1);
});
