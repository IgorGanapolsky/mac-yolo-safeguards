#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildLoopState,
  parsePlanTasks,
  renderMarkdown,
  writeArtifacts,
} = require('../tools/hermes-loop-state');

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

function makeRepo({ planText, latestProof }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-loop-state-'));
  fs.writeFileSync(path.join(repo, 'plan.md'), planText);
  const proofDir = path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous');
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, 'latest.json'), `${JSON.stringify(latestProof, null, 2)}\n`);
  return repo;
}

const PLAN = [
  '# plan',
  '',
  '| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |',
  '|-----|------|--------|-------|---------------|-----------------|',
  '| T-54 | Keep Chat foregrounded | in_progress | codex | `src/screens/ChatScreen.tsx` | focused Jest, typecheck, continuous proof |',
  '| T-55 | Loop state gate | pending | codex | `tools/hermes-loop-state.js` | tests pass |',
  '',
].join('\n');

test('parses plan task rows into stable task records', () => {
  const tasks = parsePlanTasks(PLAN);
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].id, 'T-54');
  assert.strictEqual(tasks[0].status, 'in_progress');
  assert.strictEqual(tasks[1].acceptanceCheck, 'tests pass');
});

test('failed continuous E2E blocks merge and emits a verifier next action', () => {
  const repo = makeRepo({
    planText: PLAN,
    latestProof: {
      updatedAt: '2026-07-01T19:11:44Z',
      unit: 'pass',
      e2e: 'fail',
      detail: 'one or more Maestro flows failed',
      flows: ['.maestro/ship-guard.yaml'],
    },
  });
  const state = buildLoopState({
    repo,
    now: '2026-07-01T20:00:00.000Z',
    gitStatusLines: [' M hermes-mobile/src/screens/ChatScreen.tsx'],
  });
  assert.strictEqual(state.readyToMergeOrPublish, false);
  assert(state.gates.some((gate) => gate.key === 'continuous_e2e' && gate.status === 'fail'));
  assert.strictEqual(state.nextActions[0].key, 'resolve_continuous_e2e_failure');
  assert(state.nextActions.some((action) => action.key === 'finish_or_block_active_tasks'));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('clean green proof can mark the loop ready for next bounded task', () => {
  const repo = makeRepo({
    planText: PLAN.replace('in_progress', 'done').replace('pending', 'done'),
    latestProof: {
      updatedAt: '2026-07-01T20:15:00Z',
      unit: 'pass',
      e2e: 'pass',
      detail: 'all flows passed',
      flows: ['.maestro/ship-guard.yaml'],
    },
  });
  const state = buildLoopState({
    repo,
    now: '2026-07-01T20:20:00.000Z',
    gitStatusLines: [],
  });
  assert.strictEqual(state.readyToMergeOrPublish, true);
  assert.strictEqual(state.nextActions[0].key, 'open_next_small_task');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('writes resumable JSON and Markdown artifacts', () => {
  const repo = makeRepo({
    planText: PLAN,
    latestProof: {
      updatedAt: '2026-07-01T20:30:00Z',
      unit: 'pass',
      e2e: 'fail',
      detail: 'chat-composer-dock not visible',
    },
  });
  const state = buildLoopState({
    repo,
    now: '2026-07-01T20:31:00.000Z',
    gitStatusLines: ['?? tools/hermes-loop-state.js'],
  });
  const outDir = path.join(repo, 'artifacts', 'loop');
  const artifacts = writeArtifacts(state, outDir);
  assert(fs.existsSync(artifacts.jsonPath));
  assert(fs.existsSync(artifacts.mdPath));
  const md = renderMarkdown(state);
  assert(md.includes('Ready to merge/publish: no'));
  assert(md.includes('resolve_continuous_e2e_failure'));
  fs.rmSync(repo, { recursive: true, force: true });
});
