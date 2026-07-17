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
const openCodeBin = path.join(home, '.opencode', 'bin');
const systemBin = path.join(root, 'system-bin');
fs.mkdirSync(bin, { recursive: true });
fs.mkdirSync(openCodeBin, { recursive: true });
fs.mkdirSync(systemBin, { recursive: true });
fs.mkdirSync(path.join(home, '.hermes'), { recursive: true });
fs.writeFileSync(path.join(home, '.hermes', '.env'), 'OPENROUTER_API_KEY=stored-private-value\n', { mode: 0o600 });

const hermesCapture = path.join(root, 'hermes-env.json');
const grokCapture = path.join(root, 'grok-env.json');
const openCodeCapture = path.join(root, 'opencode-env.json');
const directGrokSentinel = path.join(root, 'direct-grok-spawned');
const parallelCliSentinel = path.join(root, 'parallel-cli-spawned');
executable(path.join(bin, 'hermes-yolo'), `#!/bin/sh\nnode -e 'const fs=require("fs"); const names=["HERMES_ZERO_SPEND","HERMES_HOME","HERMES_ENV_PATH","HERMES_CONFIG_PATH","HERMES_MANAGED_DIR","HERMES_YOLO_BACKEND","HERMES_YOLO_PROVIDER","HERMES_YOLO_MODEL","HERMES_YOLO_TOOLSETS","OPENROUTER_API_KEY","META_MODEL_API_KEY","PARALLEL_API_KEY"]; const out={}; for (const n of names) out[n]=process.env[n] ?? null; fs.writeFileSync(process.argv[1], JSON.stringify(out));' "${hermesCapture}"\n`);
executable(path.join(bin, 'grok-yolo'), `#!/bin/sh\nnode -e 'const fs=require("fs"); const names=["HERMES_ZERO_SPEND","GROK_BIN","GROK_YOLO_LOCAL_ONLY","GROK_YOLO_LOCAL_MODEL","GROK_YOLO_LOCAL_HOME","GROK_TELEMETRY_ENABLED","OTEL_LOG_USER_PROMPTS","OTEL_LOG_TOOL_DETAILS","XAI_API_KEY","OPENAI_API_KEY","OPENROUTER_API_KEY"]; const out={args:process.argv.slice(2)}; for (const n of names) out[n]=process.env[n] ?? null; fs.writeFileSync(process.argv[1], JSON.stringify(out));' "${grokCapture}" "$@"\n`);
const openCodeOriginal = `#!/bin/sh\nnode -e 'const fs=require("fs"); const names=["HERMES_ZERO_SPEND","OPENCODE_CONFIG","OPENCODE_CONFIG_DIR","OPENCODE_CONFIG_CONTENT","OPENCODE_AUTO_SHARE","OPENCODE_DISABLE_AUTOUPDATE","OPENCODE_DISABLE_DEFAULT_PLUGINS","OPENCODE_DISABLE_MODELS_FETCH","OPENCODE_ENABLE_EXA","XDG_CACHE_HOME","XDG_DATA_HOME","XDG_STATE_HOME","META_MODEL_API_KEY","MODEL_API_KEY","OPENAI_API_KEY","OPENROUTER_API_KEY"]; const out={args:process.argv.slice(2)}; for (const n of names) out[n]=process.env[n] ?? null; fs.writeFileSync(process.argv[1], JSON.stringify(out));' "${openCodeCapture}" "$@"\n`;
executable(path.join(openCodeBin, 'opencode'), openCodeOriginal);
executable(path.join(bin, 'opencode'), openCodeOriginal);
executable(path.join(systemBin, 'opencode'), openCodeOriginal);
const directGrokOriginal = path.join(root, 'direct-grok-original');
executable(directGrokOriginal, `#!/bin/sh\ntouch "${directGrokSentinel}"\n`);
fs.symlinkSync(directGrokOriginal, path.join(bin, 'grok'));
fs.mkdirSync(path.join(home, '.grok', 'bin'), { recursive: true });
fs.symlinkSync(directGrokOriginal, path.join(home, '.grok', 'bin', 'grok'));
executable(path.join(systemBin, 'parallel-cli'), `#!/bin/sh\ntouch "${parallelCliSentinel}"\n`);

