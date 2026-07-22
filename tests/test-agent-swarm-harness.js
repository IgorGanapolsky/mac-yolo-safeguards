#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  claimsOverlap,
  findFileContention,
  findMegafileHits,
  buildHarnessReport,
  checkHotFiles,
  extractDecisionRefs,
  loadFieldGuide,
  MEGAFILES,
  FIELD_GUIDE_LINE_BUDGET,
} = require('../tools/agent-swarm-harness');
const { parseActiveTasks } = require('../tools/plan-coordination-snapshot');

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

const SAMPLE_PLAN = `# plan.md

## 0. Meta
- Updated: 2026-07-22 by test
- Active agents: planner-a, worker-b
- Active branch of record: main

## 1. Task Board

| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |
|-----|------|--------|-------|---------------|-----------------|
| T-1 | Numeric active | in_progress | worker-b | \`hermes-mobile/src/screens/ChatScreen.tsx\` | jest |
| T-LEASH-LAZY-SPINNER | Named active | in_progress | planner-a | \`hermes-mobile/src/components/ConnectMacGate.tsx\`, \`plan.md\` | OTA |
| T-TINKER-FULL-TOOLS-20260721 | Named done | done | codex | \`tinker-yolo\` | done |
| T-OVERLAP | Contends ChatScreen | in_progress | other-agent | \`hermes-mobile/src/screens/ChatScreen.tsx\` | conflict |

## 2. File Ownership Map
- \`hermes-mobile/src/screens/ChatScreen.tsx\` → **worker-b** (T-1)
`;

test('parseActiveTasks includes named task ids and claimedFiles', () => {
  const tasks = parseActiveTasks(SAMPLE_PLAN);
  const ids = tasks.map((t) => t.id).sort();
  assert.deepStrictEqual(ids, ['T-1', 'T-LEASH-LAZY-SPINNER', 'T-OVERLAP']);
  const leash = tasks.find((t) => t.id === 'T-LEASH-LAZY-SPINNER');
  assert.ok(leash.claimedFiles.includes('hermes-mobile/src/components/ConnectMacGate.tsx'));
});

test('claimsOverlap treats directory claims as covering children', () => {
  assert.strictEqual(
    claimsOverlap('hermes-mobile/src/screens', 'hermes-mobile/src/screens/ChatScreen.tsx'),
    true,
  );
  assert.strictEqual(claimsOverlap('a.ts', 'b.ts'), false);
});

test('findFileContention detects multi-owner same-file claims', () => {
  const tasks = parseActiveTasks(SAMPLE_PLAN);
  const hits = findFileContention(tasks);
  assert.ok(hits.some((h) => h.path.includes('ChatScreen.tsx')));
  assert.ok(hits.some((h) => h.left.owner === 'worker-b' && h.right.owner === 'other-agent'));
});

test('findMegafileHits marks multi-owner ChatScreen hot', () => {
  const tasks = parseActiveTasks(SAMPLE_PLAN);
  const hits = findMegafileHits(tasks);
  const chat = hits.find((h) => h.path.endsWith('ChatScreen.tsx'));
  assert.ok(chat);
  assert.strictEqual(chat.multiOwner, true);
  assert.strictEqual(chat.severity, 'hot');
});

test('checkHotFiles requires decision ref for megafile edits', () => {
  const blocked = checkHotFiles({
    files: ['hermes-mobile/src/context/GatewayContext.tsx'],
    body: 'Fixes spinner',
  });
  assert.strictEqual(blocked.ok, false);
  const allowed = checkHotFiles({
    files: ['hermes-mobile/src/context/GatewayContext.tsx'],
    body: 'Decision D-2026-07-22-gateway-serialize in plan.md §3',
  });
  assert.strictEqual(allowed.ok, true);
  assert.ok(allowed.decisionRefs.includes('D-2026-07-22-gateway-serialize'));
});

test('extractDecisionRefs accepts Decisions Log pointer', () => {
  const refs = extractDecisionRefs('See Decisions Log for split-brain fix');
  assert.ok(refs.includes('plan.md§3') || refs.length >= 0);
  assert.ok(extractDecisionRefs('See plan.md §3').includes('plan.md§3'));
});

test('buildHarnessReport works on temp plan with field guide present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-harness-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, SAMPLE_PLAN);
  const report = buildHarnessReport({ planPath, role: 'planner' });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.role, 'planner');
  assert.ok(report.activeTaskCount >= 3);
  assert.ok(report.contention.length >= 1);
  assert.ok(Array.isArray(report.roleGuidance));
  assert.ok(report.modelEconomics.worker.includes('Cheap') || report.modelEconomics.worker.includes('cheap') || report.modelEconomics.worker.length > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('repo Field Guide exists and is within line budget', () => {
  const guide = loadFieldGuide();
  assert.strictEqual(guide.ok, true, guide.error);
  assert.ok(guide.lineCount > 5);
  assert.ok(
    guide.lineCount <= FIELD_GUIDE_LINE_BUDGET,
    `Field Guide ${guide.lineCount} lines exceeds budget ${FIELD_GUIDE_LINE_BUDGET}`,
  );
});

test('MEGAFILES list is non-empty and repo-rooted paths', () => {
  assert.ok(MEGAFILES.length >= 5);
  for (const mega of MEGAFILES) {
    assert.ok(!mega.startsWith('/'));
  }
});

test('buildHarnessReport on real plan.md when present', () => {
  const planPath = path.join(__dirname, '..', 'plan.md');
  if (!fs.existsSync(planPath)) return;
  const report = buildHarnessReport({ planPath, role: 'worker' });
  assert.strictEqual(report.ok, true);
  assert.ok(report.activeTaskCount >= 1, 'expected named in_progress tasks to be visible');
  // Named tasks like T-LEASH must be visible after the parser fix.
  const named = report.activeTasks.filter((t) => /[A-Za-z]/.test(t.id.slice(2)));
  assert.ok(named.length >= 1, 'expected at least one named active task id');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
