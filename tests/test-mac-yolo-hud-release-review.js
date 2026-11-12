#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewHudRelease } = require('../tools/mac-yolo-hud-release-review');

const PASSING = [
  'id="attentionLine"',
  'hudPanel.alphaValue = 1',
  'function confirmHudAction(action) { return action; }',
  'onclick="confirmHudAction(\'freeUpMemory\')"',
  'function requestUninstall(name) {',
  '  if (!name || !confirmRemoval(name)) return;',
  "  sendAction('uninstallApp', { appName: String(name).trim() });",
  '}',
].join('\n');

const FAILING = [
  'onclick="triggerHudAction(\'freeUpMemory\', this, \'Reaping\', \'Done\')"',
  'onclick="triggerHudAction(\'coolDownFans\', this, \'Cooling\', \'Done\')"',
  'Click any card for a closer look',
  'hudPanel.alphaValue = 0.88',
  '.shell::before { background: radial-gradient(circle, rgba(0,0,0,0.4), rgba(0,0,0,0.6)); }',
  'function requestUninstall(name) {',
  "  sendAction('uninstallApp', { appName: String(name).trim() });",
  '}',
].join('\n');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function runCli(filePath) {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'mac-yolo-hud-release-review.js'), filePath], {
    encoding: 'utf8',
  });
}

function main() {
  const pass = reviewHudRelease(PASSING);
  assert.strictEqual(pass.ok, true, ids(pass).join(','));
  assert.deepStrictEqual(pass.findings, []);

  const fail = reviewHudRelease(FAILING);
  assert.strictEqual(fail.ok, false);
  assert.deepStrictEqual(ids(fail), ['attention', 'clickPrompt', 'destructiveClick', 'uninstallImmediate', 'panelFade', 'flatTint']);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-review-'));
  const passFile = path.join(dir, 'pass.swift');
  const failFile = path.join(dir, 'fail.swift');
  fs.writeFileSync(passFile, PASSING);
  fs.writeFileSync(failFile, FAILING);
  const before = fs.readFileSync(failFile, 'utf8');

  const passRun = runCli(passFile);
  assert.strictEqual(passRun.status, 0, passRun.stdout + passRun.stderr);
  assert.ok(passRun.stdout.indexOf('PASS') !== -1);

  const failRun = runCli(failFile);
  assert.strictEqual(failRun.status, 1, failRun.stdout + failRun.stderr);
  assert.ok(failRun.stdout.indexOf('attention:') === 0 || failRun.stdout.indexOf('attention:') !== -1);
  assert.strictEqual(fs.readFileSync(failFile, 'utf8'), before);

  const missing = runCli(path.join(dir, 'nope.swift'));
  assert.strictEqual(missing.status, 2);

  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write('hud-release-review: PASS\n');
}

main();
