'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyGoalCell,
  buildGoalCell,
  goalCellMarkdown,
  parseArgs,
} = require('../tools/hermes-goal-cells');

assert.strictEqual(parseArgs(['--template', 'money', '--apply']).template, 'money');
assert.throws(() => parseArgs(['--max-actions', '6']), /--max-actions must be an integer from 1 to 5/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-goal-cells-'));
const hermesHome = path.join(tmp, 'hermes');
fs.mkdirSync(path.join(hermesHome, 'source-packs'), { recursive: true });
fs.writeFileSync(path.join(hermesHome, 'source-packs', 'index.json'), JSON.stringify({
  checkedAt: '2026-06-24T00:00:00Z',
  packs: [
    { key: 'money-offer-pack', combinedSourceHash: 'moneyhash' },
    { key: 'reliability-diagnostic-pack', combinedSourceHash: 'diaghsh' },
    { key: 'hermes-runtime-pack', combinedSourceHash: 'runtimehash' },
    { key: 'content-repurposing-pack', combinedSourceHash: 'contenthash' },
  ],
}, null, 2));

const money = buildGoalCell({
  hermesHome,
  objective: 'Make money today with one diagnostic payment ask',
  maxActions: 5,
});
assert.strictEqual(money.sourcePackKey, 'money-offer-pack');
assert.strictEqual(money.sourcePackFound, true);
assert.ok(money.teamSize >= 1 && money.teamSize <= 10);
assert.ok(money.executableActions.length <= 5);
assert.ok(money.roles.some((role) => role.key === 'verifier'));
assert.match(money.externalActionBoundary.rule, /ThumbGate|approval/);

const runtime = buildGoalCell({
  hermesHome,
  objective: 'Fix Hermes CLI gateway provider launchd state',
});
assert.strictEqual(runtime.sourcePackKey, 'hermes-runtime-pack');
assert.match(runtime.truthSource, /launchctl/);
assert.ok(goalCellMarkdown(runtime).includes('Hermes Goal Cell'));

const custom = buildGoalCell({
  hermesHome,
  objective: 'Repurpose one source-backed LinkedIn post',
  roles: ['router', 'researcher'],
  maxActions: 2,
});
assert.strictEqual(custom.teamSize, 2);
assert.strictEqual(custom.executableActions.length, 2);

const actions = applyGoalCell(money, hermesHome);
assert.ok(actions.some((action) => action.includes('current.json')));
assert.ok(fs.existsSync(path.join(hermesHome, 'goal-cells', 'current.json')));
assert.ok(fs.existsSync(path.join(hermesHome, 'goal-cells', 'current.md')));
assert.match(
  fs.readFileSync(path.join(hermesHome, 'memories', 'MEMORY.md'), 'utf8'),
  /Hermes Goal Cell protocol is active/,
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes goal cells tests: PASS');
