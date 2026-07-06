'use strict';

const assert = require('assert');
const { execSync, spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_PATH = path.resolve(__dirname, '../hermes-yolo-wrapper.js');

console.log('=== Running hermes-yolo-wrapper tests ===\n');

// 1. Load the wrapper module (thanks to our module.exports check)
const {
  buildChildPromptArgs,
  buildChildStdio,
  isOneshotArgs,
  shouldShowProgress,
  chooseLocalModel,
  chooseZaiProvider,
  configuredProviderIds,
  defaultModelRoute,
  findOllamaBinary,
  hasOpenRouterKey,
  hasZaiKey,
  mergedHermesEnv,
  parseEnvFile,
  HERMES_COMMANDS,
  DEFAULT_READY_PROMPT,
} = require(WRAPPER_PATH);

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

  // Test local repository env loading:
  const originalCwd = process.cwd();
  const tempRepoDir = path.join(require('os').tmpdir(), `hermes-yolo-test-repo-${process.pid}`);
  fs.mkdirSync(tempRepoDir, { recursive: true });
  fs.mkdirSync(path.join(tempRepoDir, 'hermes-mobile'), { recursive: true });
  fs.writeFileSync(path.join(tempRepoDir, '.env'), 'LOCAL_KEY_ROOT=root-val\n');
  fs.writeFileSync(path.join(tempRepoDir, 'hermes-mobile', '.env'), 'LOCAL_KEY_MOBILE=mobile-val\n');
  try {
    process.chdir(tempRepoDir);
    const mergedLocal = mergedHermesEnv({ OVERRIDE_KEY: 'override-val' }, tmpEnvPath);
    assert.strictEqual(mergedLocal.LOCAL_KEY_ROOT, 'root-val');
    assert.strictEqual(mergedLocal.LOCAL_KEY_MOBILE, 'mobile-val');
    assert.strictEqual(mergedLocal.OPENROUTER_API_KEY, 'openrouter-key');
    assert.strictEqual(mergedLocal.OVERRIDE_KEY, 'override-val');
  } finally {
    process.chdir(originalCwd);
    try { fs.unlinkSync(path.join(tempRepoDir, '.env')); } catch(e){}
    try { fs.unlinkSync(path.join(tempRepoDir, 'hermes-mobile', '.env')); } catch(e){}
    try { fs.rmdirSync(path.join(tempRepoDir, 'hermes-mobile')); } catch(e){}
    try { fs.rmdirSync(tempRepoDir); } catch(e){}
  }
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

// 2. Test live wrapper execution (using --version as a fast safe check)
const binaryPath = path.resolve(__dirname, '../hermes-yolo-wrapper.js');
// Isolate the singleton lock from any concurrently-running hermes-yolo (e.g. the
// live session) via the wrapper's HERMES_YOLO_LOCK_PATH escape hatch. The
// production singleton guard stays intact; the test just must not collide with it.
const testLockPath = path.join(require('os').tmpdir(), `hermes-yolo-test-${process.pid}.lock`);
try {
  try { fs.unlinkSync(testLockPath); } catch (e) { /* may not exist */ }
  // HERMES_YOLO_NO_PREFLIGHT bypasses slow Telegram API calls during testing
  const stdout = execSync(`HERMES_YOLO_NO_PREFLIGHT=1 HERMES_YOLO_LOCK_PATH=${testLockPath} node ${binaryPath} --version`, {
    encoding: 'utf8'
  });
  console.log('  [TEST] Execution output:\n' + stdout.split('\n').map(l => '    ' + l).join('\n'));
  assert.ok(stdout.includes('Hermes Agent'), 'Output must contain the Hermes Agent version information');
  console.log('  [TEST] Live execution passed successfully.');
} catch (e) {
  console.error('  [FAIL] Live execution failed:', e.message);
  process.exit(1);
}

console.log('\nTesting one-shot stdio / progress helpers...');

assert.strictEqual(isOneshotArgs(['-z', 'hello']), true);
assert.strictEqual(isOneshotArgs(['chat']), false);
assert.strictEqual(isOneshotArgs([]), false);
assert.deepStrictEqual(buildChildStdio(['-z', 'hello']), ['ignore', 'inherit', 'inherit']);
assert.strictEqual(buildChildStdio(['chat']), 'inherit');
assert.strictEqual(buildChildStdio(['--version']), 'inherit');
// auto mode: TTY stderr + one-shot => progress on; passthrough or non-TTY => off
assert.strictEqual(shouldShowProgress(['-z', 'x'], { progressEnv: undefined, stderrIsTTY: true }), true);
assert.strictEqual(shouldShowProgress(['-z', 'x'], { progressEnv: undefined, stderrIsTTY: false }), false);
assert.strictEqual(shouldShowProgress(['chat'], { progressEnv: undefined, stderrIsTTY: true }), false);
// explicit override wins both ways
assert.strictEqual(shouldShowProgress(['chat'], { progressEnv: '1', stderrIsTTY: false }), true);
assert.strictEqual(shouldShowProgress(['-z', 'x'], { progressEnv: '0', stderrIsTTY: true }), false);
console.log('  [TEST] stdio/progress helpers passed.');

// 3. Live progress test: fake HERMES_BIN that answers after a delay; wrapper must
// print start/heartbeat/done lines on stderr while stdout stays just the answer.
const tmpDir = require('os').tmpdir();

// Spawned wrappers must not inherit the developer's HERMES_* knobs (a leaked
// HERMES_YOLO_INTERACTIVE=1 silently flips the code path under test), must not
// mutate the real dashboard status.json, and must never run the system-wide
// suspended-process SIGKILL sweep during a test run.
function wrapperTestEnv(overrides) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('HERMES_')) env[k] = v;
  }
  return Object.assign(env, {
    HERMES_YOLO_NO_SWEEP: '1',
    HERMES_YOLO_STATUS_PATH: path.join(tmpDir, `hermes-yolo-status-${process.pid}.json`),
  }, overrides);
}
const fakeBinPath = path.join(tmpDir, `hermes-yolo-fakebin-${process.pid}.js`);
fs.writeFileSync(fakeBinPath, [
  '#!/usr/bin/env node',
  "setTimeout(() => { process.stdout.write('FAKE-ANSWER\\n'); process.exit(0); }, 1200);",
  '',
].join('\n'), { mode: 0o755 });

