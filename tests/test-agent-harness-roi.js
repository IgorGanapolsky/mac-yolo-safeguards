#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  HARNESS_PROFILES,
  SKILL_PACKS,
  HARNESS_ROI_SOURCE,
  RELEASE_STATUS,
  harnessProfilePolicy,
  skillPackPolicy,
  classifyHarnessProfile,
  resolveHarnessProfile,
  resolveSkillPackAccess,
  listSkillPacks,
  claimHygieneReport,
  parseTaskIdDate,
  findStaleClaims,
  proposeClaimRelease,
  claimNewGate,
  runClaimHygiene,
  runEvalResearchLoop,
} = require('../tools/agent-harness-roi');

const { parseActiveTasks } = require('../tools/plan-coordination-snapshot');
const {
  findFileContention,
  findMegafileHits,
  workerToolboxPrompt,
  buildHarnessReport,
  claimHygieneReport: harnessClaimHygiene,
  resolveHarnessProfile: harnessResolveProfile,
} = require('../tools/agent-swarm-harness');

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

test('harnessProfilePolicy catalogues named profiles with model classes', () => {
  const policy = harnessProfilePolicy();
  assert.ok(policy.source.principle || policy.principle);
  assert.strictEqual(policy.source.url, HARNESS_ROI_SOURCE.url);
  assert.ok(policy.profiles.length >= 6);
  const ids = policy.profiles.map((p) => p.id);
  assert.ok(ids.includes('frontier_planner'));
  assert.ok(ids.includes('local_worker_leaf'));
  assert.ok(ids.includes('nemotron_worker'));
  assert.ok(ids.includes('eval_research_loop'));
  assert.ok(ids.includes('social_promo_pro'));
  assert.ok(ids.includes('revenue_cash_pro'));
  assert.ok(
    policy.profiles.every(
      (p) =>
        p.modelClass &&
        p.effort &&
        Array.isArray(p.toolboxAllow) &&
        Array.isArray(p.skillPacks) &&
        Array.isArray(p.evalBar) &&
        Array.isArray(p.hosts),
    ),
  );
});

test('classifyHarnessProfile routes task classes', () => {
  assert.strictEqual(
    classifyHarnessProfile('overnight eval research farm failures').profileId,
    'eval_research_loop',
  );
  assert.strictEqual(
    classifyHarnessProfile('post everywhere LinkedIn promo').profileId,
    'social_promo_pro',
  );
  assert.strictEqual(
    classifyHarnessProfile('Stripe cash pipeline Apollo').profileId,
    'revenue_cash_pro',
  );
  assert.strictEqual(
    classifyHarnessProfile('Maestro e2e pair phone Tailscale').profileId,
    'device_mobile',
  );
  assert.strictEqual(
    classifyHarnessProfile('Nemotron open weight cloud leaf').profileId,
    'nemotron_worker',
  );
  assert.strictEqual(
    classifyHarnessProfile('implement unit test leaf', { role: 'worker' }).profileId,
    'local_worker_leaf',
  );
  assert.strictEqual(
    classifyHarnessProfile('decompose AcceptanceCheck blueprint', { role: 'planner' }).profileId,
    'frontier_planner',
  );
});

test('resolveHarnessProfile never hard-blocks on host (advisory host_note only)', () => {
  const miniSocial = resolveHarnessProfile('post everywhere LinkedIn', {
    role: 'worker',
    host: { role: 'mac_mini' },
  });
  assert.strictEqual(miniSocial.profileId, 'social_promo_pro');
  assert.strictEqual(miniSocial.ok, true);
  assert.strictEqual(miniSocial.status, 'host_note');

  const miniRevenue = resolveHarnessProfile('Stripe cash outreach', {
    host: { role: 'mac_mini' },
  });
  assert.strictEqual(miniRevenue.ok, true);

  const miniWorker = resolveHarnessProfile('implement AcceptanceCheck leaf', {
    host: { role: 'mac_mini' },
  });
  assert.strictEqual(miniWorker.ok, true);
  assert.strictEqual(miniWorker.profileId, 'local_worker_leaf');
  assert.ok(miniWorker.prompt.includes('harness_profile:'));
  assert.ok(miniWorker.skillPacks.length >= 1);

  const proSocial = resolveHarnessProfile('post everywhere LinkedIn', {
    host: { role: 'mac_pro' },
    env: { HERMES_SESSION_PUBLISH: 'PUBLISH_APPROVED' },
  });
  assert.strictEqual(proSocial.ok, true);
  assert.ok(proSocial.profile.hosts.includes('mac_pro'));
});

