#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');

const bridge = require('./linear-agent-bridge');

const POLICY_START = '2026-08-09T15:10:00.000Z';
const IMPROVEMENT_CATEGORIES = Object.freeze([
  'auth',
  'ci',
  'handoff',
  'research',
  'reuse',
  'review',
  'scope',
  'tests',
  'tooling',
  'other',
]);
const TELEMETRY_PREFIXES = Object.freeze([
  'cycle-',
  'pr-cycle-',
  'speed-next-',
  'outcome-',
]);

function parseTimestamp(value, field) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) throw new Error(`${field} must be an ISO-8601 timestamp`);
  return ms;
}

function normalizeContributor(value) {
  const normalized = bridge.normalizeAgent(value);
  return String(normalized)
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function collectContributors(existingLabels = [], explicitContributors = []) {
  const contributors = new Map();
  for (const label of existingLabels) {
    const name = String(label?.name || label || '');
    if (!name.toLowerCase().startsWith('agent-') || name.toLowerCase() === 'agent-lock') continue;
    const contributor = name.slice('agent-'.length);
    if (contributor) contributors.set(contributor.toLowerCase(), contributor);
  }
  for (const value of explicitContributors) {
    const contributor = normalizeContributor(value);
    if (contributor) contributors.set(contributor.toLowerCase(), contributor);
  }
  return [...contributors.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function durationBucket(milliseconds, prefix = 'cycle') {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error('duration must be a non-negative number');
  }
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let suffix;
  if (milliseconds < 15 * minute) suffix = 'under-15m';
  else if (milliseconds < hour) suffix = '15m-1h';
  else if (milliseconds < 4 * hour) suffix = '1h-4h';
  else if (milliseconds < day) suffix = '4h-1d';
  else if (milliseconds < 3 * day) suffix = '1d-3d';
  else suffix = 'over-3d';
  return `${prefix}-${suffix}`;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'unknown';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function isTelemetryLabel(name) {
  const lower = String(name || '').toLowerCase();
  return TELEMETRY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function validateImprovement(category, improvement, bottleneck) {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (!IMPROVEMENT_CATEGORIES.includes(normalizedCategory)) {
    throw new Error(`improvement category must be one of: ${IMPROVEMENT_CATEGORIES.join(', ')}`);
  }
  if (!String(bottleneck || '').trim()) throw new Error('bottleneck is required');
  if (!String(improvement || '').trim()) throw new Error('next-time improvement is required');
  return normalizedCategory;
}

function createCloseoutPlan({
  issue,
  contributors: explicitContributors = [],
  pr = null,
  observedAt = new Date().toISOString(),
  bottleneck,
  improvementCategory,
  improvement,
  evidence = null,
}) {
  if (!issue?.id || !issue?.identifier || !issue?.team?.id) {
    throw new Error('issue id, identifier, and team are required');
  }
  const category = validateImprovement(improvementCategory, improvement, bottleneck);
  const existingLabels = issue.labels?.nodes || [];
  const contributors = collectContributors(existingLabels, explicitContributors);
  if (!contributors.length) throw new Error('at least one contributing agent is required');

  const startAt = issue.startedAt || issue.createdAt;
  const startBasis = issue.startedAt ? 'startedAt' : 'createdAt';
  const startMs = parseTimestamp(startAt, `issue.${startBasis}`);
  const observedMs = parseTimestamp(observedAt, 'observedAt');

  let endAt = issue.completedAt || observedAt;
  let prCycleMs = null;
  if (pr) {
    if (String(pr.state || '').toUpperCase() !== 'MERGED' || !pr.mergedAt) {
      throw new Error('PR evidence must prove state=MERGED and include mergedAt');
    }
    const prCreatedMs = parseTimestamp(pr.createdAt, 'pr.createdAt');
    const prMergedMs = parseTimestamp(pr.mergedAt, 'pr.mergedAt');
    if (prMergedMs < prCreatedMs) throw new Error('PR mergedAt precedes createdAt');
    prCycleMs = prMergedMs - prCreatedMs;
    endAt = pr.mergedAt;
  }
  const endMs = parseTimestamp(endAt, 'completion end');
  if (endMs < startMs) throw new Error('completion end precedes issue start');
  if (!issue.completedAt && !pr && endMs !== observedMs) throw new Error('invalid observed completion time');

  const issueCycleMs = endMs - startMs;
  const desiredLabelNames = [
    ...contributors.map((agent) => `agent-${agent}`),
    durationBucket(issueCycleMs, 'cycle'),
    `speed-next-${category}`,
    pr ? 'outcome-pr-merged' : 'outcome-issue-closed',
  ];
  if (prCycleMs !== null) desiredLabelNames.push(durationBucket(prCycleMs, 'pr-cycle'));
  const desiredLabelNamesLower = new Set(desiredLabelNames.map((name) => name.toLowerCase()));

  const preservedLabelNames = existingLabels
    .map((label) => String(label.name || ''))
    .filter(Boolean)
    .filter((name) => name.toLowerCase() !== 'agent-lock')
    .filter((name) => !isTelemetryLabel(name));
  const finalLabelNames = [...new Map(
    [...preservedLabelNames, ...desiredLabelNames].map((name) => [name.toLowerCase(), name]),
  ).values()];

  const lines = [
    '## Agent closeout telemetry',
    '',
    `- Contributors: ${contributors.map((agent) => `\`${agent}\``).join(', ')}`,
    `- Issue cycle: **${formatDuration(issueCycleMs)}** (${startAt} → ${endAt}; start basis: ${startBasis})`,
  ];
  if (pr) {
    const mergeSha = pr.mergeCommit?.oid || pr.mergeCommit || 'unknown';
    lines.push(`- PR: [#${pr.number}](${pr.url}) merged as \`${mergeSha}\``);
    lines.push(`- PR cycle: **${formatDuration(prCycleMs)}** (${pr.createdAt} → ${pr.mergedAt})`);
  }
  lines.push(`- Primary bottleneck: ${String(bottleneck).trim()}`);
  lines.push(`- Next-time improvement (\`speed-next-${category}\`): ${String(improvement).trim()}`);
  if (evidence) lines.push(`- Evidence: ${String(evidence).trim()}`);

  const receiptPayload = {
    schemaVersion: 1,
    issue: issue.identifier,
    contributors,
    issueCycleMs,
    prCycleMs,
    endAt,
    bottleneck: String(bottleneck).trim(),
    improvementCategory: category,
    improvement: String(improvement).trim(),
    prUrl: pr?.url || null,
    mergeSha: pr?.mergeCommit?.oid || pr?.mergeCommit || null,
  };
  const receiptId = crypto.createHash('sha256').update(JSON.stringify(receiptPayload)).digest('hex');
  const marker = `<!-- linear-closeout:${receiptId} -->`;
  const commentBody = `${lines.join('\n')}\n\n${marker}`;

  return {
    schemaVersion: 1,
    issueId: issue.id,
    identifier: issue.identifier,
    issueUrl: issue.url,
    teamId: issue.team.id,
    contributors,
    startAt,
    startBasis,
    endAt,
    issueCycleMs,
    issueCycle: formatDuration(issueCycleMs),
    prCycleMs,
    prCycle: prCycleMs === null ? null : formatDuration(prCycleMs),
    finalLabelNames,
    removedLabelNames: existingLabels
      .map((label) => String(label.name || ''))
      .filter((name) => name.toLowerCase() === 'agent-lock'
        || (isTelemetryLabel(name) && !desiredLabelNamesLower.has(name.toLowerCase()))),
    improvementCategory: category,
    receiptId,
    marker,
    commentBody,
    pr,
  };
}

async function loadIssue(identifier, api = bridge) {
  const found = await api.findIssueByIdentifier(identifier);
  if (found.error) throw new Error(found.message || `issue ${identifier} not found`);
  const result = await api.queryLinear(
    `
      query($id: String!) {
        issue(id: $id) {
          id identifier title url createdAt startedAt completedAt canceledAt updatedAt
          team { id key name }
          state { id name type }
          labels { nodes { id name } }
          comments(last: 50) { nodes { id body url } }
        }
      }
    `,
    { id: found.issue.id },
  );
  if (result.error) throw new Error(result.message || 'Linear issue read failed');
  const issue = result.data?.issue;
  if (!issue) throw new Error(`Linear issue ${identifier} returned no data`);
  return issue;
}

function loadPullRequest(target, runner = execFileSync) {
  if (!target) return null;
  const fields = 'number,url,state,isDraft,createdAt,mergedAt,mergeCommit,headRefOid,statusCheckRollup';
  const raw = runner('gh', ['pr', 'view', String(target), '--json', fields], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(raw);
}

function labelColor(name) {
  if (name.startsWith('agent-')) return '#5E6AD2';
  if (name.startsWith('speed-next-')) return '#26B5CE';
  if (name.startsWith('outcome-')) return '#4CB782';
  return '#8A8F98';
}

async function ensureTeamLabels(teamId, labelNames, api = bridge) {
  const listed = await api.queryLinear(
    `query($teamId: String!) { team(id: $teamId) { labels { nodes { id name } } } }`,
    { teamId: String(teamId) },
  );
  if (listed.error) throw new Error(listed.message || 'Linear label read failed');
  const labels = listed.data?.team?.labels?.nodes || [];
  const byName = new Map(labels.map((label) => [label.name.toLowerCase(), label]));
  const created = [];
  for (const name of labelNames) {
    if (byName.has(name.toLowerCase())) continue;
    const response = await api.queryLinear(
      `
        mutation($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) { success issueLabel { id name } }
        }
      `,
      { input: { name, teamId: String(teamId), color: labelColor(name) } },
    );
    if (response.error || !response.data?.issueLabelCreate?.success) {
      throw new Error(response.message || `failed to create Linear label ${name}`);
    }
    const label = response.data.issueLabelCreate.issueLabel;
    byName.set(label.name.toLowerCase(), label);
    created.push(label.name);
  }
  return { byName, created };
}

async function completedStateId(teamId, api = bridge) {
  const result = await api.queryLinear(
    `query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }`,
    { teamId: String(teamId) },
  );
  if (result.error) throw new Error(result.message || 'Linear state read failed');
  const states = result.data?.team?.states?.nodes || [];
  const done = states.find((state) => state.type === 'completed')
    || states.find((state) => state.name.toLowerCase() === 'done');
  if (!done) throw new Error('team has no completed state');
  return done.id;
}

function findExistingCloseoutComment(issue, marker) {
  const comments = issue.comments?.nodes || [];
  return comments.find((comment) => String(comment.body || '').includes(marker))
    || comments.find((comment) => String(comment.body || '').includes('<!-- linear-closeout:'))
    || null;
}

function closeoutCommentAction(issue, marker, body) {
  const existing = findExistingCloseoutComment(issue, marker);
  if (!existing) return { action: 'create', existing: null };
  if (String(existing.body || '') === String(body || '')) return { action: 'reuse', existing };
  return { action: 'update', existing };
}

async function markIssueCompleted(issue, api = bridge) {
  const stateId = await completedStateId(issue.team.id, api);
  const updated = await api.queryLinear(
    `
      mutation($issueId: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $input) { success issue { id identifier } }
      }
    `,
    { issueId: issue.id, input: { stateId: String(stateId) } },
  );
  if (updated.error || !updated.data?.issueUpdate?.success) {
    throw new Error(updated.message || 'Linear issue completion transition failed');
  }
  return loadIssue(issue.identifier, api);
}

async function applyCloseout(issue, plan, api = bridge) {
  const ensured = await ensureTeamLabels(plan.teamId, plan.finalLabelNames, api);
  const commentAction = closeoutCommentAction(issue, plan.marker, plan.commentBody);
  let existingComment = commentAction.existing;
  let commentCreated = false;
  let commentUpdated = false;
  if (commentAction.action === 'create') {
    const comment = await api.queryLinear(
      `
        mutation($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success comment { id url body }
          }
        }
      `,
      { issueId: plan.issueId, body: plan.commentBody },
    );
    if (comment.error || !comment.data?.commentCreate?.success) {
      throw new Error(comment.message || 'Linear completion comment failed');
    }
    existingComment = comment.data.commentCreate.comment;
    commentCreated = true;
  } else if (commentAction.action === 'update') {
    const comment = await api.queryLinear(
      `
        mutation($commentId: String!, $input: CommentUpdateInput!) {
          commentUpdate(id: $commentId, input: $input) {
            success comment { id url body }
          }
        }
      `,
      { commentId: existingComment.id, input: { body: plan.commentBody } },
    );
    if (comment.error || !comment.data?.commentUpdate?.success) {
      throw new Error(comment.message || 'Linear completion comment update failed');
    }
    existingComment = comment.data.commentUpdate.comment;
    commentUpdated = true;
  }

  const existingByName = new Map((issue.labels?.nodes || []).map((label) => [label.name.toLowerCase(), label]));
  const addedLabelIds = plan.finalLabelNames
    .filter((name) => !existingByName.has(name.toLowerCase()))
    .map((name) => ensured.byName.get(name.toLowerCase())?.id)
    .filter(Boolean);
  const removedLabelIds = (issue.labels?.nodes || [])
    .filter((label) => plan.removedLabelNames.some((name) => name.toLowerCase() === label.name.toLowerCase()))
    .map((label) => label.id);
  const stateId = await completedStateId(plan.teamId, api);
  const input = { stateId: String(stateId) };
  if (addedLabelIds.length) input.addedLabelIds = addedLabelIds.map(String);
  if (removedLabelIds.length) input.removedLabelIds = removedLabelIds.map(String);
  const updated = await api.queryLinear(
    `
      mutation($issueId: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $input) {
          success
          issue { id identifier title url state { id name type } team { id key name } labels { nodes { id name } } }
        }
      }
    `,
    { issueId: plan.issueId, input },
  );
  if (updated.error || !updated.data?.issueUpdate?.success) {
    throw new Error(updated.message || 'Linear issue completion update failed');
  }
  const completedIssue = updated.data.issueUpdate.issue;
  const vaultPath = api.writeVaultClaim({
    issue: completedIssue,
    agent: plan.contributors[0],
    action: 'done',
    comment: `closeout telemetry ${plan.receiptId}`,
    files: [],
  });
  return {
    applied: true,
    issue: completedIssue,
    labelsCreated: ensured.created,
    labelsAdded: plan.finalLabelNames.filter((name) => !existingByName.has(name.toLowerCase())),
    labelsRemoved: plan.removedLabelNames,
    commentCreated,
    commentUpdated,
    commentUrl: existingComment?.url || null,
    vaultPath,
  };
}

function auditIssues(issues, since = POLICY_START) {
  const sinceMs = parseTimestamp(since, 'since');
  const relevant = issues.filter((issue) => {
    if (!issue.completedAt) return false;
    return parseTimestamp(issue.completedAt, `${issue.identifier}.completedAt`) >= sinceMs;
  });
  const results = relevant.map((issue) => {
    const names = (issue.labels?.nodes || []).map((label) => String(label.name || ''));
    const lower = names.map((name) => name.toLowerCase());
    const missing = [];
    if (!lower.some((name) => name.startsWith('agent-') && name !== 'agent-lock')) missing.push('agent-*');
    if (!lower.some((name) => name.startsWith('cycle-'))) missing.push('cycle-*');
    if (!lower.some((name) => name.startsWith('speed-next-'))) missing.push('speed-next-*');
    if (!lower.some((name) => name.startsWith('outcome-'))) missing.push('outcome-*');
    return { identifier: issue.identifier, url: issue.url, completedAt: issue.completedAt, missing };
  });
  return {
    policyStart: since,
    completedIssueCount: results.length,
    compliantCount: results.filter((result) => result.missing.length === 0).length,
    noncompliant: results.filter((result) => result.missing.length > 0),
  };
}

async function loadCompletedIssues(teamKey, api = bridge) {
  const result = await api.queryLinear(
    `
      query($first: Int!, $teamKey: String!) {
        issues(
          first: $first
          filter: { team: { key: { eq: $teamKey } }, state: { type: { eq: "completed" } } }
          orderBy: updatedAt
        ) {
          nodes { id identifier title url completedAt labels { nodes { id name } } }
        }
      }
    `,
    { first: 250, teamKey },
  );
  if (result.error) throw new Error(result.message || 'Linear completed issue audit failed');
  return result.data?.issues?.nodes || [];
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(args) {
  const agents = String(valueAfter(args, '--agents') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    issue: valueAfter(args, '--issue'),
    agents,
    pr: valueAfter(args, '--pr'),
    bottleneck: valueAfter(args, '--bottleneck'),
    improvementCategory: valueAfter(args, '--improvement-category'),
    improvement: valueAfter(args, '--improvement'),
    evidence: valueAfter(args, '--evidence'),
    apply: args.includes('--apply'),
    audit: args.includes('--audit'),
    strict: args.includes('--strict'),
    json: args.includes('--json'),
    team: valueAfter(args, '--team') || 'AGENT',
    since: valueAfter(args, '--since') || POLICY_START,
  };
}

function printHelp() {
  console.log(`linear-closeout-telemetry

Close one issue with durable contributor/time/improvement telemetry:
  node tools/linear-closeout-telemetry.js --issue AGENT-336 \\
    --agents codex,grok --pr 123 \\
    --bottleneck "CI queue wait" \\
    --improvement-category ci \\
    --improvement "Run the focused gate before opening the PR" \\
    --evidence "CI URL" --apply --json

Without --apply the command performs a read-only preview.

Audit completed issues since the mandate date:
  node tools/linear-closeout-telemetry.js --audit --team AGENT --strict --json

Improvement categories: ${IMPROVEMENT_CATEGORIES.join(', ')}`);
}

async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) {
    printHelp();
    return;
  }
  const options = parseArgs(argv);
  if (options.audit) {
    const issues = await loadCompletedIssues(options.team);
    const audit = auditIssues(issues, options.since);
    const output = { mode: 'audit', providerWrites: 0, ...audit };
    console.log(JSON.stringify(output, null, 2));
    if (options.strict && audit.noncompliant.length) process.exitCode = 2;
    return;
  }
  if (!options.issue) throw new Error('--issue is required');
  let issue = await loadIssue(options.issue);
  const pr = loadPullRequest(options.pr);
  const planInput = {
    issue,
    contributors: options.agents,
    pr,
    bottleneck: options.bottleneck,
    improvementCategory: options.improvementCategory,
    improvement: options.improvement,
    evidence: options.evidence,
  };
  let plan = createCloseoutPlan(planInput);
  if (!options.apply) {
    console.log(JSON.stringify({ mode: 'preview', providerWrites: 0, plan }, null, 2));
    return;
  }
  // Linear assigns the authoritative completedAt only after the state transition.
  // Validate the full plan first, then transition and rebuild from the provider timestamp.
  if (!pr && !issue.completedAt) {
    issue = await markIssueCompleted(issue);
    plan = createCloseoutPlan({ ...planInput, issue });
  }
  const result = await applyCloseout(issue, plan);
  console.log(JSON.stringify({ mode: 'apply', plan, result }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`linear-closeout-telemetry: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  POLICY_START,
  IMPROVEMENT_CATEGORIES,
  normalizeContributor,
  collectContributors,
  durationBucket,
  formatDuration,
  isTelemetryLabel,
  createCloseoutPlan,
  loadPullRequest,
  auditIssues,
  parseArgs,
  labelColor,
  findExistingCloseoutComment,
  closeoutCommentAction,
};
