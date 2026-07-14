#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceGate = path.resolve(__dirname, '..', 'zero-spend-command-gate.js');

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
fs.mkdirSync(bin, { recursive: true });
fs.mkdirSync(path.join(home, '.hermes'), { recursive: true });
fs.writeFileSync(path.join(home, '.hermes', '.env'), 'OPENROUTER_API_KEY=stored-private-value\n', { mode: 0o600 });

const hermesCapture = path.join(root, 'hermes-env.json');
const grokSentinel = path.join(root, 'grok-spawned');
executable(path.join(bin, 'hermes-yolo'), `#!/bin/sh\nnode -e 'const fs=require("fs"); const names=["HERMES_ZERO_SPEND","HERMES_HOME","HERMES_ENV_PATH","HERMES_CONFIG_PATH","HERMES_MANAGED_DIR","HERMES_YOLO_BACKEND","HERMES_YOLO_PROVIDER","HERMES_YOLO_MODEL","HERMES_YOLO_TOOLSETS","OPENROUTER_API_KEY","META_MODEL_API_KEY","PARALLEL_API_KEY"]; const out={}; for (const n of names) out[n]=process.env[n] ?? null; fs.writeFileSync(process.argv[1], JSON.stringify(out));' "${hermesCapture}"\n`);
executable(path.join(bin, 'grok-yolo'), `#!/bin/sh\ntouch "${grokSentinel}"\n`);

const env = {
  ...process.env,
  HOME: home,
  PATH: `${bin}:${process.env.PATH}`,
  HERMES_ZERO_SPEND_COMMANDS: 'hermes-yolo,grok-yolo,parallel',
  HERMES_ZERO_SPEND_LOCAL_MODELS: 'qwen3:8b-64k',
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
assert.strictEqual(firstStatus.localModel, 'qwen3:8b-64k');
assert.strictEqual(firstStatus.commandCount, 3);
assert.ok(firstStatus.commands.every((entry) => entry.installed));
const globalEnv = fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8');
assert.match(globalEnv, /OPENROUTER_API_KEY=stored-private-value/);
assert.match(globalEnv, /HERMES_MANAGED_DIR=.*zero-spend\/managed/);
const managedConfig = fs.readFileSync(path.join(home, '.hermes', 'zero-spend', 'managed', 'config.yaml'), 'utf8');
assert.match(managedConfig, /provider: custom:ollama-local-64k/);
assert.match(managedConfig, /default: "qwen3:8b-64k"/);
assert.doesNotMatch(managedConfig, /openrouter|grok|meta|snowflake|parallel/i);

const secondInstall = run(process.execPath, [sourceGate, '--install'], env);
assert.strictEqual(secondInstall.status, 0, secondInstall.stderr);
assert.strictEqual(JSON.parse(secondInstall.stdout).commandCount, 3, 'install must be idempotent');

const blocked = run(path.join(bin, 'grok-yolo'), ['hello'], env);
assert.strictEqual(blocked.status, 73, blocked.stderr);
assert.match(blocked.stderr, /blocked before provider execution/);
assert.strictEqual(fs.existsSync(grokSentinel), false, 'blocked provider must never spawn');

const missingParallel = run(path.join(bin, 'parallel'), ['search'], env);
assert.strictEqual(missingParallel.status, 73, missingParallel.stderr);

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
  HERMES_YOLO_MODEL: 'qwen3:8b-64k',
  HERMES_YOLO_TOOLSETS: 'terminal,file,code_execution,memory,clarify',
  OPENROUTER_API_KEY: '',
  META_MODEL_API_KEY: '',
  PARALLEL_API_KEY: '',
});

const receipt = JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8'));
assert.strictEqual(receipt.command, 'hermes-yolo');
assert.strictEqual(receipt.outcome, 'local-pass');
assert.strictEqual(receipt.model, 'qwen3:8b-64k');
assert.strictEqual(receipt.originalSpawned, true);
assert.strictEqual(fs.statSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json')).mode & 0o777, 0o600);

const disabled = run(process.execPath, [sourceGate, '--disable'], env);
assert.strictEqual(disabled.status, 0, disabled.stderr);
assert.strictEqual(JSON.parse(disabled.stdout).active, false);
assert.doesNotMatch(fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8'), /HERMES_MANAGED_DIR=/);
const passthrough = run(path.join(bin, 'grok-yolo'), [], env);
assert.strictEqual(passthrough.status, 0, passthrough.stderr);
assert.strictEqual(fs.existsSync(grokSentinel), true, 'disabled policy restores original command behavior');

fs.rmSync(root, { recursive: true, force: true });
console.log('zero-spend command gate tests: PASS');
