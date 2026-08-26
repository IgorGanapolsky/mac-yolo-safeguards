#!/usr/bin/env node
'use strict';

/**
 * Read-only Linear workspace inventory and hygiene planner.
 *
 * This command deliberately exposes no mutation path. It reads the provider,
 * joins issue references with the canonical Obsidian claim index, and emits a
 * deterministic review plan. A human or separately authorized operator owns
 * any later archive/delete decision.
 */

const crypto = require('crypto');
const path = require('path');
const {
  queryLinear,
  loadVaultClaimsIndex,
} = require('./linear-agent-bridge');

const DEFAULT_STALE_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const VAULT_ROOT =
  process.env.AI_AGENT_SYNC_VAULT ||
  path.join(require('os').homedir(), 'Documents', 'AI-Agent-Sync');

const COLLECTIONS = Object.freeze({
  teams: {
    fields: `
      id key name createdAt updatedAt archivedAt cyclesEnabled
    `,
  },
  projects: {
    fields: `
      id name slugId url createdAt updatedAt archivedAt
      completedAt canceledAt trashed
      status { id name type }
      lead { id name }
      teams { nodes { id key name } }
      lastUpdate { id createdAt updatedAt health url isStale }
    `,
  },
  cycles: {
    fields: `
      id name number createdAt updatedAt archivedAt startsAt endsAt completedAt
      isActive isFuture isPast
      team { id key name }
    `,
  },
  issueLabels: {
    fields: `
      id name description createdAt updatedAt archivedAt retiredAt lastAppliedAt
      team { id key name }
      parent { id name }
    `,
  },
  workflowStates: {
    fields: `
      id name type position createdAt updatedAt archivedAt
      team { id key name }
    `,
  },
  users: {
    extraArguments: ', includeDisabled: true',
    fields: `
      id name displayName createdAt updatedAt archivedAt lastSeen
      active app guest admin isAssignable
    `,
  },
  issues: {
    fields: `
      id identifier updatedAt archivedAt completedAt canceledAt url description
      state { id name type }
      project { id }
      cycle { id }
      labels { nodes { id name } }
    `,
  },
});

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
  return out;
}

function stableStringify(value, spacing = 2) {
  return JSON.stringify(stableValue(value), null, spacing);
}

function compareStable(a, b) {
  const ak = String(a.identifier || a.key || a.name || a.id || '').toLowerCase();
  const bk = String(b.identifier || b.key || b.name || b.id || '').toLowerCase();
  return ak.localeCompare(bk) || String(a.id || '').localeCompare(String(b.id || ''));
}

function asTimestamp(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBefore(nowIso, days) {
  const now = asTimestamp(nowIso);
  if (now == null) throw new Error(`Invalid --now timestamp: ${nowIso}`);
  return now - days * 24 * 60 * 60 * 1000;
}

function olderThan(value, cutoff) {
  const timestamp = asTimestamp(value);
  return timestamp != null && timestamp < cutoff;
}

function isClosedType(type) {
  return type === 'completed' || type === 'canceled';
}

function issueIsOpen(issue) {
  return !issue.archivedAt && !isClosedType(issue.state?.type);
}

function issueLabelNames(issue) {
  return (issue.labels?.nodes || []).map((label) => label.name).filter(Boolean);
}

function isAgentAttributionLabel(name) {
  return /^agent(?:-|:)/i.test(String(name || ''));
}

function isAgentLockLabel(name) {
  return /^(?:agent-lock|agent:lock|lock:claimed)$/i.test(String(name || ''));
}

function extractGithubLinks(text) {
  const links = String(text || '').match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:issues|pull)\/\d+/g) || [];
  return [...new Set(links)].sort();
}

function vaultClaimIsActive(claim) {
  if (!claim) return false;
  const action = String(claim.action || '').toLowerCase();
  const status = String(claim.status || '').toLowerCase();
  return action === 'claim' && !/(done|complete|cancel|release|closed|review)/.test(status);
}

function normalizeVaultClaim(claim, vaultRoot = VAULT_ROOT) {
  if (!claim) return null;
  let claimPath = null;
  if (claim.file) {
    const relative = path.relative(vaultRoot, claim.file);
    claimPath = relative.startsWith('..') ? path.basename(claim.file) : relative;
  }
  return {
    action: claim.action || null,
    agent: claim.agent || null,
    path: claimPath,
    status: claim.status || null,
    updated: claim.updated || null,
  };
}