test('skill packs bind to toolboxes and host gates', () => {
  const policy = skillPackPolicy();
  assert.ok(policy.packs.length >= 5);
  assert.ok(policy.packs.every((p) => p.toolbox && p.entrypoints.length && p.hosts.length));

  const socialMini = resolveSkillPackAccess('social_live', { hostRole: 'mac_mini' });
  assert.strictEqual(socialMini.ok, false);
  assert.strictEqual(socialMini.status, 'host_blocked');

  const socialProNoGate = resolveSkillPackAccess('social_live', {
    hostRole: 'mac_pro',
    env: {},
  });
  assert.strictEqual(socialProNoGate.ok, false);
  assert.strictEqual(socialProNoGate.status, 'gate_blocked');

  const socialProOk = resolveSkillPackAccess('social_live', {
    hostRole: 'mac_pro',
    env: {
      HERMES_SESSION_PUBLISH: 'PUBLISH_APPROVED',
      HERMES_ALLOW_INTERACTIVE_CHROME: '1',
    },
  });
  assert.strictEqual(socialProOk.ok, true);

  const listed = listSkillPacks({ toolboxId: 'repo_coord' });
  assert.ok(listed.packs.every((p) => p.toolbox === 'repo_coord'));
  assert.ok(listed.packs.some((p) => p.id === 'coord_claim'));
});

test('claimHygieneReport compresses pairwise contention into path summaries', () => {
  const plan = `# plan.md
## 1. Task Board
| ID | Task | Status | Owner | Files (claim) | AcceptanceCheck |
| T-1 | a | in_progress | agent-a | \`hermes-mobile/src/screens/ChatScreen.tsx\` | x |
| T-2 | b | in_progress | agent-b | \`hermes-mobile/src/screens/ChatScreen.tsx\` | x |
| T-3 | c | in_progress | agent-c | \`tools/foo.js\` | x |
`;
  const tasks = parseActiveTasks(plan);
  const contention = findFileContention(tasks);
  const mega = findMegafileHits(tasks);
  const report = claimHygieneReport({
    activeTasks: tasks,
    contention,
    megafileHits: mega,
    concurrencyCap: 3,
  });
  assert.ok(report.pairHitCount >= 1);
  assert.ok(report.uniquePathCount >= 1);
  assert.ok(report.uniquePathCount <= report.pairHitCount || report.pairHitCount <= 2);
  const chat = report.pathSummaries.find((p) => p.path.includes('ChatScreen'));
  assert.ok(chat);
  assert.ok(chat.owners.includes('agent-a') && chat.owners.includes('agent-b'));
  assert.strictEqual(chat.megafile, true);
  assert.ok(report.hotMegafiles.length >= 1);
  assert.strictEqual(report.ok, false);
  assert.ok(report.actions.some((a) => /HOT|megafile|Contention/i.test(a)));
});

