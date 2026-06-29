'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_PATH = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== Running hermes-yolo-wrapper tests ===\n');

// 1. Load the wrapper module (thanks to our module.exports check)
const { buildChildPromptArgs, defaultModelRoute, hasZaiKey, HERMES_COMMANDS, DEFAULT_READY_PROMPT } = require(WRAPPER_PATH);

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
  console.log('  [TEST] Empty args + TTY=true -> expected empty array (interactive shell), got:', result);
  assert.deepStrictEqual(result, []);
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
assert.deepStrictEqual(defaultModelRoute({}), {
  provider: 'custom:ollama-local-64k',
  model: 'qwen2.5:3b-64k',
});
assert.deepStrictEqual(defaultModelRoute({ Z_AI_API_KEY: 'zai-key' }), {
  provider: 'custom:zai-coding-glm',
  model: 'glm-5.2',
});
assert.deepStrictEqual(defaultModelRoute({
  Z_AI_API_KEY: 'zai-key',
  HERMES_YOLO_PROVIDER: 'custom:test-provider',
  HERMES_YOLO_MODEL: 'test-model',
}), {
  provider: 'custom:test-provider',
  model: 'test-model',
});

// 2. Test live wrapper execution (using --version as a fast safe check)
const binaryPath = path.resolve(__dirname, '../hermes-yolo-wrapper.js');
try {
  // Use HERMES_YOLO_NO_PREFLIGHT to bypass the slow Telegram API calls during testing
  const stdout = execSync(`HERMES_YOLO_NO_PREFLIGHT=1 node ${binaryPath} --version`, {
    encoding: 'utf8'
  });
  console.log('  [TEST] Execution output:\n' + stdout.split('\n').map(l => '    ' + l).join('\n'));
  assert.ok(stdout.includes('Hermes Agent'), 'Output must contain the Hermes Agent version information');
  console.log('  [TEST] Live execution passed successfully.');
} catch (e) {
  console.error('  [FAIL] Live execution failed:', e.message);
  process.exit(1);
}

console.log('\n=== All tests passed successfully! ===');