const progressLockPath = path.join(tmpDir, `hermes-yolo-progress-${process.pid}.lock`);
const progressLogPath = path.join(tmpDir, `hermes-yolo-progress-${process.pid}.log`);
try {
  const run = spawnSync(process.execPath, [WRAPPER_PATH, 'progress smoke prompt'], {
    encoding: 'utf8',
    timeout: 30000,
    env: wrapperTestEnv({
      HERMES_BIN: fakeBinPath,
      HERMES_YOLO_PROGRESS: '1',
      HERMES_YOLO_HEARTBEAT_MS: '300',
      HERMES_YOLO_LOCK_PATH: progressLockPath,
      HERMES_YOLO_LOG_PATH: progressLogPath,
    }),
  });
  console.log('  [TEST] progress run stderr:\n' + String(run.stderr).split('\n').map(l => '    ' + l).join('\n'));
  assert.strictEqual(run.status, 0, `wrapper must exit 0, got ${run.status} (stderr: ${run.stderr})`);
  assert.ok(run.stdout.includes('FAKE-ANSWER'), 'stdout must carry the agent answer');
  assert.ok(run.stderr.includes('agent started'), 'stderr must announce the run started');
  assert.ok(run.stderr.includes('still working'), 'stderr must heartbeat during the run');
  assert.ok(run.stderr.includes('done in'), 'stderr must announce completion');
  assert.ok(!run.stdout.includes('still working'), 'progress lines must NOT pollute stdout');
  console.log('  [TEST] Live progress/heartbeat output passed.');
} finally {
  try { fs.unlinkSync(fakeBinPath); } catch (e) {}
  try { fs.unlinkSync(progressLockPath); } catch (e) {}
  try { fs.unlinkSync(progressLogPath); } catch (e) {}
}

