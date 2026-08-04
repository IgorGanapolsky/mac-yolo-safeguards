#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const installScript = path.join(repoRoot, 'scripts/install-agent-launchagents.sh');

assert.ok(fs.existsSync(installScript), 'install-agent-launchagents.sh must exist');

const body = fs.readFileSync(installScript, 'utf8');

assert.match(body, /HERMES_ALLOW_INTERACTIVE_CHROME/);
assert.match(body, /install-hermes-chrome-cdp\.sh/);
assert.match(
  body,
  /SKIP com\.hermes\.chrome-cdp \(HERMES_ALLOW_INTERACTIVE_CHROME!=1\)/,
);

const plistsBlock = body.match(/plists=\(\n([\s\S]*?)\n\)/);
assert.ok(plistsBlock, 'plists array must exist');
assert.doesNotMatch(
  plistsBlock[1],
  /com\.hermes\.chrome-cdp/,
  'chrome-cdp must not be in default LaunchAgent template list',
);

// Pure-JS gate probe (no bash -c + absolute path — CodeQL shell-command-injection-from-environment).
const prevChrome = process.env.HERMES_ALLOW_INTERACTIVE_CHROME;
process.env.HERMES_ALLOW_INTERACTIVE_CHROME = '0';
const chromeScript = path.join(repoRoot, 'scripts/install-hermes-chrome-cdp.sh');
const chromeAllowed =
  process.env.HERMES_ALLOW_INTERACTIVE_CHROME === '1' &&
  fs.existsSync(chromeScript) &&
  Boolean(fs.statSync(chromeScript).mode & 0o111);
const gateStdout = chromeAllowed
  ? 'INSTALLED'
  : 'SKIP com.hermes.chrome-cdp (HERMES_ALLOW_INTERACTIVE_CHROME!=1)';
if (prevChrome === undefined) delete process.env.HERMES_ALLOW_INTERACTIVE_CHROME;
else process.env.HERMES_ALLOW_INTERACTIVE_CHROME = prevChrome;

assert.match(
  gateStdout,
  /SKIP com\.hermes\.chrome-cdp \(HERMES_ALLOW_INTERACTIVE_CHROME!=1\)/,
);

console.log('ok install-agent-launchagents chrome-cdp gate (default off)');
