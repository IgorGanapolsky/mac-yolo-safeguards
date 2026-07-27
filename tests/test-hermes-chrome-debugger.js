#!/usr/bin/env node
'use strict';

/**
 * Contract tests for the chrome.debugger bridge (no live Chrome / extension required).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const bridgePath = path.join(root, 'scripts/hermes-chrome-debugger-bridge.js');
const installPath = path.join(root, 'scripts/install-hermes-chrome-debugger.sh');
const browserInstall = path.join(root, 'scripts/install-browser-bridge.sh');
const plist = path.join(root, 'com.hermes.chrome-debugger.plist');
const manifest = path.join(root, 'extensions/hermes-webbridge/manifest.json');
const background = path.join(root, 'extensions/hermes-webbridge/background.js');
const docs = path.join(root, 'docs/BROWSER-CONTROL.md');
const teardown = path.join(root, 'docs/KIMI-WEBBRIDGE-TEARDOWN.md');

let failed = 0;
function ok(msg) {
  console.log(`ok ${msg}`);
}
function bad(msg) {
  console.error(`FAIL ${msg}`);
  failed += 1;
}

function mustExist(p, label) {
  if (!fs.existsSync(p)) bad(`${label} missing: ${p}`);
  else ok(`${label} present`);
}

mustExist(bridgePath, 'bridge');
mustExist(installPath, 'install script');
mustExist(browserInstall, 'install-browser-bridge');
mustExist(plist, 'plist');
mustExist(manifest, 'manifest');
mustExist(background, 'background');
mustExist(docs, 'BROWSER-CONTROL docs');
mustExist(teardown, 'KIMI teardown');

const bridgeSrc = fs.readFileSync(bridgePath, 'utf8');
const bgSrc = fs.readFileSync(background, 'utf8');
const installSrc = fs.readFileSync(installPath, 'utf8');
const browserSrc = fs.readFileSync(browserInstall, 'utf8');
const plistSrc = fs.readFileSync(plist, 'utf8');
const docsSrc = fs.readFileSync(docs, 'utf8');
const teardownSrc = fs.readFileSync(teardown, 'utf8');
const manifestJson = JSON.parse(fs.readFileSync(manifest, 'utf8'));

if (!bridgeSrc.includes('chrome.debugger-bridge')) bad('bridge must identify Browser field');
else ok('bridge Browser identity');

if (!bridgeSrc.includes('/hermes-ext')) bad('bridge must expose extension WS path');
else ok('bridge extension path');

if (!bridgeSrc.includes('/json/version')) bad('bridge must serve /json/version');
else ok('bridge /json/version');

if (!bgSrc.includes('chrome.debugger.attach')) bad('background must call chrome.debugger.attach');
else ok('background attach');

if (!bgSrc.includes('ws://127.0.0.1:9223/hermes-ext')) bad('background must connect to extension relay');
else ok('background relay URL');

if (!Array.isArray(manifestJson.permissions) || !manifestJson.permissions.includes('debugger')) {
  bad('manifest must request debugger permission');
} else ok('manifest debugger permission');

if (!manifestJson.background || manifestJson.background.service_worker !== 'background.js') {
  bad('manifest must declare background service_worker');
} else ok('manifest service_worker');

if (!installSrc.includes('com.hermes.chrome-debugger')) bad('install must name LaunchAgent');
else ok('install LaunchAgent');

if (!installSrc.includes('bootout') || !installSrc.includes('com.hermes.chrome-cdp')) {
  bad('install must bootout chrome-cdp to free :9222');
} else ok('install frees chrome-cdp port');

if (!browserSrc.includes('--mode=debugger') && !browserSrc.includes('mode=debugger')) {
  bad('install-browser-bridge must offer --mode=debugger');
} else ok('install-browser-bridge debugger mode');

if (!plistSrc.includes('hermes-chrome-debugger-bridge.js')) bad('plist must launch bridge');
else ok('plist program');

if (!docsSrc.includes('chrome.debugger') || !docsSrc.includes('--mode=debugger')) {
  bad('docs must document debugger mode');
} else ok('docs debugger mode');

if (
  !teardownSrc.includes('chrome.debugger') ||
  !teardownSrc.includes('**Shipped**') ||
  !teardownSrc.includes('--mode=debugger')
) {
  bad('teardown must mark chrome.debugger steal shipped');
} else ok('teardown chrome.debugger shipped');

// Module load + unit helpers
let mod;
try {
  mod = require(bridgePath);
  assert.ok(mod.versionBody().webSocketDebuggerUrl.includes('9222'));
  assert.ok(String(mod.versionBody().Browser).includes('chrome.debugger'));
  const target = mod.targetFromTab({ id: 7, title: 'T', url: 'https://example.com' });
  assert.equal(target.id, '7');
  assert.ok(target.webSocketDebuggerUrl.includes('/devtools/page/7'));
  ok('bridge module helpers');
} catch (err) {
  bad(`bridge module: ${err.message}`);
}

// Syntax: node -c
const syn = spawnSync(process.execPath, ['--check', bridgePath], { encoding: 'utf8' });
if (syn.status !== 0) bad(`node --check bridge: ${syn.stderr}`);
else ok('node --check bridge');

const bashN = spawnSync('bash', ['-n', installPath], { encoding: 'utf8' });
if (bashN.status !== 0) bad(`bash -n install: ${bashN.stderr}`);
else ok('bash -n install');

const bashBridge = spawnSync('bash', ['-n', browserInstall], { encoding: 'utf8' });
if (bashBridge.status !== 0) bad(`bash -n install-browser-bridge: ${bashBridge.stderr}`);
else ok('bash -n install-browser-bridge');

const help = spawnSync('bash', [browserInstall, '--help'], { encoding: 'utf8' });
if (help.status !== 0 || !help.stdout.includes('debugger')) {
  bad('install-browser-bridge --help must mention debugger');
} else ok('install-browser-bridge --help');

if (failed) {
  console.error(`FAILED ${failed} chrome.debugger checks`);
  process.exit(1);
}
console.log('ok hermes chrome.debugger contracts');