// 4. SIGHUP tree-kill test: closing the terminal must kill the WHOLE agent tree,
// including grandchildren — the 2026-07-06 leak kept an orphaned agent calling
// the GLM gateway for minutes after its terminal died.
(async () => {
  const pidFilePath = path.join(tmpDir, `hermes-yolo-pids-${process.pid}.json`);
  const slowBinPath = path.join(tmpDir, `hermes-yolo-slowbin-${process.pid}.js`);
  fs.writeFileSync(slowBinPath, [
    '#!/usr/bin/env node',
    "const { spawn } = require('child_process');",
    "const fs = require('fs');",
    "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);",
    `fs.writeFileSync(${JSON.stringify(pidFilePath)}, JSON.stringify({ me: process.pid, grandchild: grandchild.pid }));`,
    'setTimeout(() => {}, 30000);',
    '',
  ].join('\n'), { mode: 0o755 });

  const hupLockPath = path.join(tmpDir, `hermes-yolo-hup-${process.pid}.lock`);
  const hupLogPath = path.join(tmpDir, `hermes-yolo-hup-${process.pid}.log`);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

  let wrapperProc = null;
  try {
    wrapperProc = spawn(process.execPath, [WRAPPER_PATH, 'sighup smoke prompt'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: wrapperTestEnv({
        HERMES_BIN: slowBinPath,
        HERMES_YOLO_PROGRESS: '0',
        HERMES_YOLO_LOCK_PATH: hupLockPath,
        HERMES_YOLO_LOG_PATH: hupLogPath,
      }),
    });

    let pids = null;
    for (let i = 0; i < 100 && !pids; i++) {
      await sleep(100);
      try { pids = JSON.parse(fs.readFileSync(pidFilePath, 'utf8')); } catch (e) {}
    }
    assert.ok(pids, 'fake agent must start and record its pids');
    assert.ok(isAlive(pids.me) && isAlive(pids.grandchild), 'agent + grandchild must be running before SIGHUP');
    // Guard against env leakage flipping the code path: this test is only
    // meaningful if the run under test is the detached one-shot topology.
    const wrapperLog = fs.readFileSync(hupLogPath, 'utf8');
    assert.ok(wrapperLog.includes('oneshot=true detached=true'), 'run under test must be a detached one-shot');

    wrapperProc.kill('SIGHUP');
    let cleaned = false;
    for (let i = 0; i < 50 && !cleaned; i++) {
      await sleep(100);
      cleaned = !isAlive(pids.me) && !isAlive(pids.grandchild);
    }
    assert.ok(cleaned, `SIGHUP must kill the whole agent tree (agent alive=${isAlive(pids.me)}, grandchild alive=${isAlive(pids.grandchild)})`);
    console.log('  [TEST] SIGHUP tree-kill passed (agent + grandchild reaped).');
    console.log('\n=== All tests passed successfully! ===');
  } catch (e) {
    console.error('  [FAIL]', e.message);
    process.exitCode = 1;
  } finally {
    // SIGTERM first so the wrapper group-kills its detached tree itself; a bare
    // SIGKILL bypasses its handlers and would strand the fake agent + grandchild.
    if (wrapperProc) {
      try { wrapperProc.kill('SIGTERM'); } catch (e) {}
      await sleep(500);
      try { wrapperProc.kill('SIGKILL'); } catch (e) {}
    }
    try {
      const pids = JSON.parse(fs.readFileSync(pidFilePath, 'utf8'));
      for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} }
    } catch (e) {}
    try { fs.unlinkSync(pidFilePath); } catch (e) {}
    try { fs.unlinkSync(slowBinPath); } catch (e) {}
    try { fs.unlinkSync(hupLockPath); } catch (e) {}
    try { fs.unlinkSync(hupLogPath); } catch (e) {}
  }
})();
