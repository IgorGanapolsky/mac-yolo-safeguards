#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  evaluateOwnership,
  parseActivePlanClaims,
  sanitizeAuthState,
  selectMergeRail,
  selectWriteRail,
  writeRailAllowsCurrentDirectory,
} = require('../tools/gitbutler-route');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

test('69-worktree primary reproduces the GitButler setup refusal', () => {
  const result = selectWriteRail({
    isGitRepo: true,
    isLinkedWorktree: false,
    worktreeCount: 69,
    repoRoot: '/tmp/fleet-primary',
    singleOwnerClone: false,
  });

  assert.strictEqual(result.rail, 'git-isolated-worktree-required');
  assert.strictEqual(result.butSetupAllowed, false);
  assert.match(result.reason, /69 worktrees/);
});

test('linked worktree uses the official normal-git exception', () => {
  const result = selectWriteRail({
    isGitRepo: true,
    isLinkedWorktree: true,
    worktreeCount: 70,
    repoRoot: '/private/tmp/agent-lane',
    singleOwnerClone: true,
  });

  assert.strictEqual(result.rail, 'git-linked-worktree');
  assert.strictEqual(result.butSetupAllowed, false);
  assert.deepStrictEqual(result.forbiddenButCommands, ['setup', 'teardown', 'land']);
});

test('GitButler workspace is allowed only for an explicit single-owner clone', () => {
  const result = selectWriteRail({
    isGitRepo: true,
    isLinkedWorktree: false,
    worktreeCount: 1,
    repoRoot: '/private/tmp/single-owner-clone',
    singleOwnerClone: true,
  });

  assert.strictEqual(result.rail, 'gitbutler-workspace');
  assert.strictEqual(result.butSetupAllowed, true);
});

test('one worktree without a single-owner declaration still fails closed', () => {
  const result = selectWriteRail({
    isGitRepo: true,
    isLinkedWorktree: false,
    worktreeCount: 1,
    repoRoot: '/private/tmp/ambiguous-clone',
    singleOwnerClone: false,
  });

  assert.strictEqual(result.rail, 'blocked-owner-unproven');
  assert.strictEqual(result.butSetupAllowed, false);
});

test('known shared primary remains denied even with a single-owner flag', () => {
  const result = selectWriteRail({
    isGitRepo: true,
    isLinkedWorktree: false,
    worktreeCount: 1,
    repoRoot: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
    singleOwnerClone: true,
  });

  assert.strictEqual(result.rail, 'git-isolated-worktree-required');
  assert.strictEqual(result.butSetupAllowed, false);
});

test('ThumbGate protected merges route through the repository PR manager', () => {
  assert.deepStrictEqual(
    selectMergeRail({
      packageScripts: { 'pr:manage': 'node scripts/pr-manager.js' },
      trunkDetected: true,
    }),
    {
      rail: 'npm-pr-manage-trunk',
      command: 'npm run pr:manage',
      ready: true,
      butLandAllowed: false,
      reason: 'Repository pr:manage script owns protected Trunk submission.',
    },
  );
});

test('Trunk without a repository manager fails closed', () => {
  const result = selectMergeRail({ packageScripts: {}, trunkDetected: true });
  assert.strictEqual(result.rail, 'trunk-detected-manager-missing');
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.butLandAllowed, false);
});

test('ownership requires current branch plus one active owner for every file', () => {
  const plan = [
    '| T-ONE | route | in_progress | codex-route | `tools/route.js`, `tests/route.js` | checks |',
    '| T-TWO | other | done | other-agent | `docs/old.md` | checks |',
  ].join('\n');
  const claims = parseActivePlanClaims(plan);
  const result = evaluateOwnership({
    agent: 'codex-route',
    requestedBranch: 'codex/route',
    currentBranch: 'codex/route',
    files: ['tools/route.js', 'tests/route.js'],
    claims,
  });

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.collisions, []);
});

test('foreign active file claim blocks readiness', () => {
  const plan = [
    '| T-ONE | route | in_progress | codex-route | `tools/route.js` | checks |',
    '| T-TWO | collision | blocked | other-agent | `tools/route.js` | checks |',
  ].join('\n');
  const result = evaluateOwnership({
    agent: 'codex-route',
    requestedBranch: 'codex/route',
    currentBranch: 'codex/route',
    files: ['tools/route.js'],
    claims: parseActivePlanClaims(plan),
  });

  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.collisions, [
    { file: 'tools/route.js', owners: ['other-agent'] },
  ]);
});

test('append-only plan claims remain shared while ordinary files stay exclusive', () => {
  const plan = [
    '| T-ONE | route | in_progress | codex-route | `tools/route.js`, `plan.md` (append only) | checks |',
    '| T-TWO | other | blocked | other-agent | `plan.md` | checks |',
  ].join('\n');
  const result = evaluateOwnership({
    agent: 'codex-route',
    requestedBranch: 'codex/route',
    currentBranch: 'codex/route',
    files: ['tools/route.js', 'plan.md'],
    claims: parseActivePlanClaims(plan),
  });

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.collisions, []);
});

test('isolated-worktree-required is a stop in the current directory', () => {
  assert.strictEqual(
    writeRailAllowsCurrentDirectory({ rail: 'git-isolated-worktree-required' }),
    false,
  );
  assert.strictEqual(writeRailAllowsCurrentDirectory({ rail: 'git-linked-worktree' }), true);
  assert.strictEqual(writeRailAllowsCurrentDirectory({ rail: 'gitbutler-workspace' }), true);
});

test('auth receipt exposes status but never credential material', () => {
  const result = sanitizeAuthState({
    forgeSettings: {
      github: {
        knownAccounts: [
          {
            username: 'IgorGanapolsky',
            access_token_key: 'secret-key-reference',
            accessToken: 'must-not-leak',
          },
        ],
      },
    },
    cloudUser: { login: 'iganapolsky@gmail.com', email: 'iganapolsky@gmail.com' },
    ghAuthenticated: true,
  });

  assert.deepStrictEqual(result, {
    gitButlerCloud: { configured: true, account: 'iganapolsky@gmail.com' },
    forge: {
      configured: true,
      provider: 'github',
      accounts: ['IgorGanapolsky'],
      credentialReferencePresent: true,
    },
    githubCli: { authenticated: true },
  });
  assert.doesNotMatch(JSON.stringify(result), /secret-key-reference|must-not-leak/);
});

process.stdout.write(`\n${passed}/${passed} GitButler fleet route tests passed\n`);
