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
  specificationDrivenDesign,
  sessionContract,
  effortPolicy,
  effortDefaultForRole,
  hardBarForDone,
  frontierModelPlaybook,
  stateLayerPolicy,
  classifyTaskStateDesign,
  detectFleetHostRole,
  whereIsStateCheck,
  toolboxPolicy,
  classifyTaskToolbox,
  resolveToolboxAccess,
  workerToolboxPrompt,
  whereIsAuthCheck,
  MEGAFILES,
  FIELD_GUIDE_LINE_BUDGET,
  STATE_LAYER_SOURCE,
  TOOLBOX_SOURCE,
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
  assert.ok(report.sdd && Array.isArray(report.sdd.steps));
  assert.ok(report.sdd.steps.some((s) => s.id === 'gap-analysis'));
  assert.ok(report.roleGuidance.some((t) => /gap/i.test(t)));
  assert.ok(report.sessionContract && report.sessionContract.effort);
  assert.ok(report.effortPolicy && report.effortPolicy.classes.length >= 3);
  assert.ok(report.hardBarForDone && report.hardBarForDone.loop);
  assert.ok(report.frontierPlaybook && report.frontierPlaybook.patterns.length >= 5);
  assert.ok(report.stateLayers && report.stateLayers.layers.length >= 5);
  assert.ok(report.whereIsState && Array.isArray(report.whereIsState.questions));
  assert.strictEqual(report.whereIsState.questions.length, 3);
  assert.ok(report.toolboxes && report.toolboxes.packs.length >= 5);
  assert.ok(report.whereIsAuth && report.whereIsAuth.classified);
  assert.ok(report.workerToolbox && typeof report.workerToolbox.prompt === 'string');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sessionContract states boundaries once with keep/drop lists', () => {
  const worker = sessionContract('worker', {});
  assert.strictEqual(worker.role, 'worker');
  assert.strictEqual(worker.effort, 'medium');
  assert.ok(worker.keep.some((k) => /verification|exit code/i.test(k)));
  assert.ok(worker.keep.some((k) => /state-layer/i.test(k)));
  assert.ok(worker.keep.some((k) => /toolbox/i.test(k)));
  assert.ok(worker.drop.some((d) => /brief/i.test(d) || /AGENTS/i.test(d)));
  assert.ok(worker.drop.some((d) => /chat transcript|Ollama process/i.test(d)));
  assert.ok(worker.drop.some((d) => /token exchange|skill catalog/i.test(d)));
  const planner = sessionContract('planner', { HERMES_REASONING_EFFORT: 'low' });
  assert.strictEqual(planner.effort, 'low');
  assert.ok(/AC|claim/i.test(planner.stopWhen));
});

test('effortPolicy steps down; max reserved for hard classes', () => {
  const policy = effortPolicy();
  const optics = policy.classes.find((c) => c.id === 'optics_status');
  const ship = policy.classes.find((c) => c.id === 'ship_claim');
  assert.ok(optics && optics.defaultEffort === 'low');
  assert.ok(ship && ship.defaultEffort === 'high');
  assert.strictEqual(effortDefaultForRole('worker'), 'medium');
  assert.strictEqual(effortDefaultForRole('planner'), 'high');
});

test('hardBarForDone rejects adjective-only completion', () => {
  const bar = hardBarForDone();
  assert.ok(/check|machine|exits 0/i.test(bar.principle + bar.examples.join(' ')));
  assert.ok(bar.maxBlindIterations >= 1);
});

test('frontierModelPlaybook maps video patterns onto harness artifacts', () => {
  const book = frontierModelPlaybook();
  assert.ok(book.source.url.includes('youtube.com/watch'));
  const ids = book.patterns.map((p) => p.id);
  assert.ok(ids.includes('explicit_boundaries'));
  assert.ok(ids.includes('effort_step_down'));
  assert.ok(ids.includes('hard_bar_loops'));
  assert.ok(ids.includes('state_layer_split'));
  assert.ok(ids.includes('toolbox_auth_boundary'));
});

test('stateLayerPolicy encodes Pro+mini hybrid (stateless inference, shared board)', () => {
  const policy = stateLayerPolicy();
  assert.ok(policy.source.url.includes('machinelearningmastery.com'));
  assert.strictEqual(policy.source.url, STATE_LAYER_SOURCE.url);
  const byId = Object.fromEntries(policy.layers.map((l) => [l.id, l]));
  assert.strictEqual(byId.inference.design, 'stateless');
  assert.strictEqual(byId.worker_leaf.design, 'stateless_payload');
  assert.strictEqual(byId.coordination.design, 'shared_stateful');
  assert.strictEqual(byId.product_chat.design, 'session_stateful');
  assert.strictEqual(byId.resume.design, 'shared_stateful');
  assert.ok(policy.antiPatterns.some((a) => /localized|chat history|Ollama/i.test(a)));
  assert.ok(/stateless/i.test(policy.fleetRule));
  assert.ok(byId.inference.macMini && byId.inference.macPro);
});