function providerError(collection, response) {
  const detail = response?.message || response?.code || 'unknown provider error';
  const error = new Error(`Linear provider readback failed for ${collection}: ${detail}`);
  error.code = response?.code || 'PROVIDER_READ_FAILED';
  return error;
}

async function fetchConnection(queryClient, name, definition, options = {}) {
  const first = options.first || DEFAULT_PAGE_SIZE;
  const includeArchived = options.includeArchived !== false;
  const seen = new Map();
  let after = null;
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > 1000) throw new Error(`Linear pagination exceeded safety bound for ${name}`);
    const query = `
      query LinearWorkspaceHygiene($first: Int!, $after: String, $includeArchived: Boolean!) {
        ${name}(
          first: $first
          after: $after
          includeArchived: $includeArchived
          orderBy: updatedAt
          ${definition.extraArguments || ''}
        ) {
          nodes { ${definition.fields} }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    const response = await queryClient(query, { first, after, includeArchived });
    if (response?.error) throw providerError(name, response);
    const connection = response?.data?.[name];
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error(`Linear provider returned an invalid ${name} connection`);
    }
    for (const node of connection.nodes) {
      if (!node?.id) throw new Error(`Linear ${name} node is missing id`);
      const previous = seen.get(node.id);
      if (previous && stableStringify(previous, 0) !== stableStringify(node, 0)) {
        throw new Error(`Linear ${name} pagination returned divergent duplicate id ${node.id}`);
      }
      if (!previous) seen.set(node.id, node);
    }
    if (!connection.pageInfo.hasNextPage) break;
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
      throw new Error(`Linear ${name} pagination did not advance`);
    }
    after = connection.pageInfo.endCursor;
  }

  return [...seen.values()].sort(compareStable);
}

async function fetchOrganization(queryClient) {
  const response = await queryClient(`
    query LinearWorkspaceHygieneOrganization {
      organization {
        id name urlKey
        subscription { type seats updatedAt canceledAt }
        linearAgentEnabled agentAutomationEnabled aiAddonEnabled codingAgentEnabled
      }
    }
  `);
  if (response?.error) throw providerError('organization', response);
  const organization = response?.data?.organization;
  if (!organization?.id) throw new Error('Linear provider returned no organization');
  return organization;
}

async function fetchInventory(options = {}) {
  const queryClient = options.queryClient || queryLinear;
  const organization = await fetchOrganization(queryClient);
  const inventory = { organization };
  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    inventory[name] = await fetchConnection(queryClient, name, definition, options);
  }
  return inventory;
}

function referencesById(inventory, vaultClaims, vaultRoot) {
  const projectRefs = new Map();
  const cycleRefs = new Map();
  const labelRefs = new Map();
  const stateRefs = new Map();
  const locks = [];
  const githubLinks = new Set();

  const bump = (map, id, issue, links, claim) => {
    if (!id) return;
    const ref = map.get(id) || {
      issueCount: 0,
      openIssueCount: 0,
      githubLinks: new Set(),
      vaultClaims: new Map(),
    };
    ref.issueCount += 1;
    if (issueIsOpen(issue)) ref.openIssueCount += 1;
    for (const link of links) ref.githubLinks.add(link);
    if (claim) ref.vaultClaims.set(issue.identifier, normalizeVaultClaim(claim, vaultRoot));
    map.set(id, ref);
  };

  for (const issue of inventory.issues) {
    const links = extractGithubLinks(issue.description);
    for (const link of links) githubLinks.add(link);
    const claim = vaultClaims[String(issue.identifier || '').toUpperCase()] || null;
    bump(projectRefs, issue.project?.id, issue, links, claim);
    bump(cycleRefs, issue.cycle?.id, issue, links, claim);
    bump(stateRefs, issue.state?.id, issue, links, claim);
    for (const label of issue.labels?.nodes || []) bump(labelRefs, label.id, issue, links, claim);

    const names = issueLabelNames(issue);
    if (names.some(isAgentLockLabel) || names.some(isAgentAttributionLabel)) {
      locks.push({
        agents: names.filter((name) => isAgentAttributionLabel(name) && !isAgentLockLabel(name)).sort(),
        githubLinks: links,
        hasLock: names.some(isAgentLockLabel),
        identifier: issue.identifier,
        issueUrl: issue.url,
        state: issue.state?.name || null,
        stateType: issue.state?.type || null,
        updatedAt: issue.updatedAt,
        vaultClaim: normalizeVaultClaim(claim, vaultRoot),
        vaultClaimActive: vaultClaimIsActive(claim),
      });
    }
  }

  const finish = (map) => new Map([...map.entries()].map(([id, ref]) => [id, {
    githubLinks: [...ref.githubLinks].sort(),
    issueCount: ref.issueCount,
    openIssueCount: ref.openIssueCount,
    vaultClaims: [...ref.vaultClaims.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([identifier, claim]) => ({ identifier, ...claim })),
  }]));

  return {
    cycleRefs: finish(cycleRefs),
    githubLinks: [...githubLinks].sort(),
    labelRefs: finish(labelRefs),
    locks: locks.sort(compareStable),
    projectRefs: finish(projectRefs),
    stateRefs: finish(stateRefs),
  };
}

function candidateForProject(project, ref, cutoff) {
  const reasons = [];
  const blockers = [];
  const closed = Boolean(project.completedAt || project.canceledAt || isClosedType(project.status?.type));
  if (!closed) blockers.push('project_not_completed_or_canceled');
  if (!olderThan(project.updatedAt, cutoff)) blockers.push('recent_project_activity');
  if (project.archivedAt || project.trashed) blockers.push('already_archived_or_trashed');
  if (ref.openIssueCount) blockers.push('open_issues');
  if (ref.githubLinks.length) blockers.push('github_linked_history');
  if (ref.vaultClaims.length) blockers.push('obsidian_claim_history');
  if (closed) reasons.push('completed_or_canceled');
  if (olderThan(project.updatedAt, cutoff)) reasons.push('past_stale_threshold');
  if (!ref.openIssueCount) reasons.push('zero_open_issues');
  return {
    action: 'review_archive_project',
    blockers,
    id: project.id,
    name: project.name,
    reasons,
    safeToReview: blockers.length === 0,
    updatedAt: project.updatedAt,
  };
}

function candidateForLabel(label, ref, cutoff) {
  const reasons = [];
  const blockers = [];
  const lastUse = label.lastAppliedAt || label.updatedAt;
  if (label.archivedAt || label.retiredAt) blockers.push('already_archived_or_retired');
  if (isAgentAttributionLabel(label.name) || isAgentLockLabel(label.name)) {
    blockers.push('coordination_protocol_label');
  }
  if (ref.issueCount) blockers.push('referenced_by_issues');
  if (!olderThan(lastUse, cutoff)) blockers.push('recent_label_activity');
  if (!ref.issueCount) reasons.push('zero_issue_references');
  if (olderThan(lastUse, cutoff)) reasons.push('past_stale_threshold');
  return {
    action: 'review_retire_label',
    blockers,
    id: label.id,
    name: label.name,
    reasons,
    safeToReview: blockers.length === 0,
    updatedAt: label.updatedAt,
  };
}

function candidateForCycle(cycle, ref, cutoff) {
  const reasons = [];
  const blockers = [];
  const ended = cycle.isPast || Boolean(cycle.completedAt) || olderThan(cycle.endsAt, cutoff);
  if (!ended) blockers.push('cycle_not_past');
  if (cycle.isActive || cycle.isFuture) blockers.push('cycle_active_or_future');
  if (cycle.archivedAt) blockers.push('already_archived');
  if (ref.openIssueCount) blockers.push('open_issues');
  if (ref.githubLinks.length) blockers.push('github_linked_history');
  if (ref.vaultClaims.length) blockers.push('obsidian_claim_history');
  if (!olderThan(cycle.endsAt || cycle.updatedAt, cutoff)) blockers.push('recent_cycle_activity');
  if (ended) reasons.push('past_cycle');
  if (!ref.openIssueCount) reasons.push('zero_open_issues');
  return {
    action: 'review_archive_cycle',
    blockers,
    id: cycle.id,
    name: cycle.name || `Cycle ${cycle.number}`,
    reasons,
    safeToReview: blockers.length === 0,
    updatedAt: cycle.updatedAt,
  };
}

function candidateForLock(lock, cutoff) {
  const blockers = [];
  const reasons = [];
  if (!lock.hasLock) blockers.push('attribution_only_no_lock');
  if (!isClosedType(lock.stateType)) blockers.push('issue_not_closed');
  if (!olderThan(lock.updatedAt, cutoff)) blockers.push('recent_issue_activity');
  if (lock.vaultClaimActive) blockers.push('obsidian_claim_active');
  if (lock.hasLock) reasons.push('lock_label_present');
  if (isClosedType(lock.stateType)) reasons.push('issue_closed');
  if (olderThan(lock.updatedAt, cutoff)) reasons.push('past_stale_threshold');
  return {
    action: 'review_release_agent_lock',
    blockers,
    identifier: lock.identifier,
    reasons,
    safeToReview: blockers.length === 0,
    updatedAt: lock.updatedAt,
  };
}

function summarizeReferences(entity, refs) {
  const ref = refs.get(entity.id) || {
    githubLinks: [],
    issueCount: 0,
    openIssueCount: 0,
    vaultClaims: [],
  };
  return {
    githubLinks: ref.githubLinks,
    id: entity.id,
    issueCount: ref.issueCount,
    name: entity.name || entity.key || entity.identifier || entity.id,
    openIssueCount: ref.openIssueCount,
    updatedAt: entity.updatedAt || null,
    vaultClaims: ref.vaultClaims,
  };
}

function buildHygieneReport(inventory, options = {}) {
  const staleDays = options.staleDays || DEFAULT_STALE_DAYS;
  if (!Number.isInteger(staleDays) || staleDays < 1 || staleDays > 3650) {
    throw new Error('--stale-days must be an integer from 1 to 3650');
  }
  const nowIso = options.now || new Date().toISOString();
  const cutoff = daysBefore(nowIso, staleDays);
  const vaultClaims = options.vaultClaims || {};
  const refs = referencesById(inventory, vaultClaims, options.vaultRoot || VAULT_ROOT);

  const projectReviews = inventory.projects
    .map((project) => candidateForProject(project, refs.projectRefs.get(project.id) || {
      githubLinks: [], issueCount: 0, openIssueCount: 0, vaultClaims: [],
    }, cutoff))
    .filter((candidate) => candidate.reasons.length)
    .sort(compareStable);
  const labelReviews = inventory.issueLabels
    .map((label) => candidateForLabel(label, refs.labelRefs.get(label.id) || {
      githubLinks: [], issueCount: 0, openIssueCount: 0, vaultClaims: [],
    }, cutoff))
    .filter((candidate) => candidate.reasons.length)
    .sort(compareStable);
  const cycleReviews = inventory.cycles
    .map((cycle) => candidateForCycle(cycle, refs.cycleRefs.get(cycle.id) || {
      githubLinks: [], issueCount: 0, openIssueCount: 0, vaultClaims: [],
    }, cutoff))
    .filter((candidate) => candidate.reasons.length)
    .sort(compareStable);
  const lockReviews = refs.locks.map((lock) => candidateForLock(lock, cutoff)).sort(compareStable);

  const safeCount = (items) => items.filter((item) => item.safeToReview).length;
  const providerAgents = inventory.users
    .filter((user) => user.app)
    .map((user) => ({
      active: Boolean(user.active),
      archivedAt: user.archivedAt || null,
      id: user.id,
      lastSeen: user.lastSeen || null,
      name: user.displayName || user.name,
      safety: 'manual_review_only',
    }))
    .sort(compareStable);
  const attributionLabels = inventory.issueLabels
    .filter((label) => isAgentAttributionLabel(label.name))
    .map((label) => summarizeReferences(label, refs.labelRefs))
    .sort(compareStable);
  const core = {
    capabilities: {
      agentAutomationEnabled: Boolean(inventory.organization.agentAutomationEnabled),
      aiAddonEnabled: Boolean(inventory.organization.aiAddonEnabled),
      apiReadback: true,
      codingAgentEnabled: Boolean(inventory.organization.codingAgentEnabled),
      linearAgentEnabled: Boolean(inventory.organization.linearAgentEnabled),
      mutationAvailable: false,
      subscriptionType: inventory.organization.subscription?.type || null,
    },
    candidates: {
      cycles: cycleReviews,
      labels: labelReviews,
      locks: lockReviews,
      projects: projectReviews,
    },
    inventory: {
      agentAttributionLabels: attributionLabels,
      agentLocks: refs.locks,
      cycles: inventory.cycles.map((cycle) => summarizeReferences(cycle, refs.cycleRefs)),
      projects: inventory.projects.map((project) => ({
        ...summarizeReferences(project, refs.projectRefs),
        lastUpdate: project.lastUpdate ? {
          health: project.lastUpdate.health || null,
          isStale: Boolean(project.lastUpdate.isStale),
          updatedAt: project.lastUpdate.updatedAt || project.lastUpdate.createdAt || null,
          url: project.lastUpdate.url || null,
        } : null,
        status: project.status?.name || null,
        statusType: project.status?.type || null,
        url: project.url || null,
      })),
      providerAgents,
      teams: inventory.teams.map((team) => ({
        archivedAt: team.archivedAt || null,
        cyclesEnabled: Boolean(team.cyclesEnabled),
        id: team.id,
        key: team.key,
        name: team.name,
        updatedAt: team.updatedAt,
      })),
      workflowStates: inventory.workflowStates.map((state) => ({
        ...summarizeReferences(state, refs.stateRefs),
        team: state.team?.key || null,
        type: state.type,
      })),
    },
    links: {
      github: refs.githubLinks,
      obsidianClaimPaths: [...new Set(
        Object.values(vaultClaims).map((claim) => normalizeVaultClaim(claim, options.vaultRoot || VAULT_ROOT)?.path).filter(Boolean),
      )].sort(),
    },
    mode: 'dry-run',
    organization: {
      id: inventory.organization.id,
      name: inventory.organization.name,
      seats: inventory.organization.subscription?.seats ?? null,
      subscriptionType: inventory.organization.subscription?.type || null,
      subscriptionUpdatedAt: inventory.organization.subscription?.updatedAt || null,
      urlKey: inventory.organization.urlKey,
    },
    providerReadback: true,
    schema: 'linear-workspace-hygiene/v1',
    staleDays,
    summary: {
      activeIssues: inventory.issues.filter(issueIsOpen).length,
      cycles: inventory.cycles.length,
      issueLabels: inventory.issueLabels.length,
      issues: inventory.issues.length,
      projects: inventory.projects.length,
      providerAgents: providerAgents.length,
      reviewCandidates: {
        cycles: safeCount(cycleReviews),
        labels: safeCount(labelReviews),
        locks: safeCount(lockReviews),
        projects: safeCount(projectReviews),
      },
      teams: inventory.teams.length,
      users: inventory.users.length,
      workflowStates: inventory.workflowStates.length,
    },
  };
  const fingerprint = crypto.createHash('sha256').update(stableStringify(core, 0)).digest('hex');
  return { ...core, fingerprint };
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    inventory: false,
    json: false,
    staleDays: DEFAULT_STALE_DAYS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--inventory') options.inventory = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--stale-days') options.staleDays = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Linear workspace hygiene (read-only)

Usage:
  node tools/linear-workspace-hygiene.js --inventory [--json]
  node tools/linear-workspace-hygiene.js --dry-run [--stale-days 90] [--json]

The command performs provider reads only. It has no --apply, --archive, or --delete mode.`);
}

