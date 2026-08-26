#!/usr/bin/env node
'use strict';

/**
 * GitButler fleet automations doctor (no mutations).
 * Complementary to Codex PR #2119 tools/gitbutler-route.js (write-rail router).
 * This file never runs but setup / teardown / land / mcp serve.
 */

const SCHEMA = 'gitbutler-fleet-automations/v1';
const EXPECTED_BUT_VERSION = '0.22.1';
const SHARED_PRIMARY_ROOTS = [
  '/Users/igorganapolsky/workspace/git/igor/ThumbGate',
  '/Users/igorganapolsky/workspace/git/igor/RealEstate',
  '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
];

function honesty() {
  return {
    schema: SCHEMA,
    expectedButVersion: EXPECTED_BUT_VERSION,
    dualEditCodexGitbutlerRoute2119: false,
    clonedOfficialButSkill: false,
    autoLandThumbgateMain: false,
    globalMcpOnSharedTree: false,
    steal: [
      'session-branch isolation + absorb + undo on a tree where but setup is already allowed',
      'MCP only behind assert_but_setup_safe.sh (isolated clone)',
      'never but land on ThumbGate/mac-yolo main; never install Cursor hooks for a missing but cursor subcommand',
    ],
  };
}

function planWalls() {
  return [
    { feature: 'but setup on shared primary', code: 'REFUSE' },
    { feature: 'but teardown on shared primary', code: 'REFUSE' },
    { feature: 'but land on ThumbGate/mac-yolo main', code: 'REFUSE use npm run pr:manage / gh --auto' },
    { feature: 'but mcp serve on linked/multi-worktree tree', code: 'REFUSE' },
    { feature: 'but cursor hooks (CLI 0.22.1)', code: 'UNRECOGNIZED_SUBCOMMAND' },
    { feature: 'but skill check --update into fleet overlay files', code: 'OVERWRITES_OFFICIAL_ONLY' },
  ];
}

function mustUseAutomations() {
  return [
    { id: 'skill_install_global', cmd: 'but skill install --global / --detect', rule: 'Keep 8 agent formats at CLI version. Fleet rules live in overlay skills, not the official SKILL.md' },
    { id: 'skill_check', cmd: 'but skill check', rule: 'Must print All skills are up to date. --update overwrites official copies only' },
    { id: 'agent_setup_print', cmd: 'but agent setup --print', rule: 'TTY wizard is but agent setup. Print-only; never paste into sibling AGENTS.md' },
    { id: 'session_branch', cmd: 'but commit -b agent/<slug> -m "…" <ids>', rule: 'One virtual branch per session. Never amend another agent applied branch' },
    { id: 'absorb', cmd: 'but absorb <hunk-id>', rule: 'Small fix into the unpublished commit it belongs to. Pushed/reviewed: do not absorb' },
    { id: 'undo_oplog', cmd: 'but undo / but oplog', rule: 'Prefer over reflog surgery' },
    { id: 'stacked_pr', cmd: 'but pr new <top-branch>', rule: 'Isolated GitButler clone only. gh pr create breaks stack metadata' },
    { id: 'pr_auto_merge', cmd: 'but pr auto-merge', rule: 'Same policy as gh: never around ThumbGate protection, never --admin analog' },
    { id: 'mcp_isolated', cmd: 'scripts/mcp_isolated.sh', rule: 'but mcp serve only after assert_but_setup_safe.sh exit 0. Do not add to ~/.grok/config.toml globally' },
    { id: 'pre_push_hooks', cmd: 'but push / but pr new', rule: 'Pre-push hooks on by default. --no-hooks only for a proven false deny' },
    { id: 'forge_github', cmd: 'but config forge', rule: 'Forge is GitHub IgorGanapolsky. Cloud identity is Google SSO (see /gitbutler-google-sso)' },
    { id: 'doctor', cmd: 'scripts/doctor.sh', rule: 'Exit 0: CLI + 8 installs + REFUSE wall + Keychain token present (never printed)' },
  ];
}

function isSharedPrimary(repoRoot) {
  return SHARED_PRIMARY_ROOTS.includes(String(repoRoot || ''));
}

function canRunButSetup(input = {}) {
  if (input.isLinkedWorktree) return { allow: false, reason: 'linked_worktree' };
  if (Number(input.worktreeCount || 0) > 1) return { allow: false, reason: 'multi_worktree' };
  if (isSharedPrimary(input.repoRoot)) return { allow: false, reason: 'shared_primary' };
  if (input.foreignSessionLease) return { allow: false, reason: 'foreign_session_lease' };
  if (input.singleOwnerClone === true) return { allow: true, reason: 'single_owner_clone' };
  return { allow: false, reason: 'not_single_owner_clone' };
}

function canEnableMcp(input = {}) {
  const setup = canRunButSetup(input);
  if (!setup.allow) return { allow: false, reason: `mcp_requires_setup:${setup.reason}` };
  if (input.gitbutlerWorkspace !== true) return { allow: false, reason: 'not_gitbutler_workspace' };
  return { allow: true, reason: 'isolated_gitbutler_workspace' };
}

