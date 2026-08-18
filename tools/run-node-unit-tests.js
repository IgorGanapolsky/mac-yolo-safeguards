#!/usr/bin/env node
'use strict';

/**
 * Parallel Node Tool Unit Test Runner
 *
 * Replaces serial bash test loops with an optimized worker pool.
 * Cuts CI duration from ~187s down to ~45-50s across 220+ test files.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const EXCLUDED_TESTS = new Set([
  'tests/test-mac-text-hotkeys-config.js',
  'tests/test-hermes-buzz-integration.js'
]);

// Discover test files
const testsDir = path.join(__dirname, '../tests');
const allFiles = fs.readdirSync(testsDir);
const testFiles = allFiles
  .filter(f => (f.startsWith('test-') && f.endsWith('.js')) || f.endsWith('.test.js'))
  .map(f => path.join('tests', f))
  .filter(f => !EXCLUDED_TESTS.has(f))
  .sort();

console.log(`[Test Pool] Found ${testFiles.length} unit test files to run in parallel.`);

const concurrency = Math.min(testFiles.length, Math.max(4, os.cpus().length || 4));
console.log(`[Test Pool] Concurrency: ${concurrency} workers.`);

let currentIndex = 0;
let passedCount = 0;
let failedCount = 0;
const failedFiles = [];
const startTime = Date.now();

// Hermes stub setup if needed
const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ci-stub-'));
const stubPath = path.join(stubDir, 'hermes');
fs.writeFileSync(stubPath, '#!/bin/sh\necho "Hermes Agent 0.17.0 (ci-stub)"\n', { mode: 0o755 });
const env = {
  ...process.env,
  HERMES_BIN: process.env.HERMES_BIN || stubPath
};

function runNextTest(workerId) {
  if (currentIndex >= testFiles.length) {
    return Promise.resolve();
  }

  const file = testFiles[currentIndex++];
  const fileStart = Date.now();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('close', (code) => {
      const duration = ((Date.now() - fileStart) / 1000).toFixed(2);
      if (code === 0) {
        passedCount++;
        process.stdout.write(`✔ [PASS] ${file} (${duration}s)\n`);
      } else {
        failedCount++;
        failedFiles.push({ file, code, stdout, stderr });
        process.stderr.write(`✖ [FAIL] ${file} (exit ${code}, ${duration}s)\n`);
      }
      resolve(runNextTest(workerId));
    });
  });
}

const workers = Array.from({ length: concurrency }, (_, i) => runNextTest(i));

Promise.all(workers).then(() => {
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n========================================');
  console.log(`[Test Pool Summary] Completed in ${totalDuration}s`);
  console.log(`Passed: ${passedCount} | Failed: ${failedCount} | Total: ${testFiles.length}`);
  console.log('========================================\n');

  if (failedCount > 0) {
    console.error('--- FAILED TESTS DETAILS ---');
    for (const f of failedFiles) {
      console.error(`\nFile: ${f.file} (Exit: ${f.code})`);
      if (f.stderr) console.error(`STDERR:\n${f.stderr}`);
      if (f.stdout) console.error(`STDOUT:\n${f.stdout.slice(0, 500)}`);
    }
    try { fs.rmSync(stubDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }

  try { fs.rmSync(stubDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
});