function humanSummary(report) {
  const summary = report.summary;
  return [
    `Linear ${report.organization.subscriptionType || 'unknown plan'} · provider readback PASS`,
    `teams=${summary.teams} projects=${summary.projects} cycles=${summary.cycles} issues=${summary.issues} labels=${summary.issueLabels} users=${summary.users}`,
    `review-only candidates: projects=${summary.reviewCandidates.projects} labels=${summary.reviewCandidates.labels} cycles=${summary.reviewCandidates.cycles} locks=${summary.reviewCandidates.locks}`,
    `fingerprint=${report.fingerprint}`,
    'mutations=disabled',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  if (options.help || (!options.inventory && !options.dryRun)) {
    printHelp();
    return null;
  }
  const inventory = await fetchInventory({ queryClient: dependencies.queryClient || queryLinear });
  const report = buildHygieneReport(inventory, {
    now: dependencies.now || new Date().toISOString(),
    staleDays: options.staleDays,
    vaultClaims: dependencies.vaultClaims || loadVaultClaimsIndex(),
    vaultRoot: dependencies.vaultRoot || VAULT_ROOT,
  });
  console.log(options.json ? stableStringify(report) : humanSummary(report));
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Linear workspace hygiene failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  COLLECTIONS,
  DEFAULT_STALE_DAYS,
  buildHygieneReport,
  extractGithubLinks,
  fetchConnection,
  fetchInventory,
  humanSummary,
  isAgentAttributionLabel,
  isAgentLockLabel,
  issueIsOpen,
  main,
  normalizeVaultClaim,
  parseArgs,
  stableStringify,
  vaultClaimIsActive,
};
