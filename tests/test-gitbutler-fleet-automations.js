#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  honesty,
  planWalls,
  mustUseAutomations,
  canRunButSetup,
  canEnableMcp,
  canInstallCursorHooks,
  canAbsorb,
  canLand,
  canPasteAgentSteering,
  classifyAutomations,
  gradeAutomations,
  main,
} = require('../tools/gitbutler-fleet-automations');

const h = honesty();
assert.strictEqual(h.dualEditCodexGitbutlerRoute2119, false);
assert.strictEqual(h.globalMcpOnSharedTree, false);
assert.strictEqual(h.autoLandThumbgateMain, false);
assert.ok(planWalls().some((w) => w.feature.includes('but land')));
assert.ok(mustUseAutomations().some((a) => a.id === 'mcp_isolated'));
assert.ok(mustUseAutomations().some((a) => a.id === 'session_branch'));

assert.strictEqual(
  canRunButSetup({
    repoRoot: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
    worktreeCount: 83,
  }).reason,
  'multi_worktree',
);
assert.strictEqual(canRunButSetup({ isLinkedWorktree: true }).reason, 'linked_worktree');
assert.strictEqual(
  canRunButSetup({
    repoRoot: '/Users/igorganapolsky/workspace/git/igor/ThumbGate',
    worktreeCount: 1,
  }).reason,
  'shared_primary',
);
assert.strictEqual(
  canRunButSetup({
    repoRoot: '/tmp/solo',
    worktreeCount: 1,
    singleOwnerClone: true,
  }).allow,
  true,
);

assert.strictEqual(
  canEnableMcp({
    repoRoot: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
    worktreeCount: 83,
  }).allow,
  false,
);
assert.strictEqual(
  canEnableMcp({
    repoRoot: '/tmp/solo',
    worktreeCount: 1,
    singleOwnerClone: true,
    gitbutlerWorkspace: true,
  }).allow,
  true,
);

assert.strictEqual(canInstallCursorHooks({}).reason, 'cli_no_cursor_subcommand');
assert.strictEqual(canAbsorb({ pushed: true, gitbutlerWorkspace: true }).allow, false);
assert.strictEqual(canAbsorb({ otherAgentBranch: true, gitbutlerWorkspace: true }).allow, false);
assert.strictEqual(canAbsorb({ gitbutlerWorkspace: true }).allow, true);
assert.strictEqual(
  canLand({ repoRoot: '/Users/igorganapolsky/workspace/git/igor/ThumbGate' }).reason,
  'use_repo_pr_manager',
);
assert.strictEqual(canPasteAgentSteering({ siblingOwnedAgentsMd: true }).allow, false);
assert.strictEqual(canPasteAgentSteering({ target: 'print' }).allow, true);

const demo = classifyAutomations({
  repoRoot: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
  worktreeCount: 83,
});
assert.strictEqual(demo.setup.allow, false);
assert.strictEqual(demo.mcp.allow, false);
assert.strictEqual(demo.land.allow, false);

const grade = gradeAutomations({
  cliVersion: '0.22.1',
  installedSkillCount: 8,
  skillCheckHealthy: true,
  fleetOverlaysPresent: true,
  sharedPrimaryRefused: true,
  globalGrokMcpGitbutler: false,
  cursorHooksOnSharedTree: false,
  dualEditCodexGitbutlerRoute2119: false,
});
assert.strictEqual(grade.ok, true);
assert.strictEqual(gradeAutomations({ cliVersion: '0.1.0' }).ok, false);

assert.strictEqual(main(['--demo', '--json']), 0);
assert.strictEqual(main(['--caps', '--json']), 0);

const skillDir = path.join(__dirname, '../.agents/skills');
for (const name of [
  'gitbutler-fleet-automations',
  'gitbutler-mcp-isolated',
  'gitbutler-session-absorb',
  'gitbutler-google-sso',
]) {
  const skill = fs.readFileSync(path.join(skillDir, name, 'SKILL.md'), 'utf8');
  const card = fs.readFileSync(path.join(skillDir, name, 'skill-card.md'), 'utf8');
  assert.match(skill, new RegExp(name));
  assert.doesNotMatch(skill, /require\('\.\.\/gitbutler-route/);
  assert.match(card, /## Description/);
  assert.match(card, /## Owner/);
  assert.match(card, /## License/);
}

const skillsMd = fs.readFileSync(path.join(__dirname, '../SKILLS.md'), 'utf8');
assert.match(skillsMd, /gitbutler-fleet-automations/);
assert.match(skillsMd, /gitbutler-mcp-isolated/);
assert.match(skillsMd, /gitbutler-session-absorb/);
assert.match(skillsMd, /gitbutler-google-sso/);
assert.doesNotMatch(skillsMd, /tools\/gitbutler-route\.js/);

const js = fs.readFileSync(path.join(__dirname, '../tools/gitbutler-fleet-automations.js'), 'utf8');
assert.doesNotMatch(js, /require\(['\"]\.\/gitbutler-route/);
assert.match(js, /dualEditCodexGitbutlerRoute2119/);

const mcp = fs.readFileSync(
  path.join(skillDir, 'gitbutler-fleet-automations/scripts/mcp_isolated.sh'),
  'utf8',
);
assert.match(mcp, /assert_but_setup_safe/);
assert.match(mcp, /but mcp serve/);

const { spawnSync } = require('child_process');
const mcpScript = path.join(skillDir, 'gitbutler-fleet-automations/scripts/mcp_isolated.sh');
const refuse = spawnSync('bash', [mcpScript, path.join(__dirname, '..')], {
  encoding: 'utf8',
  timeout: 45000,
});
assert.notStrictEqual(refuse.status, 0, 'mcp_isolated.sh must refuse this linked worktree');
assert.match(`${refuse.stdout || ''}\n${refuse.stderr || ''}`, /refused|REFUSE|worktree|setup guard/i);

console.log('test-gitbutler-fleet-automations: PASS');