const env = {
  ...process.env,
  HOME: home,
  PATH: `${openCodeBin}:${systemBin}:${bin}:${process.env.PATH}`,
  HERMES_ZERO_SPEND_COMMANDS: 'hermes-yolo,grok-yolo,opencode,grok,parallel,parallel-cli',
  HERMES_ZERO_SPEND_OPENCODE_PATHS: [
    path.join(openCodeBin, 'opencode'),
    path.join(systemBin, 'opencode'),
    path.join(bin, 'opencode'),
  ].join(path.delimiter),
  HERMES_ZERO_SPEND_REPLACE_PREFIXES: systemBin,
  HERMES_ZERO_SPEND_SKIP_LAUNCHCTL: '1',
  HERMES_ZERO_SPEND_LOCAL_MODELS: 'qwen3.5:9b-hermes-64k',
  OPENROUTER_API_KEY: 'must-not-reach-child',
  OPENAI_API_KEY: 'must-not-reach-child',
  XAI_API_KEY: 'must-not-reach-child',
  META_MODEL_API_KEY: 'must-not-reach-child',
  MODEL_API_KEY: 'must-not-reach-child',
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
assert.strictEqual(firstStatus.localOpenCodeConfigMode, 0o600);
assert.strictEqual(firstStatus.managedConfigMode, 0o600);
assert.strictEqual(firstStatus.managedEnvMode, 0o600);
assert.strictEqual(firstStatus.globalHermesPolicyActive, true);
assert.strictEqual(firstStatus.launchctlPolicyActive, null);
assert.strictEqual(firstStatus.guardReinforcesGate, null);
assert.strictEqual(firstStatus.localModel, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(firstStatus.localContextLength, 65536);
assert.strictEqual(firstStatus.modelDaemonsQuiesced, null);
assert.deepStrictEqual(firstStatus.quiescedLaunchAgents, []);
assert.strictEqual(firstStatus.commandCount, 6);
assert.ok(firstStatus.commands.every((entry) => entry.installed));
assert.strictEqual(firstStatus.commands.find((entry) => entry.name === 'grok-yolo').policy, 'local-only');
assert.strictEqual(firstStatus.commands.find((entry) => entry.name === 'opencode').policy, 'local-only');
assert.strictEqual(firstStatus.commands.find((entry) => entry.name === 'opencode').additionalShimCount, 2);
assert.strictEqual(firstStatus.commands.find((entry) => entry.name === 'grok').policy, 'blocked');
assert.strictEqual(firstStatus.commands.find((entry) => entry.name === 'grok').additionalShimCount, 1);
const globalEnv = fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8');
assert.match(globalEnv, /OPENROUTER_API_KEY=stored-private-value/);
assert.match(globalEnv, /HERMES_MANAGED_DIR=.*zero-spend\/managed/);
const managedConfig = fs.readFileSync(path.join(home, '.hermes', 'zero-spend', 'managed', 'config.yaml'), 'utf8');
assert.match(managedConfig, /provider: custom:ollama-local-64k/);
assert.match(managedConfig, /default: "qwen3\.5:9b-hermes-64k"/);
assert.match(managedConfig, /context_length: 65536/);
assert.doesNotMatch(managedConfig, /context_length: 20480/);
assert.doesNotMatch(managedConfig, /openrouter|grok|meta|snowflake|parallel/i);
const localOpenCodeConfigPath = path.join(home, '.hermes', 'zero-spend', 'opencode-home', 'opencode.json');
const localOpenCodeConfig = JSON.parse(fs.readFileSync(localOpenCodeConfigPath, 'utf8'));
assert.deepStrictEqual(localOpenCodeConfig.enabled_providers, ['ollama']);
assert.strictEqual(localOpenCodeConfig.model, 'ollama/qwen3.5:9b-hermes-64k');
assert.strictEqual(localOpenCodeConfig.small_model, 'ollama/qwen3.5:9b-hermes-64k');
assert.strictEqual(localOpenCodeConfig.share, 'disabled');
assert.deepStrictEqual(localOpenCodeConfig.plugin, []);
assert.deepStrictEqual(localOpenCodeConfig.compaction, { auto: true, prune: true, reserved: 10000 });
assert.strictEqual(localOpenCodeConfig.permission.websearch, 'deny');
assert.strictEqual(localOpenCodeConfig.provider.ollama.options.baseURL, 'http://127.0.0.1:11434/v1');

const manifestPath = path.join(home, '.hermes', 'zero-spend', 'manifest.json');
const manifestBeforeReinstall = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifestBeforeReinstall.previousLaunchctlEnvironment = { HERMES_YOLO_PROVIDER: 'original-provider' };
manifestBeforeReinstall.previousRouteProgramArguments = ['/bin/true'];
manifestBeforeReinstall.previousGuardStable = 'STABLE="original-wrapper"';
manifestBeforeReinstall.previousQuiescedLaunchAgents = [{ label: 'original-daemon', loaded: true }];
fs.writeFileSync(manifestPath, `${JSON.stringify(manifestBeforeReinstall, null, 2)}\n`, { mode: 0o600 });
const secondInstall = run(process.execPath, [sourceGate, '--install'], env);
assert.strictEqual(secondInstall.status, 0, secondInstall.stderr);
assert.strictEqual(JSON.parse(secondInstall.stdout).commandCount, 6, 'install must be idempotent');
const manifestAfterReinstall = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const installedGate = path.join(home, '.hermes', 'zero-spend', 'zero-spend-command-gate.js');
const openCodePaths = [
  path.join(openCodeBin, 'opencode'),
  path.join(systemBin, 'opencode'),
  path.join(bin, 'opencode'),
];
for (const openCodePath of openCodePaths) {
  assert.strictEqual(
    fs.realpathSync(openCodePath),
    fs.realpathSync(installedGate),
    `every executable OpenCode path must resolve through the gate: ${openCodePath}`,
  );
}
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
assert.deepStrictEqual(
  manifestAfterReinstall.previousQuiescedLaunchAgents,
  manifestBeforeReinstall.previousQuiescedLaunchAgents,
  'reinstall must retain the original model-daemon state',
);

const localGrok = run(path.join(bin, 'grok-yolo'), ['--dry-run', '--json'], env);
assert.strictEqual(localGrok.status, 0, localGrok.stderr);
const capturedGrok = JSON.parse(fs.readFileSync(grokCapture, 'utf8'));
assert.deepStrictEqual(capturedGrok.args, ['--dry-run', '--json']);
assert.strictEqual(capturedGrok.HERMES_ZERO_SPEND, '1');
assert.strictEqual(capturedGrok.GROK_YOLO_LOCAL_ONLY, '1');
assert.strictEqual(capturedGrok.GROK_BIN, manifestAfterReinstall.commands.grok.original);
assert.strictEqual(capturedGrok.GROK_YOLO_LOCAL_MODEL, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(capturedGrok.GROK_YOLO_LOCAL_HOME, path.join(home, '.hermes', 'zero-spend', 'grok-home'));
assert.strictEqual(capturedGrok.GROK_TELEMETRY_ENABLED, '0');
assert.strictEqual(capturedGrok.OTEL_LOG_USER_PROMPTS, '0');
assert.strictEqual(capturedGrok.OTEL_LOG_TOOL_DETAILS, '0');
assert.strictEqual(capturedGrok.XAI_API_KEY, '');
assert.strictEqual(capturedGrok.OPENAI_API_KEY, '');
assert.strictEqual(capturedGrok.OPENROUTER_API_KEY, '');
const grokReceipt = JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8'));
assert.strictEqual(grokReceipt.command, 'grok-yolo');
assert.strictEqual(grokReceipt.policy, 'local-only');
assert.strictEqual(grokReceipt.outcome, 'local-pass');
assert.strictEqual(grokReceipt.backend, 'grok-build-ollama');
assert.strictEqual(grokReceipt.inferenceScope, 'local');
assert.strictEqual(grokReceipt.providerCostUsd, 0);
assert.strictEqual(grokReceipt.originalSpawned, true);

const bareOpenCodePath = gate.findExecutable('opencode', env);
assert.strictEqual(bareOpenCodePath, path.join(openCodeBin, 'opencode'));
const localOpenCode = run(bareOpenCodePath, ['run', 'local marker'], env);
assert.strictEqual(localOpenCode.status, 0, localOpenCode.stderr);
const capturedOpenCode = JSON.parse(fs.readFileSync(openCodeCapture, 'utf8'));
assert.deepStrictEqual(capturedOpenCode.args, ['run', 'local marker']);
assert.strictEqual(capturedOpenCode.HERMES_ZERO_SPEND, '1');
assert.strictEqual(capturedOpenCode.OPENCODE_CONFIG, localOpenCodeConfigPath);
assert.strictEqual(capturedOpenCode.OPENCODE_CONFIG_DIR, path.dirname(localOpenCodeConfigPath));
assert.strictEqual(capturedOpenCode.OPENCODE_AUTO_SHARE, 'false');
assert.strictEqual(capturedOpenCode.OPENCODE_DISABLE_AUTOUPDATE, '1');
assert.strictEqual(capturedOpenCode.OPENCODE_DISABLE_DEFAULT_PLUGINS, '1');
assert.strictEqual(capturedOpenCode.OPENCODE_DISABLE_MODELS_FETCH, '1');
assert.strictEqual(capturedOpenCode.OPENCODE_ENABLE_EXA, '0');
assert.strictEqual(capturedOpenCode.META_MODEL_API_KEY, '');
assert.strictEqual(capturedOpenCode.MODEL_API_KEY, '');
assert.strictEqual(capturedOpenCode.OPENAI_API_KEY, '');
assert.strictEqual(capturedOpenCode.OPENROUTER_API_KEY, '');
assert.deepStrictEqual(JSON.parse(capturedOpenCode.OPENCODE_CONFIG_CONTENT), localOpenCodeConfig);
assert.match(capturedOpenCode.XDG_DATA_HOME, /zero-spend\/opencode-home\/data$/);
const openCodeReceipt = JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8'));
assert.strictEqual(openCodeReceipt.command, 'opencode');
assert.strictEqual(openCodeReceipt.policy, 'local-only');
assert.strictEqual(openCodeReceipt.backend, 'opencode-ollama');
assert.strictEqual(openCodeReceipt.inferenceScope, 'local');
assert.strictEqual(openCodeReceipt.providerCostUsd, 0);
assert.strictEqual(openCodeReceipt.originalSpawned, true);

const blockedDirectGrok = run(path.join(bin, 'grok'), ['hello'], env);
assert.strictEqual(blockedDirectGrok.status, 73, blockedDirectGrok.stderr);
assert.match(blockedDirectGrok.stderr, /blocked before provider execution/);
assert.strictEqual(fs.existsSync(directGrokSentinel), false, 'direct cloud-capable Grok command must never spawn');
const blockedVendorGrok = run(path.join(home, '.grok', 'bin', 'grok'), ['hello'], env);
assert.strictEqual(blockedVendorGrok.status, 73, blockedVendorGrok.stderr);
assert.strictEqual(fs.existsSync(directGrokSentinel), false, 'vendor Grok path must also be gated');

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
  HERMES_YOLO_MODEL: 'qwen3.5:9b-hermes-64k',
  HERMES_YOLO_TOOLSETS: 'terminal,file,code_execution,memory,clarify',
  OPENROUTER_API_KEY: '',
  META_MODEL_API_KEY: '',
  PARALLEL_API_KEY: '',
});

const receipt = JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8'));
assert.strictEqual(receipt.command, 'hermes-yolo');
assert.strictEqual(receipt.outcome, 'local-pass');
assert.strictEqual(receipt.model, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(receipt.originalSpawned, true);
assert.strictEqual(fs.statSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json')).mode & 0o777, 0o600);

const disabled = run(process.execPath, [sourceGate, '--disable'], env);
assert.strictEqual(disabled.status, 0, disabled.stderr);
assert.strictEqual(JSON.parse(disabled.stdout).active, false);
assert.doesNotMatch(fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8'), /HERMES_MANAGED_DIR=/);
fs.unlinkSync(openCodeCapture);
const openCodeAfterDisable = run(bareOpenCodePath, ['--version'], env);
assert.strictEqual(openCodeAfterDisable.status, 0, openCodeAfterDisable.stderr);
const capturedOpenCodeAfterDisable = JSON.parse(fs.readFileSync(openCodeCapture, 'utf8'));
assert.deepStrictEqual(capturedOpenCodeAfterDisable.args, ['--version']);
assert.strictEqual(capturedOpenCodeAfterDisable.HERMES_ZERO_SPEND, null);
assert.strictEqual(capturedOpenCodeAfterDisable.OPENCODE_CONFIG, null);
assert.strictEqual(capturedOpenCodeAfterDisable.META_MODEL_API_KEY, 'must-not-reach-child');
assert.strictEqual(capturedOpenCodeAfterDisable.MODEL_API_KEY, 'must-not-reach-child');
fs.unlinkSync(grokCapture);
const persistentLocalGrok = run(path.join(bin, 'grok-yolo'), [], env);
assert.strictEqual(persistentLocalGrok.status, 0, persistentLocalGrok.stderr);
const capturedPersistentGrok = JSON.parse(fs.readFileSync(grokCapture, 'utf8'));
assert.strictEqual(capturedPersistentGrok.GROK_YOLO_LOCAL_ONLY, '1');
assert.strictEqual(capturedPersistentGrok.GROK_YOLO_LOCAL_MODEL, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(capturedPersistentGrok.XAI_API_KEY, '');
assert.strictEqual(
  JSON.parse(fs.readFileSync(path.join(home, '.hermes', 'receipts', 'zero-spend', 'latest.json'), 'utf8')).outcome,
  'local-pass',
);

fs.unlinkSync(grokCapture);
const missingPersistentModel = run(path.join(bin, 'grok-yolo'), [], {
  ...env,
  HERMES_ZERO_SPEND_LOCAL_MODELS: 'not-a-safe-local-model',
});
assert.strictEqual(missingPersistentModel.status, 69, missingPersistentModel.stderr);
assert.strictEqual(fs.existsSync(grokCapture), false, 'grok-yolo must fail closed without its local model');

const directGrokAfterDisable = run(path.join(bin, 'grok'), ['hello'], env);
assert.strictEqual(directGrokAfterDisable.status, 0, directGrokAfterDisable.stderr);
assert.strictEqual(fs.existsSync(directGrokSentinel), true, 'global marker still controls non-yolo commands');

// --- redeploy vs arm: refreshing shims must never undo an operator --disable ---
const markerPath = path.join(home, '.hermes', 'NO_PAID_SPEND');
assert.strictEqual(fs.existsSync(markerPath), false, 'precondition: operator disabled above');
const redeploy = run(process.execPath, [sourceGate, '--install'], env);
assert.strictEqual(redeploy.status, 0, redeploy.stderr);
assert.strictEqual(JSON.parse(redeploy.stdout).active, false, 'redeploy must report disarmed');
assert.strictEqual(fs.existsSync(markerPath), false, 'redeploy must NOT re-create the marker');
const armed = run(process.execPath, [sourceGate, '--arm'], env);
assert.strictEqual(armed.status, 0, armed.stderr);
assert.strictEqual(JSON.parse(armed.stdout).active, true, '--arm must arm the policy');
assert.strictEqual(fs.existsSync(markerPath), true, '--arm must create the marker');
assert.strictEqual(fs.statSync(markerPath).mode & 0o777, 0o600);
const disarmAgain = run(process.execPath, [sourceGate, '--disable'], env);
assert.strictEqual(disarmAgain.status, 0, disarmAgain.stderr);
assert.strictEqual(fs.existsSync(markerPath), false, 'second --disable must clear the --arm marker');

const fakeOllamaState = path.join(root, 'fake-ollama-model-created');
const capturedModelFile = path.join(root, 'captured-Modelfile');
const fakeOllama = path.join(root, 'fake-ollama');
executable(fakeOllama, `#!/bin/sh
set -eu
case "$1" in
  list)
    printf 'NAME ID SIZE MODIFIED\\n'
    printf 'qwen3.5:9b base 7GB now\\n'
    if [ -f "${fakeOllamaState}" ]; then
      printf 'qwen3.5:9b-hermes-64k derived 7GB now\\n'
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
assert.strictEqual(gate.provisionSafeLocalModel(provisionEnv), 'qwen3.5:9b-hermes-64k');
assert.match(fs.readFileSync(capturedModelFile, 'utf8'), /^FROM qwen3\.5:9b$/m);
assert.match(fs.readFileSync(capturedModelFile, 'utf8'), /^PARAMETER num_ctx 65536$/m);
fs.unlinkSync(capturedModelFile);
assert.strictEqual(gate.provisionSafeLocalModel(provisionEnv), 'qwen3.5:9b-hermes-64k');
assert.strictEqual(fs.existsSync(capturedModelFile), false, 'existing safe profile must not be recreated');

fs.rmSync(root, { recursive: true, force: true });
console.log('zero-spend command gate tests: PASS');
