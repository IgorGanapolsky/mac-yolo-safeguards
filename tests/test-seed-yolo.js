'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
  DEFAULT_MODEL,
  FULL_TOOLSETS,
  SeedYoloAgent,
  assertCostPolicy,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  parseCliArgs,
  resolveConfig,
} = require('../tools/seed-yolo-wrapper');

console.log('=== Testing seed-yolo real agent launcher ===');

async function testSuite() {
  assert.strictEqual(DEFAULT_MODEL, 'openrouter/free');
  assert(FULL_TOOLSETS.includes('browser'));
  assert(FULL_TOOLSETS.includes('computer_use'));

  const config = resolveConfig({});
  assert.strictEqual(config.provider, 'openrouter');
  assert.strictEqual(config.model, 'openrouter/free');
  assert.deepStrictEqual(config.toolsets.split(','), [
    'terminal', 'file', 'web', 'code_execution', 'clarify', 'skills', 'memory',
  ]);
  assert.doesNotThrow(() => assertCostPolicy(config));
  assert.throws(
    () => assertCostPolicy({ ...config, model: 'bytedance-seed/seed-2.0-code' }),
    /refusing metered route/,
  );
  assert.doesNotThrow(() => assertCostPolicy({
    ...config,
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-32k',
  }));
  assert.doesNotThrow(() => assertCostPolicy({
    ...config,
    provider: 'openrouter',
    model: 'poolside/laguna-s-2.1:free',
  }));
  assert.deepStrictEqual(
    resolveConfig({ SEED_YOLO_FULL_TOOLS: '1' }).toolsets.split(',').slice(0, 3),
    ['terminal', 'file', 'web'],
  );
  assert(resolveConfig({ SEED_YOLO_FULL_TOOLS: '1' }).toolsets.includes('delegation'));

  // CLI parser: -z must strip the flag and pass only the prompt
  assert.deepStrictEqual(parseCliArgs(['-z', 'Use the file tool']), {
    mode: 'oneshot', prompt: 'Use the file tool',
  });
  assert.deepStrictEqual(parseCliArgs(['--oneshot', 'a', 'b']), {
    mode: 'oneshot', prompt: 'a b',
  });
  assert.deepStrictEqual(parseCliArgs(['doctor', '--json']), {
    mode: 'doctor', json: true,
  });
  assert.deepStrictEqual(parseCliArgs(['--doctor']), {
    mode: 'doctor', json: false,
  });
  assert.strictEqual(parseCliArgs([]).mode, 'chat');
  assert.strictEqual(parseCliArgs(['-z']).mode, 'error');

  const args = buildHermesArgs(config, 'oneshot', 'inspect this repository');
  assert.deepStrictEqual(args.slice(0, 4), [
    '--provider', 'openrouter', '--model', 'openrouter/free',
  ]);
  assert(args.includes('--yolo'));
  assert(args.includes('--accept-hooks'));
  assert(args.includes('--toolsets'));
  assert(args.includes('-z'));
  assert(!args.includes('--ignore-rules'));
  assert.strictEqual(args.at(-1), 'inspect this repository');
  // Critical: hermes must never receive -z with a value that starts with -z
  const zIndex = args.indexOf('-z');
  assert.notStrictEqual(args[zIndex + 1].slice(0, 2), '-z');

  const contextFile = findContextFile(path.resolve(__dirname, '..', 'tools'));
  assert.strictEqual(contextFile, path.resolve(__dirname, '..', 'AGENTS.md'));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-yolo-agent-test-'));
  try {
    const fakeHermes = path.join(tempDir, 'hermes');
    fs.writeFileSync(fakeHermes, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeHermes, 0o755);
    const fakeConfig = { ...config, hermesBin: fakeHermes };
    const doctorRunner = (_binary, doctorArgs) => {
      if (doctorArgs[0] === 'tools') {
        return {
          status: 0,
          stdout: fakeConfig.toolsets.split(',').map((name) => `enabled  ${name}`).join('\n'),
          stderr: '',
        };
      }
      return { status: 0, stdout: '136 enabled, 0 disabled', stderr: '' };
    };
    const report = inspectHermes(fakeConfig, doctorRunner);
    assert.strictEqual(report.ready, true);
    assert.strictEqual(report.enabledSkills, 136);
    assert.strictEqual(report.contextAutoInjection, true);
    assert.strictEqual(report.memoryAutoInjection, true);
    assert.deepStrictEqual(report.missingToolsets, []);

    const noContextReport = inspectHermes(fakeConfig, doctorRunner, tempDir);
    assert.strictEqual(noContextReport.contextFile, null);
    assert.strictEqual(noContextReport.contextAutoInjection, false);
    assert.strictEqual(noContextReport.ready, false);

    const calls = [];
    const agent = new SeedYoloAgent({
      config: fakeConfig,
      childRunner: async (binary, childArgs) => {
        calls.push({ binary, childArgs });
        return { exitCode: 0 };
      },
      doctorRunner,
    });
    const oneShot = await agent.run(['read', 'package.json']);
    assert.strictEqual(oneShot.exitCode, 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].binary, fakeHermes);
    assert(calls[0].childArgs.includes('-z'));
    assert.strictEqual(calls[0].childArgs.at(-1), 'read package.json');
    assert(!calls[0].childArgs.includes('--ignore-rules'));

    // Explicit -z flag must not double-prefix
    calls.length = 0;
    const zShot = await agent.run(['-z', 'Use the file tool']);
    assert.strictEqual(zShot.exitCode, 0);
    assert.strictEqual(calls[0].childArgs.at(-1), 'Use the file tool');
    assert.strictEqual(calls[0].childArgs.filter((a) => a === '-z').length, 1);

    const doctorFlag = await agent.run(['--doctor', '--json']);
    assert.strictEqual(doctorFlag.exitCode, 0);

    const emptyStdin = Readable.from([]);
    emptyStdin.isTTY = false;
    const emptyInputAgent = new SeedYoloAgent({
      config: fakeConfig,
      childRunner: async () => {
        throw new Error('empty stdin must not launch Hermes');
      },
      stdin: emptyStdin,
    });
    const emptyInput = await emptyInputAgent.run([]);
    assert.strictEqual(emptyInput.exitCode, 1);

    const doctor = agent.runDoctor(true);
    assert.strictEqual(doctor.exitCode, 0);
    assert.strictEqual(doctor.report.enabledSkills, 136);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('✅ seed-yolo real agent launcher tests PASSED');
}

testSuite().catch((error) => {
  console.error('Test failure:', error);
  process.exit(1);
});
