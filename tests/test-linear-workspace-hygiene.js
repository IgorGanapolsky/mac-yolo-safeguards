#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COLLECTIONS,
  buildHygieneReport,
  fetchConnection,
  fetchInventory,
  parseArgs,
  stableStringify,
} = require('../tools/linear-workspace-hygiene');

const OLD = '2025-01-01T00:00:00.000Z';
const RECENT = '2026-08-25T00:00:00.000Z';
const NOW = '2026-08-26T16:00:00.000Z';

function fixtureInventory() {
  const stateDone = { id: 'state-done', name: 'Done', type: 'completed' };
  const stateStarted = { id: 'state-started', name: 'In Progress', type: 'started' };
  return {
    organization: {
      id: 'org-1',
      name: 'Test Workspace',
      urlKey: 'test-workspace',
      subscription: { type: 'basic_monthly_12', seats: 1, updatedAt: RECENT },
      linearAgentEnabled: true,
      agentAutomationEnabled: true,
      aiAddonEnabled: true,
      codingAgentEnabled: true,
    },
    teams: [
      { id: 'team-1', key: 'AGENT', name: 'Agent Operations', updatedAt: RECENT, cyclesEnabled: true },
    ],
    projects: [
      {
        id: 'project-old', name: 'Completed old project', updatedAt: OLD,
        completedAt: OLD, archivedAt: null, trashed: false,
        status: { id: 'project-status-done', name: 'Completed', type: 'completed' },
        url: 'https://linear.app/project-old', lastUpdate: null,
      },
      {
        id: 'project-linked', name: 'Linked old project', updatedAt: OLD,
        completedAt: OLD, archivedAt: null, trashed: false,
        status: { id: 'project-status-done', name: 'Completed', type: 'completed' },
        url: 'https://linear.app/project-linked', lastUpdate: null,
      },
      {
        id: 'project-vault', name: 'Claimed old project', updatedAt: OLD,
        completedAt: OLD, archivedAt: null, trashed: false,
        status: { id: 'project-status-done', name: 'Completed', type: 'completed' },
        url: 'https://linear.app/project-vault', lastUpdate: null,
      },
      {
        id: 'project-active', name: 'Active project', updatedAt: OLD,
        completedAt: null, archivedAt: null, trashed: false,
        status: { id: 'project-status-active', name: 'Started', type: 'started' },
        url: 'https://linear.app/project-active',
        lastUpdate: { id: 'update-1', health: 'onTrack', updatedAt: RECENT, url: 'https://linear.app/update-1' },
      },
    ],
    cycles: [
      {
        id: 'cycle-old', name: 'Old cycle', number: 1, updatedAt: OLD,
        endsAt: OLD, completedAt: OLD, archivedAt: null,
        isPast: true, isActive: false, isFuture: false,
      },
      {
        id: 'cycle-active', name: 'Current cycle', number: 2, updatedAt: RECENT,
        endsAt: '2026-09-01T00:00:00.000Z', completedAt: null, archivedAt: null,
        isPast: false, isActive: true, isFuture: false,
      },
    ],
    issueLabels: [
      { id: 'label-unused', name: 'unused-label', updatedAt: OLD, lastAppliedAt: OLD },
      { id: 'label-used', name: 'used-label', updatedAt: OLD, lastAppliedAt: OLD },
      { id: 'label-lock', name: 'agent-lock', updatedAt: OLD, lastAppliedAt: OLD },
      { id: 'label-agent', name: 'agent-codex', updatedAt: OLD, lastAppliedAt: OLD },
    ],
    workflowStates: [
      { ...stateDone, updatedAt: OLD, team: { id: 'team-1', key: 'AGENT' } },
      { ...stateStarted, updatedAt: OLD, team: { id: 'team-1', key: 'AGENT' } },
    ],
    users: [
      { id: 'user-1', name: 'Owner', displayName: 'Owner', active: true, app: false, updatedAt: RECENT },
      { id: 'agent-1', name: 'Coding Agent', displayName: 'Coding Agent', active: false, app: true, archivedAt: OLD, lastSeen: OLD, updatedAt: OLD },
    ],
    issues: [
      {
        id: 'issue-old', identifier: 'AGENT-1', updatedAt: OLD, url: 'https://linear.app/AGENT-1',
        state: stateDone, project: { id: 'project-old' }, cycle: null, labels: { nodes: [] }, description: '',
      },
      {
        id: 'issue-linked', identifier: 'AGENT-2', updatedAt: OLD, url: 'https://linear.app/AGENT-2',
        state: stateDone, project: { id: 'project-linked' }, cycle: null, labels: { nodes: [] },
        description: 'Evidence https://github.com/example/repo/pull/42',
      },
      {
        id: 'issue-vault', identifier: 'AGENT-3', updatedAt: OLD, url: 'https://linear.app/AGENT-3',
        state: stateDone, project: { id: 'project-vault' }, cycle: null, labels: { nodes: [] }, description: '',
      },
      {
        id: 'issue-active', identifier: 'AGENT-4', updatedAt: RECENT, url: 'https://linear.app/AGENT-4',
        state: stateStarted, project: { id: 'project-active' }, cycle: { id: 'cycle-active' },
        labels: { nodes: [{ id: 'label-used', name: 'used-label' }] }, description: '',
      },
      {
        id: 'issue-stale-lock', identifier: 'AGENT-5', updatedAt: OLD, url: 'https://linear.app/AGENT-5',
        state: stateDone, project: null, cycle: null,
        labels: { nodes: [{ id: 'label-lock', name: 'agent-lock' }, { id: 'label-agent', name: 'agent-codex' }] },
        description: '',
      },
      {
        id: 'issue-active-lock', identifier: 'AGENT-6', updatedAt: OLD, url: 'https://linear.app/AGENT-6',
        state: stateStarted, project: null, cycle: null,
        labels: { nodes: [{ id: 'label-lock', name: 'agent-lock' }, { id: 'label-agent', name: 'agent-codex' }] },
        description: '',
      },
      {
        id: 'issue-vault-lock', identifier: 'AGENT-7', updatedAt: OLD, url: 'https://linear.app/AGENT-7',
        state: stateDone, project: null, cycle: null,
        labels: { nodes: [{ id: 'label-lock', name: 'agent-lock' }, { id: 'label-agent', name: 'agent-codex' }] },
        description: '',
      },
    ],
  };
}

