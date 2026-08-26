#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  honesty,
  planWalls,
  mustUseCapabilities,
  linearAgentNativeSkills,
  isCanonicalLockLabel,
  isSessionSuffixLabel,
  canDeleteLabel,
  canDeleteProject,
  canRemoveAppUser,
  classifyInventory,
  gradeCapabilities,
  main,
} = require('../tools/linear-basic-full-use');

const h = honesty();
assert.strictEqual(h.plan, 'basic_monthly_12');
assert.strictEqual(h.seats, 1);
assert.strictEqual(h.dualEditCodexHygiene2121, false);
assert.strictEqual(h.autoBuyAiCredits, false);
assert.ok(planWalls().some((w) => w.feature === 'issue SLAs'));
assert.ok(planWalls().some((w) => w.feature === 'Loops'));
assert.ok(mustUseCapabilities().some((c) => c.id === 'cycles'));
assert.ok(mustUseCapabilities().some((c) => c.id === 'agent_skills'));
assert.ok(mustUseCapabilities().some((c) => c.id === 'coding_sessions'));
assert.ok(linearAgentNativeSkills().length >= 5);
assert.ok(linearAgentNativeSkills().every((s) => !/linear-workspace-hygiene/.test(s.prompt)));

assert.strictEqual(isCanonicalLockLabel('agent-lock'), true);
assert.strictEqual(isCanonicalLockLabel('agent-codex'), true);
assert.strictEqual(isSessionSuffixLabel('agent-codex'), false);
assert.strictEqual(isSessionSuffixLabel('agent-codex-linear-basic-2111'), true);

assert.strictEqual(canDeleteLabel({ name: 'agent-lock', team: 'AGENT', issues: [] }).delete, false);
assert.strictEqual(
  canDeleteLabel({
    name: 'agent-codex-six-block-context-20260826',
    team: 'AGENT',
    issues: [{ state: { type: 'canceled' } }],
  }).reason,
  'session_suffix_closed',
);
assert.strictEqual(
  canDeleteLabel({
    name: 'agent-codex-linear-basic-2111',
    team: 'AGENT',
    issues: [{ state: { type: 'started' } }],
  }).reason,
  'session_suffix_open',
);
assert.strictEqual(canDeleteLabel({ name: 'pr_merge_time:12m', issues: [] }).reason, 'telemetry_label');
assert.strictEqual(canDeleteLabel({ name: 'stale-empty', team: 'IGO', issues: [] }).reason, 'empty');

assert.strictEqual(
  canDeleteProject({ trashed: true, issueCountIncludingArchived: 0, openIssueCount: 0 }).reason,
  'empty_trashed_or_archived',
);
assert.strictEqual(
  canDeleteProject({ trashed: true, issueCountIncludingArchived: 5, openIssueCount: 5 }).reason,
  'has_open_issues',
);
assert.strictEqual(
  canDeleteProject({ trashed: true, issueCountIncludingArchived: 5, openIssueCount: 0 }).reason,
  'has_archived_issues',
);
assert.strictEqual(canRemoveAppUser({ name: 'Devin' }).reason, 'app_user_settings_ui_only');
assert.strictEqual(canRemoveAppUser({ name: 'Cursor' }).reason, 'cursor_fleet_oauth');
assert.strictEqual(canRemoveAppUser({ name: 'Linear' }).reason, 'linear_agent');

const demo = classifyInventory({
  labels: [
    { name: 'agent-lock', team: 'AGENT', issues: [] },
    { name: 'agent-codex-six-block-context-20260826', team: 'AGENT', issues: [{ state: { type: 'canceled' } }] },
  ],
  projects: [{ name: 'empty trash', trashed: true, issueCountIncludingArchived: 0, openIssueCount: 0 }],
  users: [{ name: 'Devin', app: true, active: false }],
});
assert.deepStrictEqual(
  demo.labelsToDelete.map((row) => row.name),
  ['agent-codex-six-block-context-20260826'],
);
assert.strictEqual(demo.projectsToDelete.length, 1);
assert.strictEqual(demo.appUsers[0].delete, false);

const grade = gradeCapabilities({
  plan: 'basic_monthly_12',
  gitBranchFormat: '{issueIdentifier}',
  customersEnabled: true,
  feedEnabled: true,
  linearAgentEnabled: true,
  codingAgentEnabled: true,
  codeIntelligenceEnabled: false,
  releasesEnabled: false,
  gitPublicLinkbackMessagesEnabled: false,
  agentCyclesEnabled: true,
  agentCycleCooldown: 0,
  agentTriageEnabled: true,
  activeCycleName: null,
  templates: ['Fleet claim', 'Bug', 'Agency cash'],
  emptyLabelCount: 0,
  webhookCount: 0,
  igoPresent: true,
});
assert.strictEqual(grade.ok, true);

const failGrade = gradeCapabilities({ plan: 'free' });
assert.strictEqual(failGrade.ok, false);
assert.ok(failGrade.failed.includes('plan'));

assert.strictEqual(main(['--demo', '--json']), 0);
assert.strictEqual(main(['--json']), 0);
assert.strictEqual(main(['--caps', '--json']), 0);
assert.strictEqual(main(['--export-agent-skills', '--json']), 0);

const master = fs.readFileSync(
  path.join(__dirname, '../.agents/skills/linear-basic-full-use/SKILL.md'),
  'utf8',
);
assert.match(master, /basic_monthly_12/);

const skillDir = path.join(__dirname, '../.agents/skills');
for (const name of [
  'linear-basic-full-use',
  'linear-basic-cycles-triage',
  'linear-basic-agent-mcp',
  'linear-basic-customers-evidence',
]) {
  const skill = fs.readFileSync(path.join(skillDir, name, 'SKILL.md'), 'utf8');
  const card = fs.readFileSync(path.join(skillDir, name, 'skill-card.md'), 'utf8');
  assert.match(skill, new RegExp(name));
  assert.match(skill, /Linear Basic/);
  assert.match(card, /## Description/);
  assert.match(card, /## Owner/);
  assert.match(card, /## License/);
}

console.log('test-linear-basic-full-use: PASS');
