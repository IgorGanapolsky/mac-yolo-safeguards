#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.env.ZAI_API_SPEND_FILE = path.join(os.tmpdir(), `zai-glm53-sw-spend-${process.pid}.json`);

const sw = require('../tools/zai-glm53-systemwide');

function pass(name) {
  console.log(`PASS ${name}`);
}

function run(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zai-glm53-sw-'));

run('upsertMarkedBlock is idempotent', () => {
  const first = sw.upsertMarkedBlock('# existing\n', sw.SHELL_BLOCK);
  const second = sw.upsertMarkedBlock(first, sw.SHELL_BLOCK);
  assert.strictEqual((first.match(/HERMES_TOKEN_BUDGET_USD=10.00/g) || []).length, 1);
  assert.strictEqual(first, second);
});

run('applyShellRc writes $10 cap without secrets', () => {
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const out = sw.applyShellRc({
    home,
    files: [path.join(home, '.zshrc'), path.join(home, '.zprofile')],
  });
  assert.strictEqual(out.length, 2);
  const zsh = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.ok(zsh.includes('HERMES_TOKEN_BUDGET_USD=10.00'));
  assert.ok(zsh.includes('HERMES_PREFER_GLM53_CYBER=1'));
  assert.ok(!/sk-[A-Za-z0-9]{8}/.test(zsh));
});

run('applyLaunchAgent writes plist without loading', () => {
  const home = path.join(tmp, 'home2');
  const dest = path.join(home, 'Library', 'LaunchAgents', `${sw.PLIST_LABEL}.plist`);
  const out = sw.applyLaunchAgent({ home, plistPath: dest, skipLoad: true });
  assert.strictEqual(out.changed, true);
  const raw = fs.readFileSync(dest, 'utf8');
  assert.ok(raw.includes('HERMES_TOKEN_BUDGET_USD 10.00'));
  assert.ok(raw.includes('HERMES_GLM_MODEL glm-5.3'));
});

run('applyOpenCodeProvider adds hermes without stealing default', () => {
  const dest = path.join(tmp, 'opencode.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify({ model: 'meta/muse-spark-1.1', provider: { meta: {} } }, null, 2));
  const out = sw.applyOpenCodeProvider({ opencodePath: dest });
  assert.strictEqual(out.defaultUnchanged, true);
  const data = JSON.parse(fs.readFileSync(dest, 'utf8'));
  assert.strictEqual(data.model, 'meta/muse-spark-1.1');
  assert.ok(data.provider.hermes.models['glm-5.3']);
  assert.ok(data.provider.hermes.options.baseURL.includes('4010'));
});

run('classifyCyber never enables metered', () => {
  const out = sw.classifyCyber('CyberGym vulnerability audit');
  assert.strictEqual(out.primary.marginalTokenCostUsd, 0);
  assert.strictEqual(out.meteredFallback, null);
  assert.strictEqual(out.effort, 'max');
  assert.strictEqual(out.cyber, true);
});

run('isCyberTask matches SCMP article terms', () => {
  assert.strictEqual(sw.isCyberTask('Mythos-level cyber defence'), true);
  assert.strictEqual(sw.isCyberTask('implement login form'), false);
});

run('CLI cyber --json', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'zai-glm53'), 'cyber', 'security audit', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ZAI_API_SPEND_FILE: process.env.ZAI_API_SPEND_FILE },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.effort, 'max');
  assert.strictEqual(parsed.meteredFallback, null);
});

if (process.exitCode) {
  console.error('zai-glm53 systemwide tests FAILED');
  process.exit(1);
}
console.log('zai-glm53 systemwide tests: PASS');