function fakeProvider(inventory, options = {}) {
  const calls = [];
  const queryClient = async (query, variables = {}) => {
    calls.push({ query, variables });
    assert.doesNotMatch(query, /\bmutation\b/i, 'hygiene readback must never issue a mutation');
    if (query.includes('LinearWorkspaceHygieneOrganization')) {
      if (options.organizationError) return options.organizationError;
      return { data: { organization: inventory.organization } };
    }
    const match = query.match(/\n\s+(teams|projects|cycles|issueLabels|workflowStates|users|issues)\s*\(/);
    assert.ok(match, `unexpected query: ${query}`);
    const name = match[1];
    const nodes = inventory[name];
    if (options.connectionError === name) {
      return { error: true, code: 'AUTH', message: 'denied' };
    }
    if (name === 'issues' && !variables.after) {
      return {
        data: {
          issues: {
            nodes: nodes.slice(0, 4),
            pageInfo: { hasNextPage: true, endCursor: 'issues-page-2' },
          },
        },
      };
    }
    if (name === 'issues') {
      return {
        data: {
          issues: {
            nodes: [nodes[3], ...nodes.slice(4)],
            pageInfo: { hasNextPage: false, endCursor: 'issues-page-2' },
          },
        },
      };
    }
    return { data: { [name]: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } };
  };
  return { calls, queryClient };
}

test('fetchInventory paginates, deduplicates identical nodes, and performs reads only', async () => {
  const inventory = fixtureInventory();
  const provider = fakeProvider(inventory);
  const fetched = await fetchInventory({ queryClient: provider.queryClient });
  assert.equal(fetched.issues.length, inventory.issues.length);
  assert.deepEqual(fetched.issues.map((issue) => issue.identifier).sort(), inventory.issues.map((issue) => issue.identifier).sort());
  assert.equal(provider.calls.length, Object.keys(COLLECTIONS).length + 2, 'organization + seven connections + second issue page');
  assert.ok(provider.calls.every((call) => !/\bmutation\b/i.test(call.query)));
});

test('fetchInventory fails closed on provider authentication errors', async () => {
  const inventory = fixtureInventory();
  const provider = fakeProvider(inventory, { connectionError: 'projects' });
  await assert.rejects(
    fetchInventory({ queryClient: provider.queryClient }),
    /provider readback failed for projects: denied/,
  );
});

test('pagination rejects divergent duplicate ids', async () => {
  let page = 0;
  const queryClient = async () => {
    page += 1;
    return {
      data: {
        projects: {
          nodes: [{ id: 'same-id', name: page === 1 ? 'First' : 'Changed' }],
          pageInfo: { hasNextPage: page === 1, endCursor: page === 1 ? 'next' : null },
        },
      },
    };
  };
  await assert.rejects(
    fetchConnection(queryClient, 'projects', COLLECTIONS.projects),
    /divergent duplicate id same-id/,
  );
});

test('pagination fails when the provider cursor does not advance', async () => {
  const queryClient = async () => ({
    data: {
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
    },
  });
  await assert.rejects(
    fetchConnection(queryClient, 'projects', COLLECTIONS.projects),
    /pagination did not advance/,
  );
});

test('dry-run hygiene honors GitHub, Obsidian, active issue, and coordination-label blockers', () => {
  const vaultClaims = {
    'AGENT-3': {
      agent: 'codex', action: 'done', status: 'Done', updated: OLD,
      file: '/vault/Handoffs/linear-claims/AGENT-3.md',
    },
    'AGENT-5': {
      agent: 'codex', action: 'done', status: 'Done', updated: OLD,
      file: '/vault/Handoffs/linear-claims/AGENT-5.md',
    },
    'AGENT-7': {
      agent: 'codex', action: 'claim', status: 'In Progress', updated: OLD,
      file: '/vault/Handoffs/linear-claims/AGENT-7.md',
    },
  };
  const report = buildHygieneReport(fixtureInventory(), {
    now: NOW,
    staleDays: 90,
    vaultClaims,
    vaultRoot: '/vault',
  });

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.capabilities.mutationAvailable, false);
  assert.equal(report.organization.subscriptionType, 'basic_monthly_12');

  const projects = Object.fromEntries(report.candidates.projects.map((item) => [item.id, item]));
  assert.equal(projects['project-old'].safeToReview, true);
  assert.deepEqual(projects['project-linked'].blockers, ['github_linked_history']);
  assert.deepEqual(projects['project-vault'].blockers, ['obsidian_claim_history']);
  assert.ok(projects['project-active'].blockers.includes('project_not_completed_or_canceled'));
  assert.ok(projects['project-active'].blockers.includes('open_issues'));

  const labels = Object.fromEntries(report.candidates.labels.map((item) => [item.id, item]));
  assert.equal(labels['label-unused'].safeToReview, true);
  assert.ok(labels['label-used'].blockers.includes('referenced_by_issues'));
  assert.ok(labels['label-lock'].blockers.includes('coordination_protocol_label'));
  assert.ok(labels['label-agent'].blockers.includes('coordination_protocol_label'));

  const cycles = Object.fromEntries(report.candidates.cycles.map((item) => [item.id, item]));
  assert.equal(cycles['cycle-old'].safeToReview, true);
  assert.equal(cycles['cycle-active'], undefined, 'active cycles never enter stale review output');

  const locks = Object.fromEntries(report.candidates.locks.map((item) => [item.identifier, item]));
  assert.equal(locks['AGENT-5'].safeToReview, true);
  assert.ok(locks['AGENT-6'].blockers.includes('issue_not_closed'));
  assert.ok(locks['AGENT-7'].blockers.includes('obsidian_claim_active'));

  assert.deepEqual(report.links.github, ['https://github.com/example/repo/pull/42']);
  assert.ok(report.links.obsidianClaimPaths.includes('Handoffs/linear-claims/AGENT-3.md'));
  assert.equal(report.inventory.providerAgents[0].safety, 'manual_review_only');
});

test('identical provider snapshots produce byte-identical reports and fingerprints', () => {
  const options = { now: NOW, staleDays: 90, vaultClaims: {}, vaultRoot: '/vault' };
  const first = buildHygieneReport(fixtureInventory(), options);
  const second = buildHygieneReport(fixtureInventory(), options);
  assert.equal(stableStringify(first), stableStringify(second));
  assert.equal(first.fingerprint, second.fingerprint);
});

test('CLI parser has no mutation, archive, or delete mode', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--json', '--stale-days', '120']), {
    dryRun: true,
    help: false,
    inventory: false,
    json: true,
    staleDays: 120,
  });
  assert.throws(() => parseArgs(['--apply']), /Unknown argument: --apply/);
  assert.throws(() => parseArgs(['--archive']), /Unknown argument: --archive/);
  assert.throws(() => parseArgs(['--delete']), /Unknown argument: --delete/);
});