function canInstallCursorHooks(input = {}) {
  if (input.cliHasCursorSubcommand === true) {
    const setup = canRunButSetup(input);
    if (!setup.allow) return { allow: false, reason: `hooks_require_setup:${setup.reason}` };
    return { allow: true, reason: 'isolated_clone_cursor_hooks' };
  }
  return { allow: false, reason: 'cli_no_cursor_subcommand' };
}

function canAbsorb(input = {}) {
  if (input.pushed === true || input.reviewed === true) return { allow: false, reason: 'published_history' };
  if (input.otherAgentBranch === true) return { allow: false, reason: 'other_agent_branch' };
  if (input.gitbutlerWorkspace !== true) return { allow: false, reason: 'not_gitbutler_workspace' };
  return { allow: true, reason: 'unpublished_own_session_branch' };
}

function canLand(input = {}) {
  const root = String(input.repoRoot || '');
  if (root.includes('/ThumbGate') || root.includes('/mac-yolo-safeguards')) {
    return { allow: false, reason: 'use_repo_pr_manager' };
  }
  if (!canRunButSetup(input).allow) return { allow: false, reason: 'setup_refused' };
  return { allow: false, reason: 'prefer_forge_auto_merge' };
}

function canPasteAgentSteering(input = {}) {
  if (input.target === 'print') return { allow: true, reason: 'print_only' };
  if (input.siblingOwnedAgentsMd === true) return { allow: false, reason: 'sibling_agents_md' };
  return { allow: false, reason: 'reviewed_pr_only' };
}

function classifyAutomations(input = {}) {
  return {
    schema: SCHEMA,
    setup: canRunButSetup(input),
    mcp: canEnableMcp(input),
    cursorHooks: canInstallCursorHooks(input),
    absorb: canAbsorb(input),
    land: canLand(input),
    agentSteering: canPasteAgentSteering(input),
    planWalls: planWalls(),
  };
}

function gradeAutomations(obs = {}) {
  const findings = [];
  const pass = (id, ok, detail) => findings.push({ id, ok: Boolean(ok), detail: String(detail || '') });
  pass('cli_version', obs.cliVersion === EXPECTED_BUT_VERSION, `cli=${obs.cliVersion || 'missing'}`);
  pass('skill_installs', Number(obs.installedSkillCount) >= 8, `installs=${obs.installedSkillCount}`);
  pass('skill_check', obs.skillCheckHealthy === true, 'but skill check up to date');
  pass('fleet_overlays', obs.fleetOverlaysPresent === true, 'fleet-safe + automations + google-sso');
  pass('shared_refuse', obs.sharedPrimaryRefused === true, 'ThumbGate/mac-yolo/RealEstate REFUSE');
  pass('no_global_mcp', obs.globalGrokMcpGitbutler !== true, 'no [mcp_servers.gitbutler] on shared grok config');
  pass('no_cursor_hooks_shared', obs.cursorHooksOnSharedTree !== true, 'no ~/.cursor/hooks.json but cursor on shared trees');
  pass('dual_edit_off', obs.dualEditCodexGitbutlerRoute2119 !== true, 'do not edit tools/gitbutler-route.js');
  const failed = findings.filter((row) => !row.ok);
  return { schema: SCHEMA, ok: failed.length === 0, failed: failed.map((row) => row.id), findings };
}

function runDemo() {
  return {
    shared: classifyAutomations({
      repoRoot: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
      worktreeCount: 83,
      isLinkedWorktree: false,
    }),
    isolated: classifyAutomations({
      repoRoot: '/tmp/gitbutler-solo-clone',
      worktreeCount: 1,
      isLinkedWorktree: false,
      singleOwnerClone: true,
      gitbutlerWorkspace: true,
      cliHasCursorSubcommand: false,
    }),
    grade: gradeAutomations({
      cliVersion: EXPECTED_BUT_VERSION,
      installedSkillCount: 8,
      skillCheckHealthy: true,
      fleetOverlaysPresent: true,
      sharedPrimaryRefused: true,
      globalGrokMcpGitbutler: false,
      cursorHooksOnSharedTree: false,
      dualEditCodexGitbutlerRoute2119: false,
    }),
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const pretty = json ? 2 : 0;
  const payload = { ...honesty() };
  if (argv.includes('--demo')) payload.demo = runDemo();
  if (argv.includes('--caps') || (!argv.includes('--demo') && !argv.includes('--grade'))) {
    payload.mustUse = mustUseAutomations();
    payload.planWalls = planWalls();
  }
  if (argv.includes('--grade') || argv.includes('--demo')) {
    payload.grade = (payload.demo && payload.demo.grade) || gradeAutomations();
  }
  process.stdout.write(`${JSON.stringify(payload, null, pretty)}\n`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  EXPECTED_BUT_VERSION,
  SHARED_PRIMARY_ROOTS,
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
  runDemo,
  main,
};