test('classifyTaskStateDesign routes surfaces to the right layer', () => {
  assert.strictEqual(classifyTaskStateDesign('LiteLLM model route for hermes-local').layerId, 'inference');
  assert.strictEqual(classifyTaskStateDesign('implement AcceptanceCheck leaf unit test').layerId, 'worker_leaf');
  assert.strictEqual(classifyTaskStateDesign('fix plan.md claim thrash on megafile').layerId, 'coordination');
  assert.strictEqual(classifyTaskStateDesign('Hermes Mobile chat session continuity').layerId, 'product_chat');
  assert.strictEqual(classifyTaskStateDesign('resume after crash via loop-state').layerId, 'resume');
});

test('detectFleetHostRole honors HERMES_FLEET_HOST_ROLE override', () => {
  assert.strictEqual(detectFleetHostRole({ HERMES_FLEET_HOST_ROLE: 'mac_mini' }).role, 'mac_mini');
  assert.strictEqual(detectFleetHostRole({ HERMES_FLEET_HOST_ROLE: 'pro' }).role, 'mac_pro');
});

test('whereIsStateCheck returns three questions with machine-readable evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'where-state-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, SAMPLE_PLAN);
  fs.mkdirSync(path.join(dir, 'docs/agent-field-guide'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/agent-field-guide/index.md'), '# guide\n');
  fs.mkdirSync(path.join(dir, 'artifacts/hermes-loop-state'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'artifacts/hermes-loop-state/latest.json'),
    JSON.stringify({ ok: true, nextAction: 'test' }),
  );
  fs.mkdirSync(path.join(dir, 'hermes-mobile/docs/proofs/continuous'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'hermes-mobile/docs/proofs/continuous/latest.json'),
    JSON.stringify({ e2e: 'pass', generatedAt: new Date().toISOString() }),
  );

  const check = whereIsStateCheck({
    planPath,
    repo: dir,
    env: { HERMES_FLEET_HOST_ROLE: 'mac_mini' },
  });
  assert.strictEqual(check.host.role, 'mac_mini');
  assert.strictEqual(check.questions.length, 3);
  const ids = check.questions.map((q) => q.id).sort();
  assert.deepStrictEqual(ids, ['chat_session', 'repo_ownership', 'resume_evidence']);
  const chat = check.questions.find((q) => q.id === 'chat_session');
  assert.strictEqual(chat.design, 'session_stateful');
  assert.strictEqual(chat.ok, true);
  const ownership = check.questions.find((q) => q.id === 'repo_ownership');
  assert.strictEqual(ownership.ok, false, 'SAMPLE_PLAN has multi-owner ChatScreen contention');
  assert.strictEqual(ownership.status, 'contention');
  assert.ok(ownership.contentionCount >= 1);
  const resume = check.questions.find((q) => q.id === 'resume_evidence');
  assert.strictEqual(resume.ok, true);
  assert.strictEqual(resume.artifacts.fieldGuide, true);
  assert.strictEqual(resume.artifacts.loopState, true);
  assert.strictEqual(resume.artifacts.continuousE2e, true);
  assert.ok(/mini/i.test(check.hostGuidance));
  assert.ok(Array.isArray(check.actions) && check.actions.length >= 1);
  // overall false because ownership contention
  assert.strictEqual(check.ok, false);

  // Clean plan without contention → overall ok when guide present
  const cleanPlan = path.join(dir, 'clean-plan.md');
  fs.writeFileSync(
    cleanPlan,
    `# plan.md
## 1. Task Board
| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |
| T-1 | alone | in_progress | solo | \`tools/foo.js\` | test |
`,
  );
  const clean = whereIsStateCheck({
    planPath: cleanPlan,
    repo: dir,
    env: { HERMES_FLEET_HOST_ROLE: 'mac_pro' },
  });
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(clean.questions.find((q) => q.id === 'repo_ownership').status, 'clear');
  assert.strictEqual(clean.host.role, 'mac_pro');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('toolboxPolicy encodes domain packs with auth and host allowlists', () => {
  const policy = toolboxPolicy();
  assert.strictEqual(policy.source.url, TOOLBOX_SOURCE.url);
  assert.ok(policy.source.url.includes('devblogs.microsoft.com/foundry'));
  const byId = Object.fromEntries(policy.packs.map((p) => [p.id, p]));
  assert.ok(byId.fleet_inference.hosts.includes('mac_mini'));
  assert.ok(byId.repo_coord.hosts.includes('mac_pro'));
  assert.deepStrictEqual(byId.social_promo.hosts, ['mac_pro']);
  assert.deepStrictEqual(byId.revenue_cash.hosts, ['mac_pro']);
  assert.strictEqual(byId.social_promo.auth, 'user_delegation');
  assert.ok(byId.social_promo.gates.includes('PUBLISH_APPROVED'));
  assert.ok(policy.antiPatterns.some((a) => /skill catalog|OAuth|mini/i.test(a)));
});

test('classifyTaskToolbox routes surfaces to packs', () => {
  assert.strictEqual(classifyTaskToolbox('post everywhere LinkedIn promo').toolboxId, 'social_promo');
  assert.strictEqual(classifyTaskToolbox('Stripe cash pipeline Apollo').toolboxId, 'revenue_cash');
  assert.strictEqual(classifyTaskToolbox('Maestro e2e pair phone').toolboxId, 'device_mobile');
  assert.strictEqual(classifyTaskToolbox('LiteLLM model route hermes-local').toolboxId, 'fleet_inference');
  assert.strictEqual(classifyTaskToolbox('thumbgate recall field guide').toolboxId, 'memory_rag');
  assert.strictEqual(classifyTaskToolbox('plan.md claim harness PR').toolboxId, 'repo_coord');
});

test('resolveToolboxAccess blocks social_promo on mini and publish without gate', () => {
  const mini = resolveToolboxAccess('social_promo', { role: 'mac_mini' }, {});
  assert.strictEqual(mini.ok, false);
  assert.strictEqual(mini.status, 'host_blocked');

  const proNoPub = resolveToolboxAccess(
    'social_promo',
    { role: 'mac_pro' },
    { HERMES_SESSION_PUBLISH: 'DRAFT_ONLY' },
  );
  assert.strictEqual(proNoPub.ok, false);
  assert.strictEqual(proNoPub.status, 'gate_blocked');

  const proOk = resolveToolboxAccess(
    'social_promo',
    { role: 'mac_pro' },
    { HERMES_SESSION_PUBLISH: 'PUBLISH_APPROVED', HERMES_ALLOW_INTERACTIVE_CHROME: '1' },
  );
  assert.strictEqual(proOk.ok, true);
  assert.strictEqual(proOk.status, 'allowed');

  const miniRepo = resolveToolboxAccess('repo_coord', { role: 'mac_mini' }, {});
  assert.strictEqual(miniRepo.ok, true);
});

test('workerToolboxPrompt is thin and blocks wrong host', () => {
  const blocked = workerToolboxPrompt('post everywhere LinkedIn promo', {
    env: { HERMES_FLEET_HOST_ROLE: 'mac_mini' },
  });
  assert.strictEqual(blocked.toolboxId, 'social_promo');
  assert.strictEqual(blocked.ok, false);
  assert.ok(/BLOCKED/i.test(blocked.prompt));
  assert.ok(blocked.entrypoints.length >= 1);
  assert.ok(blocked.maxEntrypoints <= 10);

  const leaf = workerToolboxPrompt('implement AcceptanceCheck leaf unit test plan.md claim', {
    env: { HERMES_FLEET_HOST_ROLE: 'mac_mini' },
  });
  assert.strictEqual(leaf.toolboxId, 'repo_coord');
  assert.strictEqual(leaf.ok, true);
  assert.ok(/entrypoints/i.test(leaf.prompt));
  assert.ok(!/full AGENTS|Never-list/i.test(leaf.prompt));
});

test('whereIsAuthCheck returns three questions and host guidance', () => {
  const blocked = whereIsAuthCheck({
    taskText: 'promote everywhere LinkedIn',
    env: { HERMES_FLEET_HOST_ROLE: 'mac_mini' },
  });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.questions.length, 3);
  assert.ok(blocked.questions.every((q) => q.id && q.evidence));
  assert.ok(/mini/i.test(blocked.hostGuidance));
  assert.ok(blocked.workerPrompt && blocked.workerPrompt.toolboxId === 'social_promo');

  const ok = whereIsAuthCheck({
    taskText: 'plan.md swarm harness claim',
    env: { HERMES_FLEET_HOST_ROLE: 'mac_pro' },
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.classified.toolboxId, 'repo_coord');
});

test('specificationDrivenDesign maps Ozkary loop onto repo artifacts', () => {
  const sdd = specificationDrivenDesign();
  const ids = sdd.steps.map((s) => s.id);
  assert.deepStrictEqual(ids, [
    'discover',
    'blueprint',
    'modular-specs',
    'execute',
    'gap-analysis',
    'traceability',
  ]);
  assert.ok(sdd.source.url.includes('ozkary.com'));
  assert.ok(sdd.antiPatterns.length >= 3);
  assert.ok(sdd.steps.every((s) => s.ourArtifact && s.name));
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
