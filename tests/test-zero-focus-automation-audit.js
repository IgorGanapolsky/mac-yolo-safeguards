#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  scanText,
  shouldSkip,
  isAuditableFile,
  buildReport,
} = require('../tools/zero-focus-automation-audit');

const TOOL = path.resolve(__dirname, '../tools/zero-focus-automation-audit.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('safe API and headless commands pass', () => {
  const source = [
    'gh api repos/org/repo/actions/runs',
    'playwright chromium --headless',
    'emulator -avd ci -no-window -no-audio',
    'xcodebuild test -scheme Hermes',
  ].join('\n');
  assert.deepStrictEqual(scanText('/tmp/safe.sh', source), []);
});

test('detects app launch, AppleScript, and synthetic input', () => {
  const source = [
    'open -a Simulator',
    '/usr/bin/osascript workflow.scpt',
    'tell application "Google Chrome" to activate',
    'cliclick c:100,200',
  ].join('\n');
  const rules = scanText('/tmp/unsafe.sh', source).map((item) => item.rule);
  assert.ok(rules.includes('macos-open-app'));
  assert.ok(rules.includes('applescript-process'));
  assert.ok(rules.includes('applescript-activate'));
  assert.ok(rules.includes('synthetic-input'));
});

test('detects headed and personal-profile browser paths', () => {
  const source = [
    'browser = chromium.launch(headless=False)',
    'chromium.connectOverCDP("http://127.0.0.1:9222")',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222',
    'userDataDir: "/Users/alice/Library/Application Support/Google/Chrome/Default"',
  ].join('\n');
  const rules = scanText('/tmp/browser.py', source).map((item) => item.rule);
  assert.ok(rules.includes('headed-browser'));
  assert.ok(rules.includes('personal-browser-cdp'));
  assert.ok(rules.includes('personal-browser-app'));
  assert.ok(rules.includes('personal-browser-profile'));
});

test('default repository scan skips documentation, fixtures, and the detector', () => {
  assert.strictEqual(shouldSkip('docs/example.md'), true);
  assert.strictEqual(shouldSkip('tests/example.js'), true);
  assert.strictEqual(shouldSkip('hermes-mobile/src/__tests__/example.ts'), true);
  assert.strictEqual(shouldSkip('tools/zero-focus-automation-audit.js'), true);
  assert.strictEqual(shouldSkip('scripts/automation.sh'), false);
  assert.strictEqual(isAuditableFile('/tmp/package-lock.json'), false);
  assert.strictEqual(isAuditableFile('/tmp/automation.sh'), true);
  assert.strictEqual(isAuditableFile('/tmp/background.yml'), true);
});

test('audit reports legacy findings but enforce fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-focus-'));
  const safe = path.join(dir, 'safe.sh');
  const unsafe = path.join(dir, 'unsafe.sh');
  fs.writeFileSync(safe, '#!/bin/sh\ngh api user\n');
  fs.writeFileSync(unsafe, '#!/bin/sh\nopen -a Simulator\n');

  const audit = spawnSync(process.execPath, [TOOL, 'audit', '--json', dir], {
    encoding: 'utf8',
  });
  assert.strictEqual(audit.status, 0, audit.stderr);
  assert.strictEqual(JSON.parse(audit.stdout).findingCount, 1);

  const blocked = spawnSync(process.execPath, [TOOL, 'enforce', dir], {
    encoding: 'utf8',
  });
  assert.strictEqual(blocked.status, 2, blocked.stderr);

  const allowed = spawnSync(process.execPath, [TOOL, 'enforce', safe], {
    encoding: 'utf8',
  });
  assert.strictEqual(allowed.status, 0, allowed.stderr);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('repository audit returns a structured migration inventory', () => {
  const report = buildReport();
  assert.ok(report.scannedFiles > 0);
  assert.ok(Array.isArray(report.findings));
  assert.strictEqual(
    report.findingCount,
    Object.values(report.byCategory).reduce((sum, count) => sum + count, 0),
  );
});
