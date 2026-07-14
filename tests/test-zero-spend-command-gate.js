#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceGate = path.resolve(__dirname, '..', 'zero-spend-command-gate.js');
const gate = require(sourceGate);

function executable(filePath, body) {
  fs.writeFileSync(filePath, body, { mode: 0o700 });
  fs.chmodSync(filePath, 0o700);
}

function run(file, args, env) {
  return spawnSync(file, args, { encoding: 'utf8', env });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-spend-gate-test-'));
const home = path.join(root, 'home');
const bin = path.join(home, '.local', 'bin');
const systemBin = path.join(root, 'system-bin');
fs.mkdirSync(bin, { recursive: true });
fs.mkdirSync(systemBin, { recursive: true });
fs.mkdirSync(path.join(home, '.hermes'), { recursive: true });
fs.writeFileSync(path.join(home, '.hermes', '.env'), 'OPENROUTER_API_KEY=stored-private-value\n', { mode: 0o600 });

const hermesCapture = path.join(root, 'hermes-env.json');
const grokSentinel = path.join(root, 'grok-spawned');
const parallelCliSentinel = path.join(root, 'parallel-cli-spawned');
executable(path.join(bin, 'hermes-yolo'), `#!/bin/sh\nnode -e 'const fs=require("fs"); const names=["HERMES_ZERO_SPEND","HERMES_HOME","HERMES_ENV_PATH","HERMES_CONFIG_PATH","HERMES_MANAGED_DIR","HERMES_YOLO_BACKEND","HERMES_YOLO_PROVIDER","HERMES_YOLO_MODEL","HERMES_YOLO_TOOLSETS","OPENROUTER_API_KEY","META_MODEL_API_KEY","PARALLEL_API_KEY"]; const out={}; for (const n of names) out[n]=process.env[n] ?? null; fs.writeFileSync(process.argv[1], JSON.stringify(out));' "${hermesCapture}"\n`);
executable(path.join(bin, 'grok-yolo'), `#!/bin/sh\ntouch "${grokSentinel}"\n`);
executable(path.join(systemBin, 'parallel-cli'), `#!/bin/sh\ntouch "${parallelCliSentinel}"\n`);

const env = {
  ...process.env,
  HOME: home,
  PATH: `${systemBin}:${bin}:${process.env.PATH}`,
  HERMES_ZERO_SPEND_COMMANDS: 'hermes-yolo,grok-yolo,parallel,parallel-cli',
  HERMES_ZERO_SPEND_REPLACE_PREFIXES: systemBin,
  HERMES_ZERO_SPEND_SKIP_LAUNCHCTL: '1',
  HERMES_ZERO_SPEND_LOCAL_MODELS: 'qwen3:8b-hermes-20k',
  OPENROUTER_API_KEY: 'must-not-reach-child',
  META_MODEL_API_KEY: 'must-not-reach-child',
  PARALLEL_API_KEY: 'must-not-reach-child',
};

const firstInstall = run(process.execPath, [sourceGate, '--install'], env);
assert.strictEqual(firstInstall.status, 0, firstInstall.stderr);
const firstStatus = JSON.parse(firstInstall.stdout);
assert.strictEqual(firstStatus.active, true);
assert.strictEqual(firstStatus.markerMode, 0o600);
assert.strictEqual(firstStatus.manifestMode, 0o600);
assert.strictEqual(firstStatus.gateMode, 0o700);
assert.strictEqual(firstStatus.localConfigMode, 0o600);
assert.strictEqual(firstStatus.managedConfigMode, 0o600);
assert.strictEqual(firstStatus.managedEnvMode, 0o600);
assert.strictEqual(firstStatus.globalHermesPolicyActive, true);
assert.strictEqual(firstStatus.launchctlPolicyActive, null);
assert.strictEqual(firstStatus.guardReinforcesGate, null);
assert.strictEqual(firstStatus.localModel, 'qwen3:8b-hermes-20k');
assert.strictEqual(firstStatus.localContextLength, 20480);
assert.strictEqual(firstStatus.commandCount, 4);
assert.ok(firstStatus.commands.every((entry) => entry.installed));
const globalEnv = fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8');
assert.match(globalEnv, /OPENROUTER_API_KEY=stored-private-value/);
assert.match(globalEnv, /HERMES_MANAGED_DIR=.*zero-spend\/managed/);
const managedConfig = fs.readFileSync(path.join(home, '.hermes', 'zero-spend', 'managed', 'config.yaml'), 'utf8');
assert.match(managedConfig, /provider: custom:ollama-local-64k/);
assert.match(managedConfig, /default: "qwen3:8b-hermes-20k"/);
assert.match(managedConfig, /context_length: 20480/);
assert.doesNotMatch(managedConfig, /context_length: 65536/);
assert.doesNotMatch(managedConfig, /openrouter|grok|meta|snowflake|parallel/i);

const manifestPath = path.join(home, '.hermes', 'zero-spend', 'manifest.json');
const manifestBeforeReinstall = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifestBeforeReinstall.previousLaunchctlEnvironment = { HERMES_YOLO_PROVIDER: 'original-provider' };
manifestBeforeReinstall.previousRouteProgramArguments = ['/bin/true'];
manifestBeforeReinstall.previousGuardStable = 'STABLE="original-wrapper"';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifestBeforeReinstall, null, 2)}\n`, { mode: 0o600 });
const secondInstall = run(process.execPath, [sourceGate, '--install'], env);
assert.strictEqual(secondInstall.status, 0, secondInstall.stderr);
assert.strictEqual(JSON.parse(secondInstall.stdout).commandCount, 4, 'install must be idempotent');
const manifestAfterReinstall = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.deepStrictEqual(
  manifestAfterReinstall.previousLaunchctlEnvironment,
  manifestBeforeReinstall.previousLaunchctlEnvironment,
  'reinstall must retain the original launchctl state',
);
assert.deepStrictEqual(
  manifestAfterReinstall.previousRouteProgramArguments,
  manifestBeforeReinstall.previousRouteProgramArguments,
  'reinstall must retain the original route LaunchAgent state',
);
assert.strictEqual(
  manifestAfterReinstall.previousGuardStable,
  manifestBeforeReinstall.previousGuardStable,
  'reinstall must retain the original permanence-guard state',
);

const blocked = run(path.join(bin, 'grok-yolo'), ['hello'], env);
assert.strictEqual(blocked.status, 73, blocked.stderr);
assert.match(blocked.stderr, /blocked before provider execution/);
assert.strictEqual(fs.existsSync(grokSentinel), false, 'blocked provider must never spawn');

const missingParallel = run(path.join(bin, 'parallel'), ['search'], env);
assert.strictEqual(missingParallel.status, 73, missingParallel.stderr);
const blockedSystemCommand = run(path.join(systemBin, 'parallel-cli'), ['search'], env);
assert.strictEqual(blockedSystemCommand.status, 73, blockedSystemCommand.stderr);
assert.strictEqual(fs.existsSync(parallelCliSentinel), false, 'effective system-path provider must never spawn');

const local = run(path.join(bin, 'hermes-yolo'), ['local prompt'], env);
assert.strictEqual(local.status, 0, local.stderr);
const captured = JSON.parse(fs.readFileSync(hermesCapture, 'utf8'));
assert.deepStrictEqual(captured, {
  HERMES_ZERO_SPEND: '1',
  HERMES_HOME: path.join(home, '.hermes', 'zero-spend', 'hermes-home'),
  HERMES_ENV_PATH: path.join(home, '.hermes', 'zero-spend', 'hermes-home', '.env'),
  HERMES_CONFIG_PATH: path.join(home, '.hermes', 'zero-spend', 'hermes-home', 'config.yaml'),
  HERMES_MANAGED_DIR: path.join(home, '.hermes', 'zero-spend', 'hermes-home', 'managed-disabled'),
  HERMES_YOLO_BACKEND: 'hermes',
  HERMES_YOLO_PROVIDER: 'custom:ollama-local-64k',
  HERMES_YOLO_MODEL: 'qwen3:8b-hermes-20k',
  HERMES_YOLO_TOOLSETS: 'terminal,file,code_execution,memory,clarify',
  OPENROUTER_API_KEY: '',
  META_MODEL_API_KEY: '',
  PARALLEL_API_KEY: '',
});

const receipt = JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8'));
assert.strictEqual(receipt.command, 'hermes-yolo');
assert.strictEqual(receipt.outcome, 'local-pass');
assert.strictEqual(receipt.model, 'qwen3:8b-hermes-20k');
assert.strictEqual(receipt.originalSpawned, true);
assert.strictEqual(fs.statSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json')).mode & 0o777, 0o600);

const disabled = run(process.execPath, [sourceGate, '--disable'], env);
assert.strictEqual(disabled.status, 0, disabled.stderr);
assert.strictEqual(JSON.parse(disabled.stdout).active, false);
assert.doesNotMatch(fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8'), /HERMES_MANAGED_DIR=/);
const passthrough = run(path.join(bin, 'grok-yolo'), [], env);
assert.strictEqual(passthrough.status, 0, passthrough.stderr);
assert.strictEqual(fs.existsSync(grokSentinel), true, 'disabled policy restores original command behavior');

const fakeOllamaState = path.join(root, 'fake-ollama-model-created');
const capturedModelFile = path.join(root, 'captured-Modelfile');
const fakeOllama = path.join(root, 'fake-ollama');
executable(fakeOllama, `#!/bin/sh
set -eu
case "$1" in
  list)
    printf 'NAME ID SIZE MODIFIED\\n'
    printf 'qwen3:8b base 5GB now\\n'
    if [ -f "${fakeOllamaState}" ]; then
      printf 'qwen3:8b-hermes-20k derived 5GB now\\n'
    fi
    ;;
  create)
    cp "$4" "${capturedModelFile}"
    touch "${fakeOllamaState}"
    ;;
  *) exit 2 ;;
esac
`);
const provisionEnv = { ...process.env, HOME: home, OLLAMA_BIN: fakeOllama };
assert.strictEqual(gate.provisionSafeLocalModel(provisionEnv), 'qwen3:8b-hermes-20k');
assert.match(fs.readFileSync(capturedModelFile, 'utf8'), /^FROM qwen3:8b$/m);
assert.match(fs.readFileSync(capturedModelFile, 'utf8'), /^PARAMETER num_ctx 20480$/m);
fs.unlinkSync(capturedModelFile);
assert.strictEqual(gate.provisionSafeLocalModel(provisionEnv), 'qwen3:8b-hermes-20k');
assert.strictEqual(fs.existsSync(capturedModelFile), false, 'existing safe profile must not be recreated');

fs.rmSync(root, { recursive: true, force: true });
console.log('zero-spend command gate tests: PASS');
