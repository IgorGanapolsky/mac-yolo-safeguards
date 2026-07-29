#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'ensure-grepai-index.js');

const help = spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
assert.strictEqual(help.status, 0, help.stderr);
assert.ok(help.stdout.includes('ensure-grepai-index'));

// --json should not throw; may exit 0 or 1 depending on machine index health
const run = spawnSync(process.execPath, [TOOL, '--json'], { encoding: 'utf8', timeout: 60000 });
assert.ok(run.status === 0 || run.status === 1, `unexpected exit ${run.status}`);
const body = JSON.parse(run.stdout);
assert.ok('isolatedBytes' in body);
assert.ok('linked' in body || body.error);
console.log('ensure-grepai-index tests: PASS');
