'use strict';

const assert = require('assert');
const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_PATH = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== Running hermes-yolo-wrapper tests ===\n');

// 1. Load the wrapper module (thanks to our module.exports check)
const {
  buildChildPromptArgs,
  buildCocoBackendArgs,
  buildGrokBackendArgs,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  defaultModelRoute,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  mergedHermesEnv,
  parseEnvFile,
  isCocoPrompt,
  shouldUseCocoBackend,
  shouldUseGrokBackend,
  classifyBackend,
  buildRouteReceipt,
  routeStatus,
  summarizeRouteArgs,
  digest,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT,
} = require(WRAPPER_PATH);

console.log('Testing automatic CoCo/Grok backend routing...');
assert.strictEqual(shouldUseGrokBackend([], {}), true);
assert.strictEqual(shouldUseGrokBackend(['fix', 'the', 'bug'], {}), true);
assert.strictEqual(shouldUseGrokBackend(['Snowflake:', 'show', 'warehouse', 'usage'], {}), false);
assert.strictEqual(shouldUseCocoBackend(['Snowflake:', 'show', 'warehouse', 'usage'], {}), true);
assert.strictEqual(shouldUseCocoBackend(['SQL:', 'SELECT', '*', 'FROM', 'events'], {}), true);
assert.strictEqual(shouldUseCocoBackend(['SELECT', '*', 'FROM', 'events'], {}), true);
assert.strictEqual(shouldUseCocoBackend(['select', 'the', 'best', 'model'], {}), false);
assert.strictEqual(isCocoPrompt(['inspect', 'Snowsight', 'usage']), true);
assert.strictEqual(isCocoPrompt(['fix', 'the', 'bug']), false);
assert.strictEqual(shouldUseGrokBackend(['doctor'], {}), false);
assert.strictEqual(shouldUseGrokBackend(['--version'], {}), false);
assert.strictEqual(shouldUseGrokBackend(['fix'], { HERMES_YOLO_BACKEND: 'hermes' }), false);
assert.strictEqual(shouldUseGrokBackend(['Snowflake:', 'query'], { HERMES_YOLO_BACKEND: 'grok' }), true);
assert.throws(() => shouldUseGrokBackend([], { HERMES_YOLO_BACKEND: 'unknown' }), /Unsupported/);
assert.deepStrictEqual(buildGrokBackendArgs([], { isTty: true }), []);
assert.deepStrictEqual(buildGrokBackendArgs([], { isTty: false }), ['-p', DEFAULT_READY_PROMPT, '--output-format', 'plain']);
assert.deepStrictEqual(buildGrokBackendArgs(['fix', 'the', 'bug']), ['-p', 'fix the bug', '--output-format', 'plain']);
assert.deepStrictEqual(buildGrokBackendArgs(['-z', 'return', 'marker']), ['-p', 'return marker', '--output-format', 'plain']);
assert.deepStrictEqual(buildCocoBackendArgs(['Snowflake:', 'show', 'usage']), ['Snowflake: show usage']);
assert.deepStrictEqual(buildCocoBackendArgs(['-z', 'SQL:', 'SELECT', '1']), ['SQL: SELECT 1']);
assert.deepStrictEqual(classifyBackend(['fix', 'the', 'bug'], {}), {
  requestedBackend: 'auto', selectedBackend: 'grok-4.5', reason: 'default-non-snowflake-route',
});
assert.deepStrictEqual(classifyBackend(['doctor'], {}), {
  requestedBackend: 'auto', selectedBackend: 'hermes-legacy', reason: 'hermes-admin-command',
});
assert.deepStrictEqual(classifyBackend(['Snowflake:', 'show', 'usage'], {}), {
  requestedBackend: 'auto', selectedBackend: 'snowflake-coco', reason: 'snowflake-sql-prompt',
});
assert.deepStrictEqual(classifyBackend(['anything'], { HERMES_YOLO_BACKEND: 'coco' }), {
  requestedBackend: 'coco', selectedBackend: 'snowflake-coco', reason: 'explicit-coco-backend',
});
assert.deepStrictEqual(classifyBackend(['fix'], { HERMES_YOLO_BACKEND: 'hermes' }), {
  requestedBackend: 'hermes', selectedBackend: 'hermes-legacy', reason: 'explicit-hermes-backend',
});
const summarizedPrompt = summarizeRouteArgs(['fix', 'private', 'bug']);
assert.strictEqual(summarizedPrompt.kind, 'prompt');
assert.strictEqual(summarizedPrompt.taskDigest.length, 20);
assert(!JSON.stringify(summarizedPrompt).includes('private'));
assert.notStrictEqual(digest('private prompt'), digest('private prompt'));
assert.notStrictEqual(digest('private prompt'), '6fe06b970bb77bb96bee');

