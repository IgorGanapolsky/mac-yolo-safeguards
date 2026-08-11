'use strict';

const assert = require('assert');
const { execFileSync, execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_PATH = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== Running hermes-yolo-wrapper tests ===\n');

// Symlink Integrity Gate (Prevention Guard)
const installedBin = path.join(require('os').homedir(), '.local/bin/hermes-yolo');
if (fs.existsSync(installedBin)) {
  const lstat = fs.lstatSync(installedBin);
  assert(lstat.isSymbolicLink(), `~/.local/bin/hermes-yolo must be a symlink to ${WRAPPER_PATH}`);
  const realPath = fs.realpathSync(installedBin);
  assert.strictEqual(realPath, fs.realpathSync(WRAPPER_PATH), `~/.local/bin/hermes-yolo points to ${realPath}, expected ${WRAPPER_PATH}`);
  console.log('✅ Symlink Integrity Gate PASSED: ~/.local/bin/hermes-yolo -> repo wrapper');
}

// 1. Load the wrapper module (thanks to our module.exports check)
const {
  buildChildPromptArgs,
  buildGrokBackendArgs,
  buildGrokBackendEnv,
  buildGrokSpawnOptions,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  defaultModelRoute,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  mergedHermesEnv,
  parseEnvFile,
  shouldUseGrokBackend,
  classifyBackend,
  buildRouteReceipt,
  routeStatus,
  summarizeRouteArgs,
  digest,
  normalizeToolsets,
  ensureRequiredToolsetsInArgs,
  isLegacyOneShot,
  resolveTimeoutMs,
  resolveGrokTimeoutMs,
  resolveGrokMaxTurns,
  resolveGrokReasoningEffort,
  DIRECT_RESPONSE_RULES,
  REQUIRED_TOOLSETS,
  DEFAULT_TOOLSETS,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT,
} = require(WRAPPER_PATH);

console.log('Testing SuperGrok-preferred auto backend routing...');
// When grok doctor is not ready → hermes-legacy fallback
const noGrok = { grokReady: false };
assert.strictEqual(shouldUseGrokBackend([], {}, noGrok), false);
assert.strictEqual(shouldUseGrokBackend(['fix', 'the', 'bug'], {}, noGrok), false);
assert.strictEqual(shouldUseGrokBackend(['fix', 'the', 'bug'], { HERMES_YOLO_BACKEND: 'grok' }, noGrok), true);
assert.strictEqual(shouldUseGrokBackend(['doctor'], {}, noGrok), false);
assert.strictEqual(shouldUseGrokBackend(['--version'], {}, noGrok), false);
assert.strictEqual(shouldUseGrokBackend(['fix'], { HERMES_YOLO_BACKEND: 'hermes' }, noGrok), false);
assert.throws(() => shouldUseGrokBackend([], { HERMES_YOLO_BACKEND: 'unknown' }), /Unsupported/);
assert.deepStrictEqual(REQUIRED_TOOLSETS, ['skills', 'context7']);
assert.strictEqual(DEFAULT_TOOLSETS, 'terminal,file,web,code_execution,clarify,skills,context7');
assert.strictEqual(normalizeToolsets('terminal,file,file'), 'terminal,file,skills,context7');
assert.deepStrictEqual(
  ensureRequiredToolsetsInArgs(['--toolsets', 'terminal,file', '-z', 'task']),
  ['--toolsets', 'terminal,file,skills,context7', '-z', 'task'],
);
assert.strictEqual(resolveTimeoutMs({}), 90_000);
assert.strictEqual(resolveTimeoutMs({ HERMES_YOLO_TIMEOUT_MS: '1234' }), 1234);
assert.strictEqual(resolveGrokTimeoutMs({}), 90_000);
assert.strictEqual(resolveGrokTimeoutMs({ HERMES_YOLO_GROK_TIMEOUT_MS: '4321' }), 4321);
assert.strictEqual(isLegacyOneShot(['-z', 'answer']), true);
assert.strictEqual(isLegacyOneShot(['chat']), false);
assert.strictEqual(isLegacyOneShot([]), false);
assert.strictEqual(resolveGrokReasoningEffort(['what', 'is', 'this'], {}), 'low');
assert.strictEqual(resolveGrokReasoningEffort(['fix', 'the', 'bug'], {}), 'medium');
assert.strictEqual(resolveGrokMaxTurns(['what', 'is', 'this'], {}), 6);
assert.strictEqual(resolveGrokMaxTurns(['fix', 'the', 'bug'], {}), 12);
assert.match(DIRECT_RESPONSE_RULES, /Lead with the result/i);
assert.match(DIRECT_RESPONSE_RULES, /check the current tool registry/i);
assert.doesNotMatch(DIRECT_RESPONSE_RULES, /all tools.*enabled|full access/i);

const ttyGrokArgs = buildGrokBackendArgs([], { isTty: true, env: {} });
assert.deepStrictEqual(ttyGrokArgs, ['--reasoning-effort', 'low', '--rules', DIRECT_RESPONSE_RULES]);
assert.strictEqual(Object.hasOwn(buildGrokSpawnOptions(ttyGrokArgs, {}), 'timeout'), false);
const readyGrokArgs = buildGrokBackendArgs([], { isTty: false, env: {} });
assert.deepStrictEqual(readyGrokArgs.slice(0, 3), ['-p', DEFAULT_READY_PROMPT, '--output-format']);
assert.strictEqual(buildGrokSpawnOptions(readyGrokArgs, {}).timeout, 90_000);
assert.strictEqual(
  buildGrokSpawnOptions(readyGrokArgs, { HERMES_YOLO_GROK_TIMEOUT_MS: '4321' }).timeout,
  4321,
);
assert(readyGrokArgs.includes('--no-subagents'));
assert(readyGrokArgs.includes('--no-memory'));
assert(readyGrokArgs.includes('--max-turns'));
assert(readyGrokArgs.includes('--rules'));
assert.strictEqual(
  readyGrokArgs[readyGrokArgs.indexOf('--disallowed-tools') + 1],
  'search_tool,use_tool',
);
const complexGrokArgs = buildGrokBackendArgs(['fix', 'the', 'bug'], { env: {} });
assert.deepStrictEqual(complexGrokArgs.slice(0, 3), ['-p', 'fix the bug', '--output-format']);
assert.strictEqual(complexGrokArgs[complexGrokArgs.indexOf('--reasoning-effort') + 1], 'medium');
assert.strictEqual(complexGrokArgs[complexGrokArgs.indexOf('--max-turns') + 1], '12');
const markerGrokArgs = buildGrokBackendArgs(['-z', 'return', 'marker'], { env: {} });
assert.deepStrictEqual(markerGrokArgs.slice(0, 3), ['-p', 'return marker', '--output-format']);
const mcpGrokArgs = buildGrokBackendArgs(['use', 'the', 'context7', 'mcp'], { env: {} });
assert(!mcpGrokArgs.includes('--disallowed-tools'));
const explicitMcpGrokArgs = buildGrokBackendArgs(['answer', 'this'], {
  env: { HERMES_YOLO_GROK_MCP: '1' },
});
assert(!explicitMcpGrokArgs.includes('--disallowed-tools'));
assert.deepStrictEqual(buildGrokBackendEnv({ KEEP: 'yes' }), {
  KEEP: 'yes',
  GROK_CLAUDE_MCPS_ENABLED: 'false',
  GROK_CURSOR_MCPS_ENABLED: 'false',
});
assert.deepStrictEqual(buildGrokBackendEnv({
  HERMES_YOLO_GROK_COMPAT_MCP: '1',
  GROK_CLAUDE_MCPS_ENABLED: 'true',
}), {
  HERMES_YOLO_GROK_COMPAT_MCP: '1',
  GROK_CLAUDE_MCPS_ENABLED: 'true',
});
assert.deepStrictEqual(classifyBackend(['fix', 'the', 'bug'], {}, noGrok), {
  requestedBackend: 'auto', selectedBackend: 'hermes-legacy', reason: 'auto-hermes-fallback',
});
// SuperGrok Heavy / grok.com OAuth ready → auto uses grok-4.5 (underuse fix 2026-08-04)
assert.deepStrictEqual(classifyBackend(['fix', 'the', 'bug'], {}, { grokReady: true }), {
  requestedBackend: 'auto', selectedBackend: 'grok-4.5', reason: 'auto-supergrok-ready',
});
assert.strictEqual(shouldUseGrokBackend(['fix'], {}, { grokReady: true }), true);
// Force hermes even when grok would be ready
assert.deepStrictEqual(
  classifyBackend(['fix'], { HERMES_YOLO_FORCE_HERMES: '1' }, { grokReady: true }),
  { requestedBackend: 'auto', selectedBackend: 'hermes-legacy', reason: 'auto-hermes-fallback' },
);
assert.deepStrictEqual(classifyBackend(['doctor'], {}, noGrok), {
  requestedBackend: 'auto', selectedBackend: 'hermes-legacy', reason: 'hermes-admin-command',
});
assert.deepStrictEqual(classifyBackend(['fix'], { HERMES_YOLO_BACKEND: 'grok' }), {
  requestedBackend: 'grok', selectedBackend: 'grok-4.5', reason: 'explicit-grok-backend',
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
  requestedBackend: 'grok',
  selectedBackend: 'grok-4.5',
  reason: 'default-prompt-route',
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
  requestedBackend: 'grok',
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
assert.deepStrictEqual(defaultModelRoute({}, {
  availableModels: ['qwen2.5:3b-64k'],
  configuredDefault: null,
}), {
  provider: 'custom:ollama-local-64k',
  model: 'qwen2.5:3b-64k',
});
assert.deepStrictEqual(defaultModelRoute({}, {
  availableModels: ['qwen3:8b-agent-64k'],
  configuredDefault: null,
}), {
  provider: 'custom:ollama-local-64k',
  model: 'qwen3:8b-agent-64k',
});
// No config override: key present → LiteLLM glm-coding (agent class)
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredDefault: null,
  configuredProviderIds: ['zai-coding-glm'],
}), {
  provider: 'custom:litellm-gateway',
  model: 'glm-coding',
});
// Explicit config default beats a still-present but quota-dead z.ai key
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredDefault: { model: 'deepseek-v4-flash', provider: 'custom:litellm-gateway' },
}), {
  provider: 'custom:litellm-gateway',
  model: 'deepseek-v4-flash',
});
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }, {
  configuredDefault: null,
  configuredProviderIds: [],
}), {
  provider: 'custom:litellm-gateway',
  model: 'glm-coding',
});
assert.deepStrictEqual(defaultModelRoute({
  OPENROUTER_API_KEY: 'openrouter-key',
}, {
  availableModels: ['qwen3:8b-agent-64k'],
  configuredDefault: null,
}), {
  provider: 'custom:litellm-gateway',
  model: 'glm-coding',
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
const routeReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-route-test-'));
fs.writeFileSync(fakeGrokYoloPath, [
  '#!/usr/bin/env bash',
  'printf "GROK-BACKEND:%s\\n" "$*"',
  '',
].join('\n'), { mode: 0o755 });
try {
  const grokBackendOutput = execFileSync(process.execPath, [WRAPPER_PATH, 'fix', 'the', 'bug'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_YOLO_BACKEND: 'grok',
      GROK_YOLO_BIN: fakeGrokYoloPath,
      HERMES_BIN: '/definitely-not-used/hermes',
      HERMES_YOLO_RECEIPT_DIR: routeReceiptRoot,
      // Exact prompt contract for this harness; lean-context has its own suite.
      HERMES_YOLO_LEAN_CONTEXT: '0',
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

  const status = routeStatus({ GROK_YOLO_BIN: fakeGrokYoloPath }, {
    runner: () => ({
      status: 0,
      stdout: JSON.stringify({
        ready: true,
        version: '0.2.93',
        model: 'grok-4.5',
        modelAvailable: true,
        authenticated: true,
        authMode: 'grok.com_oauth',
        billingMode: 'grok_plan_or_limited_free_quota',
        apiBillingActivatedByWrapper: false,
        blocker: null,
      }),
    }),
  });
  assert.strictEqual(status.ready, true);
  assert.strictEqual(status.defaultPromptBackend, 'grok-4.5');
  assert.strictEqual(status.grokReady, true);
  assert.strictEqual(status.silentFallbackAllowed, false);
  const pinnedHermesStatus = routeStatus({
    GROK_YOLO_BIN: fakeGrokYoloPath,
    HERMES_YOLO_BACKEND: 'hermes',
  }, {
    runner: () => ({
      status: 0,
      stdout: JSON.stringify({
        ready: true,
        modelAvailable: true,
        authenticated: true,
        model: 'grok-4.5',
      }),
    }),
  });
  assert.strictEqual(pinnedHermesStatus.routingMode, 'explicit-hermes');
  assert.strictEqual(pinnedHermesStatus.defaultPromptBackend, 'hermes-legacy');
  const missingExplicitGrokStatus = routeStatus({
    HERMES_YOLO_BACKEND: 'grok',
    HERMES_BIN: fakeGrokYoloPath,
  }, {
    grokYoloBin: null,
  });
  assert.strictEqual(missingExplicitGrokStatus.ready, false);
  assert.strictEqual(missingExplicitGrokStatus.blocker, 'grok_yolo_not_installed');
  assert.strictEqual(missingExplicitGrokStatus.defaultPromptBackend, 'grok-4.5');
} finally {
  fs.unlinkSync(fakeGrokYoloPath);
  fs.rmSync(routeReceiptRoot, { recursive: true, force: true });
}

const slowGrokPath = path.join(require('os').tmpdir(), `slow-grok-yolo-${process.pid}`);
const timeoutReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-timeout-proof-'));
fs.writeFileSync(slowGrokPath, [
  '#!/usr/bin/env bash',
  'sleep 0.2',
  'printf "TOO-LATE\\n"',
  '',
].join('\n'), { mode: 0o755 });
try {
  const timed = spawnSync(process.execPath, [WRAPPER_PATH, 'answer', 'quickly'], {
    encoding: 'utf8',
    timeout: 2_000,
    env: {
      ...process.env,
      HERMES_YOLO_BACKEND: 'grok',
      GROK_YOLO_BIN: slowGrokPath,
      HERMES_BIN: '/definitely-not-used/hermes',
      HERMES_YOLO_RECEIPT_DIR: timeoutReceiptRoot,
      HERMES_YOLO_GROK_TIMEOUT_MS: '50',
      HERMES_YOLO_LEAN_CONTEXT: '0',
    },
  });
  assert.strictEqual(timed.status, 124, `expected timeout exit 124, got ${timed.status}: ${timed.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(path.join(timeoutReceiptRoot, 'latest.json'), 'utf8'));
  assert.strictEqual(receipt.execution.status, 'timeout');
  assert.match(receipt.execution.error, /timeout/i);
} finally {
  fs.rmSync(timeoutReceiptRoot, { recursive: true, force: true });
  try { fs.unlinkSync(slowGrokPath); } catch (e) { /* may not exist */ }
}

const processTreeRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-process-tree-proof-'));
const processTreeGrokPath = path.join(processTreeRoot, 'grok');
const processTreeSentinel = path.join(processTreeRoot, 'late-tool-action.txt');
const processTreeReceiptRoot = path.join(processTreeRoot, 'receipts');
fs.writeFileSync(processTreeGrokPath, [
  '#!/usr/bin/env node',
  "'use strict';",
  "const { spawn } = require('child_process');",
  'const args = process.argv.slice(2);',
  "if (args[0] === 'version') { console.log('grok 0.2.99 (fake)'); process.exit(0); }",
  "if (args[0] === 'models') {",
  "  console.log('You are logged in with grok.com.');",
  "  console.log('Default model: grok-4.5');",
  "  console.log('Available models:');",
  "  console.log('  * grok-4.5 (default)');",
  '  process.exit(0);',
  '}',
  'const stubbornTool = [',
  "  \"const fs = require('fs');\" ,",
  "  \"process.on('SIGTERM', () => {});\" ,",
  "  \"setTimeout(() => { fs.writeFileSync(process.env.GROK_TEST_SENTINEL, 'leaked'); process.exit(0); }, 750);\" ,",
  "].join('\\n');",
  "spawn(process.execPath, ['-e', stubbornTool], { stdio: 'ignore', env: process.env });",
  'setInterval(() => {}, 1000);',
  '',
].join('\n'), { mode: 0o755 });
try {
  const timedTree = spawnSync(process.execPath, [WRAPPER_PATH, 'answer', 'with', 'a', 'tool'], {
    encoding: 'utf8',
    timeout: 3_000,
    env: {
      ...process.env,
      HERMES_YOLO_BACKEND: 'grok',
      GROK_YOLO_BIN: path.resolve(__dirname, '../grok-yolo-wrapper.js'),
      GROK_BIN: processTreeGrokPath,
      HERMES_BIN: '/definitely-not-used/hermes',
      HERMES_YOLO_RECEIPT_DIR: processTreeReceiptRoot,
      HERMES_YOLO_GROK_TIMEOUT_MS: '100',
      HERMES_YOLO_LEAN_CONTEXT: '0',
      GROK_CLAUDE_MCPS_ENABLED: 'false',
      GROK_CURSOR_MCPS_ENABLED: 'false',
      GROK_TEST_SENTINEL: processTreeSentinel,
    },
  });
  assert.strictEqual(timedTree.status, 124, `expected process-tree timeout exit 124: ${timedTree.stderr}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900);
  assert.strictEqual(
    fs.existsSync(processTreeSentinel),
    false,
    'a Grok descendant performed a tool action after the timeout receipt',
  );
} finally {
  fs.rmSync(processTreeRoot, { recursive: true, force: true });
}

const slowInteractiveHermesPath = path.join(require('os').tmpdir(), `slow-interactive-hermes-${process.pid}`);
const interactiveReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-interactive-proof-'));
const interactiveLockPath = path.join(require('os').tmpdir(), `hermes-yolo-interactive-proof-${process.pid}.lock`);
fs.writeFileSync(slowInteractiveHermesPath, [
  '#!/usr/bin/env bash',
  'sleep 0.15',
  'printf "INTERACTIVE-STILL-ALIVE\\n"',
  '',
].join('\n'), { mode: 0o755 });
try {
  const interactive = spawnSync(process.execPath, [WRAPPER_PATH, 'chat'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      HERMES_YOLO_BACKEND: 'hermes',
      HERMES_BIN: slowInteractiveHermesPath,
      HERMES_YOLO_TIMEOUT_MS: '10000',
      HERMES_YOLO_LOCK_PATH: interactiveLockPath,
      HERMES_YOLO_RECEIPT_DIR: interactiveReceiptRoot,
      HERMES_YOLO_LEAN_CONTEXT: '0',
      HERMES_YOLO_SPRAWL: '0',
      HERMES_YOLO_PROGRESS: '0',
    },
  });
  assert.strictEqual(interactive.status, 0, `interactive chat was timed out: ${interactive.stderr}`);
  assert.match(interactive.stdout, /INTERACTIVE-STILL-ALIVE/);
} finally {
  fs.rmSync(interactiveReceiptRoot, { recursive: true, force: true });
  try { fs.unlinkSync(interactiveLockPath); } catch (e) { /* may not exist */ }
  try { fs.unlinkSync(slowInteractiveHermesPath); } catch (e) { /* may not exist */ }
}

const exhaustedGrokPath = path.join(require('os').tmpdir(), `exhausted-grok-yolo-${process.pid}`);
const fakeHermesPath = path.join(require('os').tmpdir(), `fake-hermes-${process.pid}`);
const grokInvocationSentinel = path.join(require('os').tmpdir(), `grok-invoked-${process.pid}`);
const fallbackReceiptRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hermes-yolo-quota-proof-'));
const fallbackLockPath = path.join(require('os').tmpdir(), `hermes-yolo-quota-proof-${process.pid}.lock`);
fs.writeFileSync(exhaustedGrokPath, [
  '#!/usr/bin/env bash',
  '# Doctor reports not ready (quota) without counting as a chat spawn.',
  'if [ "$1" = "--doctor" ]; then',
  '  printf \'%s\\n\' \'{"ready":false,"modelAvailable":false,"authenticated":false,"blocker":"quota"}\'',
  '  exit 0',
  'fi',
  `touch ${JSON.stringify(grokInvocationSentinel)}`,
  'echo "API error (status 402 Payment Required): usage balance exhausted" >&2',
  'exit 1',
  '',
].join('\n'), { mode: 0o755 });
fs.writeFileSync(fakeHermesPath, [
  '#!/usr/bin/env bash',
  'printf "HERMES-QUOTA-INDEPENDENT-OK\\n"',
  'printf "SYSTEM-PROMPT:%s\\n" "${HERMES_EPHEMERAL_SYSTEM_PROMPT:-}"',
  '',
].join('\n'), { mode: 0o755 });
try {
  const output = execFileSync(process.execPath, [WRAPPER_PATH, 'keep', 'working'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_YOLO_BACKEND: 'auto',
      GROK_YOLO_BIN: exhaustedGrokPath,
      HERMES_BIN: fakeHermesPath,
      HERMES_YOLO_LOCK_PATH: fallbackLockPath,
      HERMES_YOLO_NO_PREFLIGHT: '1',
      HERMES_YOLO_RECEIPT_DIR: fallbackReceiptRoot,
      HERMES_YOLO_LEAN_CONTEXT: '0',
    },
  });
  assert(output.includes('HERMES-QUOTA-INDEPENDENT-OK'));
  assert(output.includes('Lead with the result'));
  assert.strictEqual(fs.existsSync(grokInvocationSentinel), false, 'default route must not touch exhausted Grok');
  const storedRoute = JSON.parse(fs.readFileSync(path.join(fallbackReceiptRoot, 'latest.json'), 'utf8'));
  assert.strictEqual(storedRoute.route.requestedBackend, 'auto');
  assert.strictEqual(storedRoute.route.selectedBackend, 'hermes-legacy');
  assert.strictEqual(storedRoute.route.reason, 'auto-hermes-fallback');
  assert.strictEqual(storedRoute.execution.status, 'pass');
} finally {
  for (const filePath of [exhaustedGrokPath, fakeHermesPath, grokInvocationSentinel, fallbackLockPath]) {
    try { fs.unlinkSync(filePath); } catch (e) { /* may not exist */ }
  }
  fs.rmSync(fallbackReceiptRoot, { recursive: true, force: true });
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
  const stdout = execFileSync(process.execPath, [binaryPath, '--version'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_YOLO_NO_PREFLIGHT: '1',
      HERMES_YOLO_LOCK_PATH: testLockPath,
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

// Test Self-Healing Harness & Stream Stall Auto-Recovery Guard
const { checkAndHealSelfHealingHarness, detectAndHealStreamStall, MAX_COMPRESSIONS_CEILING } = require(binaryPath);
console.log('Testing Self-Healing Harness & Stream Stall Auto-Recovery...');
assert.strictEqual(typeof checkAndHealSelfHealingHarness, 'function');
assert.strictEqual(typeof detectAndHealStreamStall, 'function');
assert.strictEqual(MAX_COMPRESSIONS_CEILING, 15);

// Test under-threshold (no reset)
const noReset = checkAndHealSelfHealingHarness(process.env, process.cwd(), { compressions: 5 });
assert.strictEqual(noReset.healed, false);
assert.strictEqual(noReset.compressions, 5);

// Test over-threshold (auto-reset and auto-heal)
const healed = checkAndHealSelfHealingHarness(process.env, process.cwd(), { compressions: 62 });
assert.strictEqual(healed.healed, true);
assert.strictEqual(healed.compressions, 0);
assert.strictEqual(healed.previousCompressions, 62);
assert.ok(healed.message.includes('auto-healed'));

// Test Stream Stall Interception
const stallOutput = '▲ Stream stalled mid tool-call (terminal); the action was not executed.';
const stallRes = detectAndHealStreamStall(stallOutput);
assert.strictEqual(stallRes.stalled, true);
assert.strictEqual(stallRes.recovered, true);
assert.strictEqual(stallRes.action, 'AUTO_RETRY_TOOL_CALL');
console.log('✅ Self-Healing Harness & Stream Stall Auto-Recovery unit test passed.');

console.log('\n=== All tests passed successfully! ===');
