#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/agent-confusion-gate.js');
const {
  SOURCE,
  ambiguousContext,
  conflictingData,
  unclearBoundary,
  ownersIn,
  measure,
} = require(tool);

const TWEET = 'improve our system: https://x.com/sarbjeetjohal/status/2115073742321713223?shem=aimgspe,';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

check('source cites the TechXchange post and the reply', () => {
  assert.equal(SOURCE.post, '2115073742321713223');
  assert.equal(SOURCE.reply, '2115165243458609579');
});

check('safe instruction, one owner, and a harmless command proceed', () => {
  const result = measure({
    instruction: 'edit tools/agent-confusion-gate.js',
    path: 'tools/agent-confusion-gate.js',
    actor: 'grok',
    claims: [{ path: 'tools/agent-confusion-gate.js', owner: 'grok' }],
    command: 'git status',
    records: [{ key: 'head', source: 'git', value: 'cbb6d19c' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.confusionScore, 0);
  assert.equal(result.decision, 'proceed');
  assert.deepEqual(result.axes.map((axis) => axis.fired), [false, false, false]);
});

check('empty instruction holds on ambiguous context only', () => {
  const result = measure({ instruction: '   ' });
  assert.equal(result.confusionScore, 1);
  assert.equal(result.decision, 'hold');
  assert.equal(result.axes[0].fired, true);
  assert.equal(result.axes[0].evidence, 'empty instruction');
  assert.equal(ambiguousContext(null).fired, true);
  assert.equal(ambiguousContext(undefined).fired, true);
});

check('fix it holds until the text names a target', () => {
  assert.equal(measure({ instruction: 'fix it' }).confusionScore, 1);
  assert.equal(ambiguousContext('please fix it').fired, true);
  assert.equal(ambiguousContext('optimize everything').fired, true);
  assert.equal(ambiguousContext('clean the project.').fired, true);
  assert.equal(ambiguousContext('improve our system').fired, true);
  assert.equal(ambiguousContext('fix it in tools/foo.js').fired, false);
  assert.equal(ambiguousContext('update the project #1889').fired, false);
  assert.equal(ambiguousContext('improve the system AGENT-12').fired, false);
});

check('the tweet prompt is a concrete source and does not hold', () => {
  const result = measure({ instruction: TWEET, command: 'git diff' });
  assert.equal(result.axes[0].fired, false);
  assert.equal(result.confusionScore, 0);
  assert.equal(result.decision, 'proceed');
});

check('two values for one key hold', () => {
  const disagree = conflictingData([
    { key: 'status', source: 'github', value: 'open' },
    { key: 'status', source: 'linear', value: 'closed' },
  ]);
  assert.equal(disagree.fired, true);
  assert.match(disagree.evidence, /status/);
  assert.equal(conflictingData([
    { key: 'status', source: 'github', value: 'open' },
    { key: 'status', source: 'linear', value: ' open ' },
  ]).fired, false);
  assert.equal(conflictingData([
    { key: 'count', source: 'a', value: 1 },
    { key: 'count', source: 'b', value: '1' },
  ]).fired, false);
  assert.equal(measure({
    instruction: 'edit tools/foo.js',
    records: [
      { key: 'status', source: 'a', value: 'open' },
      { key: 'status', source: 'b', value: 'closed' },
    ],
  }).confusionScore, 1);
});

check('two plan owners of one file are a data conflict', () => {
  const plan = [
    '## Alpha (append 2026-10-29T00:00:00Z) — `alpha`',
    '- `tools/foo.js`',
    '- `plan.md` (this append)',
    '- `tools/bar.js` — alpha',
    '## Beta (append 2026-10-29T00:00:01Z) — `beta`',
    '- `tools/foo.js`',
    '| T-A | title | in_progress | alpha | `tools/baz.js` | ac |',
    '| T-B | title | in_progress | beta | `tools/baz.js`, `tools/qux.js` | ac |',
    '| Task | title | status | Owner | Files | ac |',
  ].join('\n');
  const records = ownersIn(plan, 'plan.md');
  const keys = records.map((record) => `${record.key}=${record.value}`);
  assert.deepEqual(keys.sort(), [
    'tools/bar.js=alpha',
    'tools/baz.js=alpha',
    'tools/baz.js=beta',
    'tools/foo.js=alpha',
    'tools/foo.js=beta',
    'tools/qux.js=beta',
  ]);
  const result = measure({
    instruction: 'edit tools/foo.js',
    planText: plan,
    command: 'git diff',
    path: 'tools/foo.js',
    actor: 'alpha',
    claims: [{ path: 'tools/foo.js', owner: 'alpha' }],
  });
  assert.equal(result.axes[0].fired, false);
  assert.equal(result.axes[1].fired, true);
  assert.equal(result.axes[2].fired, false);
  assert.equal(result.confusionScore, 1);
});

check('denied commands hold and ordinary ship commands do not', () => {
  assert.equal(unclearBoundary({ command: 'git push --force' }).fired, true);
  assert.equal(unclearBoundary({ command: 'git push origin main -f' }).fired, true);
  assert.equal(unclearBoundary({ command: 'git push --force-with-lease' }).fired, false);
  assert.equal(unclearBoundary({ command: 'git push -u origin HEAD:agent/agent-confusion-gate-20261029' }).fired, false);
  assert.equal(unclearBoundary({ command: 'gh pr merge 2212 --admin' }).fired, true);
  assert.equal(unclearBoundary({ command: 'gh pr merge 2212 --squash --auto' }).fired, false);
  assert.equal(unclearBoundary({ command: 'git reflog' }).fired, true);
  assert.equal(unclearBoundary({ command: 'git log --all --grep=secret' }).fired, true);
  assert.equal(unclearBoundary({ command: 'git log --grep=secret --all' }).fired, true);
  assert.equal(unclearBoundary({ command: 'git log --grep=secret' }).fired, false);
  assert.equal(unclearBoundary({ command: 'git log --all' }).fired, false);
  assert.equal(measure({
    instruction: 'edit tools/foo.js',
    command: 'git push --force',
  }).confusionScore, 1);
});

check('another agents claim holds', () => {
  const result = measure({
    instruction: 'edit tools/foo.js',
    path: 'tools/foo.js',
    actor: 'grok',
    claims: [{ path: 'tools\\foo.js', owner: 'codex' }],
    command: 'git status',
  });
  assert.equal(result.confusionScore, 1);
  assert.equal(result.axes[2].fired, true);
  assert.match(result.axes[2].evidence, /owner mismatch on tools\/foo.js/);
  assert.equal(unclearBoundary({
    path: 'tools/foo.js',
    actor: 'grok',
    claims: [{ key: 'tools/foo.js', value: 'grok' }],
  }).fired, false);
});

check('all three axes score three', () => {
  const result = measure({
    instruction: 'fix it',
    records: [
      { key: 'status', source: 'a', value: 'open' },
      { key: 'status', source: 'b', value: 'closed' },
    ],
    command: 'git push --force',
    path: 'tools/x.js',
    actor: 'grok',
    claims: [{ path: 'tools/x.js', owner: 'other' }],
  });
  assert.equal(result.confusionScore, 3);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(result.axes.map((axis) => axis.id), [
    'ambiguous_context',
    'conflicting_data',
    'unclear_tool_boundary',
  ]);
});

check('the module does not spawn a process or call a model', () => {
  const src = fs.readFileSync(tool, 'utf8');
  assert.equal(src.includes('child_process'), false);
  assert.equal(src.includes('execSync'), false);
  assert.equal(src.includes('execFile'), false);
  assert.equal(src.includes('fetch('), false);
});

check('cli exits 0 to proceed and 1 to hold', () => {
  const hold = spawnSync(process.execPath, [tool, '--instruction', 'fix it'], { encoding: 'utf8' });
  assert.equal(hold.status, 1);
  assert.equal(JSON.parse(hold.stdout).decision, 'hold');

  const proceed = spawnSync(process.execPath, [
    tool,
    '--instruction',
    TWEET,
    '--command',
    'git diff',
  ], { encoding: 'utf8' });
  assert.equal(proceed.status, 0, proceed.stderr);
  assert.equal(JSON.parse(proceed.stdout).confusionScore, 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confusion-gate-'));
  const jsonPath = path.join(dir, 'action.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    instruction: 'edit tools/foo.js',
    command: 'gh pr merge 1 --admin',
  }));
  const fromFile = spawnSync(process.execPath, [tool, '--json', jsonPath], { encoding: 'utf8' });
  assert.equal(fromFile.status, 1);
  assert.equal(JSON.parse(fromFile.stdout).axes[2].fired, true);

  const bad = spawnSync(process.execPath, [tool, '--nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`agent-confusion-gate: ${passed} checks passed`);