const routeReceipt = buildRouteReceipt({
  rawArgs: ['private', 'prompt'],
  requestedBackend: 'auto',
  selectedBackend: 'grok-4.5',
  reason: 'default-non-snowflake-route',
  model: 'grok-4.5',
  status: 'pass',
  exitCode: 0,
  durationMs: 25,
  generatedAt: '2026-07-12T00:00:00.000Z',
  host: 'test-host',
  cwd: '/private/project',
});
assert.strictEqual(routeReceipt.route.silentFallback, false);
assert.strictEqual(routeReceipt.route.qwenSelected, false);
assert(!JSON.stringify(routeReceipt).includes('private prompt'));

const qwenReceipt = buildRouteReceipt({
  rawArgs: ['doctor'],
  requestedBackend: 'auto',
  selectedBackend: 'hermes-legacy',
  reason: 'hermes-admin-command',
  model: 'qwen3:8b-64k',
  status: 'pass',
  exitCode: 0,
});
assert.strictEqual(qwenReceipt.route.qwenSelected, true);
assert.strictEqual(qwenReceipt.route.qwenExplicit, true);
assert.strictEqual(qwenReceipt.route.silentFallback, false);

console.log('Testing buildChildPromptArgs...');

// Helper to temporarily mock process.stdout.isTTY
function runWithMockedTTY(isTTY, fn) {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', {
    value: isTTY,
    configurable: true
  });
  Object.defineProperty(process.stdin, 'isTTY', {
    value: isTTY,
    configurable: true
  });
  try {
    fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true
    });
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true
    });
  }
}

// Test case: Empty arguments in interactive terminal (TTY)
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs([]);
  console.log('  [TEST] Empty args + TTY=true -> expected bounded -z probe, got:', result);
  assert.deepStrictEqual(result, ['-z', DEFAULT_READY_PROMPT]);
});

// Test case: Empty arguments in non-interactive pipeline (non-TTY)
runWithMockedTTY(false, () => {
  const result = buildChildPromptArgs([]);
  console.log('  [TEST] Empty args + TTY=false -> expected bounded -z probe, got:', result);
  assert.deepStrictEqual(result, ['-z', DEFAULT_READY_PROMPT]);
});

// Test case: Custom prompt positional argument
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['Write a python hello world script']);
  console.log('  [TEST] Custom prompt -> expected ["-z", prompt], got:', result);
  assert.deepStrictEqual(result, ['-z', 'Write a python hello world script']);
});

runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs([], 'Use wrapper prompt text', { forceOneshot: true });
  console.log('  [TEST] Wrapper prompt mode -> expected ["-z", prompt], got:', result);
  assert.deepStrictEqual(result, ['-z', 'Use wrapper prompt text']);
});

// Test case: Hermes subcommands (e.g. chat, doctor, version)
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['chat']);
  console.log('  [TEST] Subcommand "chat" -> expected ["chat"], got:', result);
  assert.deepStrictEqual(result, ['chat']);
});

runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['doctor']);
  console.log('  [TEST] Subcommand "doctor" -> expected ["doctor"], got:', result);
  assert.deepStrictEqual(result, ['doctor']);
});

// Test case: Flags (e.g. --version, -h, --help)
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['--version']);
  console.log('  [TEST] Flag "--version" -> expected ["--version"], got:', result);
  assert.deepStrictEqual(result, ['--version']);
});

runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['-h']);
  console.log('  [TEST] Flag "-h" -> expected ["-h"], got:', result);
  assert.deepStrictEqual(result, ['-h']);
});

// Test case: HERMES_YOLO_INTERACTIVE override
const originalInteractive = process.env.HERMES_YOLO_INTERACTIVE;
process.env.HERMES_YOLO_INTERACTIVE = '1';
try {
  runWithMockedTTY(false, () => {
    const result = buildChildPromptArgs([]);
    console.log('  [TEST] HERMES_YOLO_INTERACTIVE=1 -> expected [], got:', result);
    assert.deepStrictEqual(result, []);
  });
} finally {
  if (originalInteractive === undefined) {
    delete process.env.HERMES_YOLO_INTERACTIVE;
  } else {
    process.env.HERMES_YOLO_INTERACTIVE = originalInteractive;
  }
}

console.log('\nTesting live wrapper execution...');

console.log('\nTesting default model routing...');
assert.strictEqual(hasZaiKey({}), false);
assert.strictEqual(hasZaiKey({ Z_AI_API_KEY: 'zai-key' }), true);
assert.strictEqual(hasOpenRouterKey({}), false);
assert.strictEqual(hasOpenRouterKey({ OPENROUTER_API_KEY: 'openrouter-key' }), true);
assert.strictEqual(typeof findOllamaBinary, 'function');
assert.strictEqual(chooseZaiProvider(['zai-coding-glm']), 'custom:zai-coding-glm');
assert.strictEqual(chooseZaiProvider(['zai-coding-nothink']), 'custom:zai-coding-nothink');
assert.strictEqual(chooseZaiProvider([]), 'zai');
assert.strictEqual(chooseLocalModel(['qwen3:8b-agent-64k', 'qwen3:8b']), 'qwen3:8b-agent-64k');
assert.strictEqual(chooseLocalModel(['qwen3:8b-64k']), 'qwen3:8b-64k');
assert.strictEqual(chooseLocalModel(['gpt-oss:20b', 'qwen3:8b-64k']), 'gpt-oss:20b');
assert.strictEqual(chooseLocalModel(['qwen3.6:35b-a3b', 'gpt-oss:20b']), 'qwen3.6:35b-a3b');
assert.deepStrictEqual(defaultModelRoute({}, { availableModels: ['qwen2.5:3b-64k'] }), {
  provider: 'custom:ollama-local-64k',
  model: 'qwen2.5:3b-64k',
});
assert.deepStrictEqual(defaultModelRoute({}, { availableModels: ['qwen3:8b-agent-64k'] }), {
  provider: 'custom:ollama-local-64k',
  model: 'qwen3:8b-agent-64k',
});
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredProviderIds: ['zai-coding-glm'],
}), {
  provider: 'custom:zai-coding-glm',
  model: 'glm-5.2',
});
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredProviderIds: ['zai-coding-nothink'],
}), {
  provider: 'custom:zai-coding-nothink',
  model: 'glm-5.2',
});
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredProviderIds: [],
}), {
  provider: 'zai',
  model: 'glm-5.2',
});
assert.deepStrictEqual(defaultModelRoute({
  OPENROUTER_API_KEY: 'openrouter-key',
}, { availableModels: ['qwen3:8b-agent-64k'] }), {
  provider: 'custom:openrouter-glm52',
  model: 'z-ai/glm-5.2',
});
assert.deepStrictEqual(defaultModelRoute({
  Z_AI_API_KEY: 'zai-key',
  HERMES_YOLO_PROVIDER: 'custom:test-provider',
  HERMES_YOLO_MODEL: 'test-model',
}), {
  provider: 'custom:test-provider',
  model: 'test-model',
});