test('runEvalResearchLoop dry-run uses mineFn and never requires write', () => {
  const fakeMine = ({ write }) => ({
    ok: true,
    signalCount: 1,
    signals: [{ source: 'test', severity: 'high', text: 'GatewayContext multi-owner thrash' }],
    proposals: [
      {
        signal: { source: 'test', severity: 'high' },
        proposal: {
          stub: { id: 'ability-test', abilityId: 'megafile_claim_discipline' },
          writtenPath: write ? '/tmp/fake' : null,
        },
      },
    ],
  });
  const result = runEvalResearchLoop({
    mineFn: fakeMine,
    write: false,
    hostRole: 'mac_mini',
    maxProposals: 3,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.profile.profileId, 'eval_research_loop');
  assert.strictEqual(result.receipt.proposalCount, 1);
  assert.deepStrictEqual(result.written, []);
});

test('runEvalResearchLoop --write only materializes under artifacts/eval-research', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-research-'));
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  const { mineEvalFailures: realMine } = require('../tools/agent-swarm-harness');
  fs.writeFileSync(
    path.join(dir, 'plan.md'),
    `# plan.md
## 1. Task Board
| ID | Task | Status | Owner | Files | AC |
| T-1 | alone | in_progress | solo | \`tools/x.js\` | t |
`,
  );
  const result = runEvalResearchLoop({
    mineFn: realMine,
    write: true,
    repo: dir,
    planPath: path.join(dir, 'plan.md'),
    hostRole: 'mac_pro',
    maxProposals: 3,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.dryRun, false);
  assert.ok(result.written.some((w) => w.includes('artifacts/eval-research')));
  const latest = path.join(dir, 'artifacts/eval-research/latest.json');
  assert.ok(fs.existsSync(latest));
  const receipt = JSON.parse(fs.readFileSync(latest, 'utf8'));
  assert.strictEqual(receipt.noMegafile, true);
  assert.strictEqual(receipt.profileId, 'eval_research_loop');
  assert.ok(String(receipt.writeRoot || '').includes('artifacts/eval-research'));
  // Must not write into tracked evals/ from overnight loop
  assert.strictEqual(fs.readdirSync(path.join(dir, 'evals')).length, 0);
  for (const w of result.written) {
    assert.ok(
      w.includes(`${path.sep}artifacts${path.sep}eval-research${path.sep}`) ||
        w.includes('/artifacts/eval-research/'),
      `unexpected write path: ${w}`,
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workerToolboxPrompt includes harness_profile skill packs', () => {
  const leaf = workerToolboxPrompt('implement AcceptanceCheck leaf unit test plan.md', {
    env: { HERMES_FLEET_HOST_ROLE: 'mac_mini' },
  });
  assert.ok(leaf.harnessProfile);
  assert.strictEqual(leaf.harnessProfile.profileId, 'local_worker_leaf');
  assert.ok(/harness_profile:/i.test(leaf.prompt));
  assert.ok(/skill_packs/i.test(leaf.prompt));
});

test('buildHarnessReport includes claimHygiene and harnessProfile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roi-report-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(
    planPath,
    `# plan.md
## 1. Task Board
| ID | Task | Status | Owner | Files (claim) | AcceptanceCheck |
| T-1 | alone | in_progress | solo | \`tools/foo.js\` | test |
`,
  );
  fs.mkdirSync(path.join(dir, 'docs/agent-field-guide'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/agent-field-guide/index.md'), '# guide\n');
  const report = buildHarnessReport({ planPath, role: 'worker' });
  assert.strictEqual(report.ok, true);
  assert.ok(report.claimHygiene);
  assert.ok(typeof report.claimHygiene.pairHitCount === 'number');
  assert.ok(report.harnessProfile && report.harnessProfile.profileId);
  assert.ok(report.harnessProfiles && report.harnessProfiles.profiles.length >= 6);
  assert.ok(report.skillPacks && report.skillPacks.packs.length >= 5);
  // re-export parity
  assert.strictEqual(typeof harnessClaimHygiene, 'function');
  assert.strictEqual(typeof harnessResolveProfile, 'function');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HARNESS_PROFILES and SKILL_PACKS are frozen catalogs', () => {
  assert.ok(HARNESS_PROFILES.length >= 6);
  assert.ok(SKILL_PACKS.length >= 6);
  assert.throws(() => {
    HARNESS_PROFILES.push({ id: 'nope' });
  });
});

test('parseTaskIdDate extracts YYYYMMDD and dashed forms', () => {
  const a = parseTaskIdDate('T-FOO-20260723');
  assert.ok(a);
  assert.strictEqual(a.ymd, '2026-07-23');
  const b = parseTaskIdDate('T-FOO-2026-07-22');
  assert.ok(b);
  assert.strictEqual(b.ymd, '2026-07-22');
  assert.strictEqual(parseTaskIdDate('T-NO-DATE'), null);
});

test('findStaleClaims flags age, overload, and zombie megafile', () => {
  const now = new Date(Date.UTC(2026, 6, 28)); // 2026-07-28
  const tasks = [
    {
      id: 'T-OLD-20260720',
      status: 'in_progress',
      owner: 'agent-a',
      claimedFiles: ['hermes-mobile/src/screens/ChatScreen.tsx'],
      task: 'old work',
    },
    {
      id: 'T-FRESH-20260728',
      status: 'in_progress',
      owner: 'agent-a',
      claimedFiles: ['tools/foo.js'],
      task: 'fresh',
    },
    {
      id: 'T-EXTRA1-20260727',
      status: 'in_progress',
      owner: 'hog',
      claimedFiles: ['a.js'],
      task: '1',
    },
    {
      id: 'T-EXTRA2-20260727',
      status: 'in_progress',
      owner: 'hog',
      claimedFiles: ['b.js'],
      task: '2',
    },
    {
      id: 'T-EXTRA3-20260727',
      status: 'in_progress',
      owner: 'hog',
      claimedFiles: ['c.js'],
      task: '3',
    },
    {
      id: 'T-EXTRA4-20260726',
      status: 'in_progress',
      owner: 'hog',
      claimedFiles: ['d.js'],
      task: '4 overload',
    },
  ];
  const mega = [
    {
      path: 'hermes-mobile/src/screens/ChatScreen.tsx',
      multiOwner: true,
      claimants: [
        { id: 'T-OLD-20260720', owner: 'agent-a' },
        { id: 'T-OTHER', owner: 'agent-b' },
      ],
    },
  ];
  const stale = findStaleClaims({
    activeTasks: tasks,
    megafileHits: mega,
    now,
    staleDays: 2,
    maxOwnerLoad: 3,
  });
  assert.ok(stale.candidateCount >= 2);
  const old = stale.candidates.find((c) => c.id === 'T-OLD-20260720');
  assert.ok(old);
  assert.ok(old.reasonCodes.includes('age_days'));
  assert.ok(old.reasonCodes.includes('zombie_megafile'));
  const fresh = stale.candidates.find((c) => c.id === 'T-FRESH-20260728');
  assert.ok(!fresh, 'same-day task should not be age-stale');
  const overload = stale.candidates.filter((c) => c.owner === 'hog');
  assert.ok(overload.length >= 1, 'owner hog overload excess should be proposed');
  assert.ok(overload.every((c) => c.reasonCodes.includes('owner_overload') || c.reasonCodes.includes('age_days')));
});

test('proposeClaimRelease dry-run and apply are status-only', () => {
  const plan = `# plan.md
## 1. Task Board
| ID | Task | Status | Owner | Files | AC |
|-----|------|--------|-------|-------|-----|
| T-OLD-20260720 | old work | in_progress | agent-a | \`x.js\` | t |
| T-KEEP-20260728 | keep | in_progress | agent-b | \`y.js\` | t |

## 3. Decisions
`;
  const candidates = [
    {
      id: 'T-OLD-20260720',
      status: 'in_progress',
      owner: 'agent-a',
      reasonCodes: ['age_days'],
    },
  ];
  const dry = proposeClaimRelease({ planText: plan, candidates, apply: false });
  assert.strictEqual(dry.dryRun, true);
  assert.strictEqual(dry.appliedCount, 0);
  assert.strictEqual(dry.patches[0].ok, true);
  assert.strictEqual(dry.patches[0].toStatus, RELEASE_STATUS);
  assert.ok(dry.patches[0].after.includes('stale'));
  assert.ok(!dry.patches[0].after.includes('in_progress'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-rel-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, plan);
  const applied = proposeClaimRelease({
    planText: plan,
    candidates,
    apply: true,
    planPath,
    repo: dir,
    writeArtifact: true,
  });
  assert.strictEqual(applied.dryRun, false);
  assert.strictEqual(applied.appliedCount, 1);
  const after = fs.readFileSync(planPath, 'utf8');
  assert.ok(after.includes('| stale |') || after.includes(' stale '));
  assert.ok(after.includes('T-KEEP-20260728'));
  assert.ok(after.includes('auto-release'));
  // parseActiveTasks should no longer see released task
  const still = parseActiveTasks(after);
  assert.ok(!still.some((t) => t.id === 'T-OLD-20260720'));
  assert.ok(still.some((t) => t.id === 'T-KEEP-20260728'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('claimNewGate is advisory-only and never blocks', () => {
  const hygiene = {
    concurrency: { activeOwners: 10, cap: 3, overCap: true },
    hotMegafiles: [{ path: 'ChatScreen.tsx' }],
  };
  const gate = claimNewGate({ hygiene, force: false });
  assert.strictEqual(gate.ok, true);
  assert.strictEqual(gate.status, 'advisory');
  assert.strictEqual(gate.blocked, false);
  assert.ok(gate.reasons.some((r) => /not a block|over_cap/i.test(r)));
});

test('runClaimHygiene apply works without env gate and always ok', () => {
  const plan = `# plan.md
## 1. Task Board
| ID | Task | Status | Owner | Files | AC |
| T-OLD-20260720 | old | in_progress | a | \`x.js\` | t |
`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-apply-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, plan);
  const tasks = parseActiveTasks(plan);
  const result = runClaimHygiene({
    activeTasks: tasks,
    contention: [],
    megafileHits: [],
    planText: plan,
    planPath,
    repo: dir,
    includeStale: true,
    applyRelease: true,
    proposeRelease: true,
    now: new Date(Date.UTC(2026, 6, 28)),
    staleDays: 2,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.advisoryOnly, true);
  assert.ok(result.release);
  assert.strictEqual(result.release.dryRun, false);
  assert.ok((result.release.appliedCount || 0) >= 1);
  assert.strictEqual(result.gate.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('\nAll agent-harness-roi tests passed.');
