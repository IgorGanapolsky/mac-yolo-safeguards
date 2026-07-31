#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(repo, '.githooks', 'pre-commit'), 'utf8');
const jestConfig = fs.readFileSync(path.join(repo, 'hermes-mobile', 'jest.config.js'), 'utf8');

assert.match(jestConfig, /worktrees/, 'fixture requires the repo-local worktree ignore');
assert.match(hook, /--findRelatedTests/, 'hook must run tests related to staged mobile files');
assert.match(
  hook,
  /--runTestsByPath/,
  'hook must execute the exact nonempty paths returned by Jest listTests',
);
assert.match(
  hook,
  /--testPathIgnorePatterns=['"]\/node_modules\/['"]/,
  'hook must include tests from the current .worktrees checkout',
);
assert.doesNotMatch(
  hook,
  /--passWithNoTests/,
  'zero related tests must fail instead of being reported as a green gate',
);
assert.match(hook, /typecheck/, 'worktree test repair must preserve the typecheck gate');

function writeExecutable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o755 });
}

function runHook(listTestsOutput) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-precommit-gate-'));
  const bin = path.join(fixture, 'bin');
  const mobile = path.join(fixture, 'hermes-mobile');
  const marker = path.join(fixture, 'jest-ran');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(mobile, 'src'), { recursive: true });
  fs.copyFileSync(path.join(repo, '.githooks', 'pre-commit'), path.join(fixture, 'pre-commit'));
  fs.chmodSync(path.join(fixture, 'pre-commit'), 0o755);
  fs.writeFileSync(path.join(mobile, 'src', 'example.ts'), 'export const example = true;\n');
  writeExecutable(path.join(bin, 'gitleaks'), '#!/bin/sh\nexit 0\n');
  writeExecutable(path.join(bin, 'node'), '#!/bin/sh\nexit 0\n');
  writeExecutable(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  writeExecutable(
    path.join(bin, 'npx'),
    `#!/bin/sh
case " $* " in
  *" --listTests "*)
    printf '%s' '${listTestsOutput}'
    exit 0
    ;;
  *" --runTestsByPath "*)
    touch '${marker}'
    exit 0
    ;;
esac
printf '%s\\n' 'No tests found, exiting with code 0'
exit 0
`,
  );
  childProcess.execFileSync('git', ['init', '-q'], { cwd: fixture });
  childProcess.execFileSync('git', ['add', 'hermes-mobile/src/example.ts'], { cwd: fixture });
  const result = childProcess.spawnSync(path.join(fixture, 'pre-commit'), {
    cwd: fixture,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  const ranJest = fs.existsSync(marker);
  fs.rmSync(fixture, { recursive: true, force: true });
  return { ...result, ranJest };
}

const zeroTests = runHook('');
assert.notStrictEqual(zeroTests.status, 0, 'hook must fail when Jest lists zero related tests');
assert.match(zeroTests.stdout, /zero tests relate/);
assert.strictEqual(zeroTests.ranJest, false, 'hook must not run a vacuous Jest pass');

const oneTest = runHook('/tmp/fixture/ChatConnectionPanel.test.tsx\n');
assert.strictEqual(oneTest.status, 0, oneTest.stderr || oneTest.stdout);
assert.strictEqual(oneTest.ranJest, true, 'hook must execute Jest when a related test exists');

console.log('precommit worktree test gate: 10/10 passed');