const tmpEnvPath = path.join(require('os').tmpdir(), `hermes-yolo-env-${process.pid}.env`);
fs.writeFileSync(tmpEnvPath, [
  '# comment',
  'OPENROUTER_API_KEY=openrouter-key',
  'Z_AI_API_KEY=',
  'HERMES_YOLO_MODEL="qwen3:8b-agent-64k"',
  '',
].join('\n'));
try {
  const parsed = parseEnvFile(tmpEnvPath);
  assert.strictEqual(parsed.OPENROUTER_API_KEY, 'openrouter-key');
  assert.strictEqual(parsed.HERMES_YOLO_MODEL, 'qwen3:8b-agent-64k');
  const merged = mergedHermesEnv({ HERMES_YOLO_MODEL: 'override-model' }, tmpEnvPath);
  assert.strictEqual(merged.OPENROUTER_API_KEY, 'openrouter-key');
  assert.strictEqual(merged.HERMES_YOLO_MODEL, 'override-model');
} finally {
  fs.unlinkSync(tmpEnvPath);
}

const tmpConfigPath = path.join(require('os').tmpdir(), `hermes-yolo-config-${process.pid}.yaml`);
fs.writeFileSync(tmpConfigPath, [
  'providers:',
  '  zai-coding-nothink:',
  '    model: glm-5.2',
  '  openrouter-glm52:',
  '    model: z-ai/glm-5.2',
  '',
].join('\n'));
try {
  assert.deepStrictEqual(configuredProviderIds(tmpConfigPath), ['zai-coding-nothink', 'openrouter-glm52']);
} finally {
  fs.unlinkSync(tmpConfigPath);
}

const fakeGrokYoloPath = path.join(require('os').tmpdir(), `fake-grok-yolo-${process.pid}`);
const fakeCocoYoloPath = path.join(require('os').tmpdir(), `fake-coco-yolo-${process.pid}`);
const routeReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-route-test-'));
fs.writeFileSync(fakeGrokYoloPath, [
  '#!/usr/bin/env bash',
  'printf "GROK-BACKEND:%s\\n" "$*"',
  '',
].join('\n'), { mode: 0o755 });
fs.writeFileSync(fakeCocoYoloPath, [
  '#!/usr/bin/env bash',
  'printf "COCO-BACKEND:%s\\n" "$*"',
  '',
].join('\n'), { mode: 0o755 });
try {
  const grokBackendOutput = execFileSync(process.execPath, [WRAPPER_PATH, 'fix', 'the', 'bug'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GROK_YOLO_BIN: fakeGrokYoloPath,
      HERMES_BIN: '/definitely-not-used/hermes',
      HERMES_YOLO_RECEIPT_DIR: routeReceiptRoot,
    },
  });
  assert(grokBackendOutput.includes('GROK-BACKEND:-p fix the bug --output-format plain'));
  const storedRoute = JSON.parse(fs.readFileSync(path.join(routeReceiptRoot, 'latest.json'), 'utf8'));
  assert.strictEqual(storedRoute.route.selectedBackend, 'grok-4.5');
  assert.strictEqual(storedRoute.route.silentFallback, false);
  assert.strictEqual(storedRoute.execution.status, 'pass');
  assert(!JSON.stringify(storedRoute).includes('fix the bug'));
  assert.strictEqual(fs.statSync(path.join(routeReceiptRoot, 'latest.json')).mode & 0o777, 0o600);
  assert.strictEqual(fs.readFileSync(path.join(routeReceiptRoot, 'history.jsonl'), 'utf8').trim().split('\n').length, 1);

  const cocoBackendOutput = execFileSync(process.execPath, [WRAPPER_PATH, 'Snowflake:', 'show', 'warehouse', 'usage'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      COCO_YOLO_BIN: fakeCocoYoloPath,
      GROK_YOLO_BIN: fakeGrokYoloPath,
      HERMES_BIN: '/definitely-not-used/hermes',
      HERMES_YOLO_RECEIPT_DIR: routeReceiptRoot,
    },
  });
  assert(cocoBackendOutput.includes('COCO-BACKEND:Snowflake: show warehouse usage'));
  const storedCocoRoute = JSON.parse(fs.readFileSync(path.join(routeReceiptRoot, 'latest.json'), 'utf8'));
  assert.strictEqual(storedCocoRoute.route.selectedBackend, 'snowflake-coco');
  assert.strictEqual(storedCocoRoute.route.provider, 'snowflake-cortex-code');
  assert.strictEqual(storedCocoRoute.route.silentFallback, false);
  assert.strictEqual(storedCocoRoute.route.qwenSelected, false);
  assert(!JSON.stringify(storedCocoRoute).includes('show warehouse usage'));
  assert.strictEqual(fs.readFileSync(path.join(routeReceiptRoot, 'history.jsonl'), 'utf8').trim().split('\n').length, 2);

  const status = routeStatus({
    GROK_YOLO_BIN: fakeGrokYoloPath,
    COCO_YOLO_BIN: fakeCocoYoloPath,
  }, {
    runner: (binary) => binary === fakeCocoYoloPath
      ? {
        status: 0,
        stdout: JSON.stringify({
          ready: true,
          version: '1.1.27',
          connection: 'hermes-coco-readonly',
          effectiveRole: 'ACCOUNTADMIN',
          principalLeastPrivilege: false,
          sqlReadOnly: true,
          mcpEnabledInsideCoco: false,
          headlessTransport: 'acp',
          acpCommandAvailable: true,
          acpReadOnlyMode: 'plan',
          blocker: null,
        }),
      }
      : {
        status: 0,
        stdout: JSON.stringify({
          ready: true,
          version: '0.2.99',
          model: 'grok-4.5',
          modelAvailable: true,
          authenticated: true,
          authMode: 'grok.com_oauth',
          billingMode: 'grok_plan_or_limited_free_quota',
          apiBillingActivatedByWrapper: false,
          blocker: null,
        }),
      },
  });
  assert.strictEqual(status.ready, true);
  assert.strictEqual(status.routingMode, 'automatic');
  assert.strictEqual(status.snowflakePromptBackend, 'snowflake-coco');
  assert.strictEqual(status.defaultNonSnowflakeBackend, 'grok-4.5');
  assert.strictEqual(status.routes.coco.ready, true);
  assert.strictEqual(status.routes.coco.sqlReadOnly, true);
  assert.strictEqual(status.routes.coco.principalLeastPrivilege, false);
  assert.strictEqual(status.routes.coco.headlessTransport, 'acp');
  assert.strictEqual(status.routes.coco.acpCommandAvailable, true);
  assert.strictEqual(status.routes.coco.acpReadOnlyMode, 'plan');
  assert.strictEqual(status.silentFallbackAllowed, false);
} finally {
  fs.unlinkSync(fakeGrokYoloPath);
  fs.unlinkSync(fakeCocoYoloPath);
  fs.rmSync(routeReceiptRoot, { recursive: true, force: true });
}

