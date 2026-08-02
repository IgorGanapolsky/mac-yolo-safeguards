'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ensureWrapperCapabilities,
  heal,
  parseSkillSummary,
} = require('../tools/hermes-capability-heal');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-capability-heal-'));
const repoRoot = path.resolve(__dirname, '..');
const wrapper = path.join(tmp, 'hermes-yolo-wrapper.js');
fs.writeFileSync(wrapper, "const DEFAULT_TOOLSETS = process.env.HERMES_YOLO_TOOLSETS || 'terminal,file,memory';\n");

const before = ensureWrapperCapabilities(wrapper, false);
assert.strictEqual(before.healthy, false);
assert.deepStrictEqual(before.missing, ['skills', 'context7']);

const repaired = ensureWrapperCapabilities(wrapper, true);
assert.strictEqual(repaired.changed, true);
assert.strictEqual(ensureWrapperCapabilities(wrapper, false).healthy, true);
assert.strictEqual(ensureWrapperCapabilities(wrapper, true).changed, false, 'repair must be idempotent');
assert.match(fs.readFileSync(wrapper, 'utf8'), /function normalizeToolsets/);
assert.match(fs.readFileSync(wrapper, 'utf8'), /REQUIRED_TOOLSETS/);
assert.deepStrictEqual(parseSkillSummary('128 enabled, 0 disabled'), { enabled: 128, disabled: 0 });
assert.deepStrictEqual(parseSkillSummary('unparseable'), { enabled: 0, disabled: null });

const calls = [];
function healthyRunner(command, args) {
  calls.push([command, ...args]);
  const joined = args.join(' ');
  if (joined === 'config get terminal.cwd') return { code: 0, stdout: 'auto\n', stderr: '' };
  if (joined === 'config get mcp_servers.context7.enabled') return { code: 0, stdout: 'true\n', stderr: '' };
  if (joined === 'tools list') return { code: 0, stdout: 'enabled  skills  Skills\n', stderr: '' };
  if (joined === 'skills list') return { code: 0, stdout: '128 enabled, 0 disabled\n', stderr: '' };
  if (joined === 'mcp list') return { code: 0, stdout: 'context7 http all enabled\n', stderr: '' };
  if (joined === 'mcp test context7') return { code: 0, stdout: 'Connected\nTools discovered: 2\n', stderr: '' };
  if (args[0] === '-C' && args[2] === 'status') return { code: 0, stdout: '', stderr: '' };
  if (args[0] === '-C' && args[2] === 'rev-list') return { code: 0, stdout: '0 0\n', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}

const receipt = heal({
  hermes: '/fake/hermes',
  wrapper,
  repo: tmp,
  receiptDir: path.join(tmp, 'receipts'),
  probeNetwork: true,
  runner: healthyRunner,
});
assert.strictEqual(receipt.healthy, true);
assert.strictEqual(receipt.checks.enabledSkills, 128);
assert.strictEqual(receipt.checks.context7Connected, true);
assert.strictEqual(receipt.checks.launchDirectoryDynamic, true);
assert.ok(calls.some((call) => call.join(' ').includes('config set terminal.cwd auto')));
assert.ok(calls.some((call) => call.join(' ').includes('tools enable skills --platform cli')));

function brokenRunner(command, args) {
  const result = healthyRunner(command, args);
  if (args.join(' ') === 'skills list') return { code: 0, stdout: '0 enabled, 0 disabled\n', stderr: '' };
  return result;
}
const broken = heal({
  hermes: '/fake/hermes',
  wrapper,
  repo: tmp,
  repair: false,
  writeReceipt: false,
  runner: brokenRunner,
});
assert.strictEqual(broken.healthy, false, 'zero skills must fail closed');

const unprobed = heal({
  hermes: '/fake/hermes',
  wrapper,
  repo: tmp,
  repair: true,
  probeNetwork: false,
  writeReceipt: false,
  runner: healthyRunner,
});
assert.strictEqual(unprobed.healthy, false, 'an unprobed MCP must never receive a healthy receipt');

function staleCwdRunner(command, args) {
  const result = healthyRunner(command, args);
  if (args.join(' ') === 'config get terminal.cwd') {
    return { code: 0, stdout: '/stale/repository\n', stderr: '' };
  }
  return result;
}
const staleCwd = heal({
  hermes: '/fake/hermes',
  wrapper,
  repo: tmp,
  repair: false,
  writeReceipt: false,
  runner: staleCwdRunner,
});
assert.strictEqual(staleCwd.healthy, false, 'a globally pinned project must fail launch-context health');

const fleetInstaller = fs.readFileSync(path.join(repoRoot, 'scripts', 'install-grok-yolo.sh'), 'utf8');
assert.match(fleetInstaller, /tools\/hermes-capability-heal\.js/);
assert.match(fleetInstaller, /heal_local_capabilities/);
assert.match(fleetInstaller, /heal_remote_capabilities/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes capability healer tests: PASS');
