#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

const gateProbe = spawnSync(
  '/bin/bash',
  [
    '-c',
    `
set -euo pipefail
repo_root=${JSON.stringify(repoRoot)}
export HERMES_ALLOW_INTERACTIVE_CHROME=0
if [[ "\${HERMES_ALLOW_INTERACTIVE_CHROME:-0}" == "1" && -x "\${repo_root}/scripts/install-hermes-chrome-cdp.sh" ]]; then
  echo INSTALLED
else
  echo "SKIP com.hermes.chrome-cdp (HERMES_ALLOW_INTERACTIVE_CHROME!=1)"
fi
`,
  ],
  { encoding: 'utf8' },
);

assert.strictEqual(gateProbe.status, 0, gateProbe.stderr);
assert.match(
  gateProbe.stdout,
  /SKIP com\.hermes\.chrome-cdp \(HERMES_ALLOW_INTERACTIVE_CHROME!=1\)/,
);

console.log('ok install-agent-launchagents chrome-cdp gate (default off)');