// 2. Test live wrapper execution (using --version as a fast safe check)
const binaryPath = path.resolve(__dirname, '../hermes-yolo-wrapper.js');
// Isolate the singleton lock from any concurrently-running hermes-yolo (e.g. the
// live session) via the wrapper's HERMES_YOLO_LOCK_PATH escape hatch. The
// production singleton guard stays intact; the test just must not collide with it.
const testLockPath = path.join(require('os').tmpdir(), `hermes-yolo-test-${process.pid}.lock`);
const versionReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-version-receipts-'));
try {
  try { fs.unlinkSync(testLockPath); } catch (e) { /* may not exist */ }
  // HERMES_YOLO_NO_PREFLIGHT bypasses slow Telegram API calls during testing
  const stdout = execSync(`HERMES_YOLO_NO_PREFLIGHT=1 HERMES_YOLO_LOCK_PATH=${testLockPath} node ${binaryPath} --version`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_YOLO_RECEIPT_DIR: versionReceiptRoot,
    },
  });
  console.log('  [TEST] Execution output:\n' + stdout.split('\n').map(l => '    ' + l).join('\n'));
  assert.ok(stdout.includes('Hermes Agent'), 'Output must contain the Hermes Agent version information');
  console.log('  [TEST] Live execution passed successfully.');
} catch (e) {
  console.error('  [FAIL] Live execution failed:', e.message);
  process.exit(1);
} finally {
  try { fs.unlinkSync(testLockPath); } catch (e) { /* may not exist */ }
  fs.rmSync(versionReceiptRoot, { recursive: true, force: true });
}

console.log('\n=== All tests passed successfully! ===');
