'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_PATH = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== Running hermes-yolo-wrapper tests ===\n');

// 1. Load the wrapper module (thanks to our module.exports check)
const { buildChildPromptArgs, HERMES_COMMANDS } = require(WRAPPER_PATH);

console.log('Testing buildChildPromptArgs...');

// Helper to temporarily mock process.stdout.isTTY
function runWithMockedTTY(isTTY, fn) {
  const originalIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', {
    value: isTTY,
    configurable: true
  });
  try {
    fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true
    });
  }
}

// Test case: Empty arguments in interactive terminal (TTY)
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs([]);
  console.log('  [TEST] Empty args + TTY=true -> expected ready smoke prompt, got:', result);
  assert.deepStrictEqual(result, ['-z', 'Reply with exactly HERMES-YOLO-READY']);
});

// Test case: Empty arguments in non-interactive pipeline (non-TTY)
runWithMockedTTY(false, () => {
  const result = buildChildPromptArgs([]);
  console.log('  [TEST] Empty args + TTY=false -> expected ready smoke prompt, got:', result);
  assert.deepStrictEqual(result, ['-z', 'Reply with exactly HERMES-YOLO-READY']);
});

// Test case: Custom prompt positional argument
runWithMockedTTY(true, () => {
  const result = buildChildPromptArgs(['Write a python hello world script']);
  console.log('  [TEST] Custom prompt -> expected ["-z", "Autonomous Hermes YOLO Operation"], got:', result);
  assert.deepStrictEqual(result[0], '-z');
  assert.strictEqual(result[1], 'Autonomous Hermes YOLO Operation'); // promptText is args.join(' ') from process.argv
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
