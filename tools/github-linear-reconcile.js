#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const MANAGED_START = '<!-- github-linear-reconcile:start -->';
const MANAGED_END = '<!-- github-linear-reconcile:end -->';
const DEFAULT_REPO = 'IgorGanapolsky/mac-yolo-safeguards';
const DEFAULT_TEAM = 'AGENT';
const DEFAULT_PROJECT = 'mac-yolo-safeguards';

class ReconcileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReconcileError';
    this.code = code;
    this.details = details;
  }
}

function parseArgs(argv) {
  const args = {
    apply: false,
    confirmProject: null,
    dryRunExplicit: false,
    json: false,
    maxMutations: 100,
    project: DEFAULT_PROJECT,
    repo: DEFAULT_REPO,
    team: DEFAULT_TEAM,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (!argv[index]) throw new ReconcileError('INVALID_ARGS', `${arg} requires a value`);
      return argv[index];
    };

    if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm-project') args.confirmProject = next();
    else if (arg === '--dry-run') args.dryRunExplicit = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--max-mutations') args.maxMutations = Number(next());
    else if (arg === '--project') args.project = next();
    else if (arg === '--repo') args.repo = next();
    else if (arg === '--team') args.team = next();
    else if (arg === '--help') args.help = true;
    else throw new ReconcileError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.maxMutations) || args.maxMutations < 0) {
    throw new ReconcileError('INVALID_ARGS', '--max-mutations must be a non-negative integer');
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(args.repo)) {
    throw new ReconcileError('INVALID_ARGS', '--repo must use owner/name format');
  }
  if (args.apply && args.dryRunExplicit) {
    throw new ReconcileError('INVALID_ARGS', '--apply and --dry-run are mutually exclusive');
  }
  if (args.apply && args.confirmProject !== args.project) {
    throw new ReconcileError(
      'CONFIRMATION_REQUIRED',
      `Apply requires --confirm-project ${JSON.stringify(args.project)}`,
    );
  }
  return args;
}

function canonicalGitHubIssueUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/i,
  );
  if (!match) return null;
  return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}/issues/${Number(match[3])}`;
}

function normalizeGitHubIssue(issue) {
  const url = canonicalGitHubIssueUrl(issue.html_url) || canonicalGitHubIssueUrl(issue.url);
  const state = String(issue.state || '').toLowerCase();
  if (!url) {
    throw new ReconcileError('INVALID_GITHUB_ISSUE', 'GitHub issue is missing a canonical issue URL', {
      number: issue.number || null,
    });
  }
  if (!Number.isInteger(Number(issue.number)) || Number(issue.number) < 1) {
    throw new ReconcileError('INVALID_GITHUB_ISSUE', `Invalid GitHub issue number for ${url}`);
  }
  if (!['open', 'closed'].includes(state)) {
    throw new ReconcileError('INVALID_GITHUB_ISSUE', `Invalid GitHub state for ${url}: ${state}`);
  }
  return {
    body: typeof issue.body === 'string' ? issue.body.trim() : '',
    number: Number(issue.number),
    state,
    title: String(issue.title || '').trim(),
    url,
  };
}

function extractLinearSourceUrl(issue) {
  const description = issue.description || '';
  const managedStart = description.indexOf(MANAGED_START);
  const managedEnd = description.indexOf(MANAGED_END);
  if (managedStart !== -1 && managedEnd > managedStart) {
    const managedUrl = canonicalGitHubIssueUrl(description.slice(managedStart, managedEnd));
    if (managedUrl) return managedUrl;
  }

  const attachmentUrls = [];
  for (const attachment of issue.attachments?.nodes || issue.attachments || []) {
    const url = canonicalGitHubIssueUrl(attachment?.url || '');
    if (url) attachmentUrls.push(url);
  }
  const titleNumber = String(issue.title || '').match(/^\[GH-#(\d+)\]/i)?.[1];
  if (titleNumber) {
    const attachmentMatch = attachmentUrls.find((url) => url.endsWith(`/issues/${Number(titleNumber)}`));
    if (attachmentMatch) return attachmentMatch;
    const descriptionUrls = [...description.matchAll(/https?:\/\/(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/gi)]
      .map((match) => canonicalGitHubIssueUrl(match[0]))
      .filter(Boolean);
    const descriptionMatch = descriptionUrls.find((url) =>
      url.endsWith(`/issues/${Number(titleNumber)}`),
    );
    if (descriptionMatch) return descriptionMatch;
  }
  return attachmentUrls[0] || canonicalGitHubIssueUrl(description);
}

function formatManagedBlock(issue) {
  return [
    MANAGED_START,
    `Source: ${issue.url}`,
    `GitHub state: ${issue.state}`,
    'Canonical details: GitHub',
    MANAGED_END,
  ].join('\n');
}

function newLinearDescription(issue) {
  return formatManagedBlock(issue);
}

function upsertManagedBlock(description, issue) {
  const current = typeof description === 'string' ? description.trim() : '';
  const managed = formatManagedBlock(issue);
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  const startCount = current.split(MANAGED_START).length - 1;
  const endCount = current.split(MANAGED_END).length - 1;

  if (start === -1 && end === -1) return current ? `${current}\n\n${managed}` : managed;
  if (startCount !== 1 || endCount !== 1 || start === -1 || end === -1 || end < start) {
    throw new ReconcileError('MALFORMED_MANAGED_BLOCK', `Malformed managed block for ${issue.url}`);
  }
  const after = end + MANAGED_END.length;
  return `${current.slice(0, start)}${managed}${current.slice(after)}`.trim();
}

function desiredTitle(issue) {
  return `[GH-#${issue.number}] ${issue.title}`.trim();
}

function isActiveLinearIssue(issue) {
  return !['canceled', 'cancelled', 'duplicate'].includes(
    String(issue.state?.type || '').toLowerCase(),
  );
}

function buildReconciliationPlan({ githubIssues, linearIssues, projectId, stateIds }) {
  if (!projectId) throw new ReconcileError('MISSING_PROJECT', 'Linear project ID is required');
  if (!stateIds?.open || !stateIds?.closed) {
    throw new ReconcileError('MISSING_STATES', 'Linear open and closed state IDs are required');
  }

  const sources = githubIssues.map(normalizeGitHubIssue);
  const githubByUrl = new Map();
  for (const issue of sources) {
    if (githubByUrl.has(issue.url)) {
      throw new ReconcileError('DUPLICATE_GITHUB_IDENTITY', `Duplicate GitHub issue identity: ${issue.url}`);
    }
    githubByUrl.set(issue.url, issue);
  }

  const linearByUrl = new Map();
  for (const issue of linearIssues) {
    const sourceUrl = extractLinearSourceUrl(issue);
    if (!sourceUrl || !isActiveLinearIssue(issue)) continue;
    const matches = linearByUrl.get(sourceUrl) || [];
    matches.push(issue);
    linearByUrl.set(sourceUrl, matches);
  }

  const ambiguous = [...linearByUrl.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([url, matches]) => ({
      identifiers: matches.map((issue) => issue.identifier || issue.id),
      url,
    }));
  if (ambiguous.length) {
    throw new ReconcileError(
      'DUPLICATE_LINEAR_IDENTITY',
      `Multiple active Linear issues map to ${ambiguous.length} GitHub issue(s)`,
      { ambiguous },
    );
  }

  const creates = [];
  const updates = [];
  let skippedClosedUntracked = 0;

  for (const source of sources) {
    const match = linearByUrl.get(source.url)?.[0];
    const title = desiredTitle(source);
    if (!match) {
      if (source.state === 'closed') {
        skippedClosedUntracked += 1;
        continue;
      }
      creates.push({
        githubUrl: source.url,
        input: {
          description: newLinearDescription(source),
          projectId,
          stateId: source.state === 'closed' ? stateIds.closed : stateIds.open,
          title,
        },
      });
      continue;
    }

    const input = {};
    const description = upsertManagedBlock(match.description, source);
    if (match.title !== title) input.title = title;
    if ((match.description || '').trim() !== description) input.description = description;
    if (match.project?.id !== projectId) input.projectId = projectId;

    const stateType = String(match.state?.type || '').toLowerCase();
    if (source.state === 'closed' && !['completed', 'canceled', 'cancelled'].includes(stateType)) {
      input.stateId = stateIds.closed;
    } else if (
      source.state === 'open' &&
      ['completed', 'canceled', 'cancelled', 'duplicate'].includes(stateType)
    ) {
      input.stateId = stateIds.open;
    }

    if (Object.keys(input).length) {
      updates.push({
        githubUrl: source.url,
        id: match.id,
        identifier: match.identifier || null,
        input,
      });
    }
  }

  return {
    creates,
    updates,
    stats: {
      creates: creates.length,
      githubIssues: sources.length,
      linearIssues: linearIssues.length,
      mutations: creates.length + updates.length,
      skippedClosedUntracked,
      updates: updates.length,
    },
  };
}

async function applyPlan(plan, adapter) {
  const results = { created: [], updated: [] };
  for (const operation of plan.updates) {
    results.updated.push(await adapter.updateLinearIssue(operation.id, operation.input));
  }
  for (const operation of plan.creates) {
    results.created.push(await adapter.createLinearIssue(operation.input));
  }
  return results;
}

function defaultLockPath(repo, project) {
  const digest = crypto.createHash('sha256').update(`${repo}\n${project}`).digest('hex').slice(0, 16);
  return path.join(os.homedir(), '.hermes', 'locks', `github-linear-reconcile-${digest}.lock`);
}

async function withAtomicLock(lockPath, callback) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new ReconcileError('LOCKED', `Another reconciliation owns ${lockPath}`);
    }
    throw error;
  }
  try {
    fs.writeFileSync(
      descriptor,
      JSON.stringify({ hostname: os.hostname(), pid: process.pid, startedAt: new Date().toISOString() }),
    );
    fs.closeSync(descriptor);
    descriptor = null;
    return await callback();
  } finally {
    if (descriptor !== null && descriptor !== undefined) fs.closeSync(descriptor);
    fs.unlinkSync(lockPath);
  }
}

async function executeReconciliation(options, adapter) {
  if (options.apply && options.confirmProject !== options.project) {
    throw new ReconcileError(
      'CONFIRMATION_REQUIRED',
      `Apply requires exact project confirmation for ${JSON.stringify(options.project)}`,
    );
  }
  const run = async () => {
    const [githubIssues, linearContext] = await Promise.all([
      adapter.loadGithubIssues(options.repo),
      adapter.loadLinearContext(options.team, options.project),
    ]);
    const plan = buildReconciliationPlan({
      githubIssues,
      linearIssues: linearContext.linearIssues,
      projectId: linearContext.projectId,
      stateIds: linearContext.stateIds,
    });
    if (plan.stats.mutations > options.maxMutations) {
      throw new ReconcileError(
        'MUTATION_LIMIT',
        `Planned ${plan.stats.mutations} mutations exceeds --max-mutations ${options.maxMutations}`,
        { stats: plan.stats },
      );
    }
    if (!options.apply) return { applied: false, plan };
    const results = await applyPlan(plan, adapter);
    return { applied: true, plan, results };
  };

  if (!options.apply) return run();
  const lockPath = options.lockPath || defaultLockPath(options.repo, options.project);
  return (adapter.withLock || withAtomicLock)(lockPath, run);
}

function readLinearApiKey(dependencies = {}) {
  const env = dependencies.env || process.env;
  const home = dependencies.home || os.homedir();
  const platform = dependencies.platform || process.platform;
  const readFile = dependencies.readFileSync || fs.readFileSync;
  const run = dependencies.execFileSync || execFileSync;
  const candidates = [];
  if (env.LINEAR_API_KEY) candidates.push(env.LINEAR_API_KEY.trim());
  const configPath = path.join(home, '.config', 'linear', 'api_key');
  try {
    candidates.push(readFile(configPath, 'utf8').trim());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (platform === 'darwin') {
    try {
      candidates.push(
        run('/usr/bin/security', ['find-generic-password', '-s', 'LINEAR_API_KEY', '-w'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim(),
      );
    } catch {
      // A missing Keychain item is handled by the fail-closed check below.
    }
  }
  const key = candidates.find(Boolean);
  if (!key) throw new ReconcileError('MISSING_AUTH', 'Linear API credentials were not found');
  return key;
}

async function linearGraphql(apiKey, query, variables = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('https://api.linear.app/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new ReconcileError(
      'LINEAR_GRAPHQL',
      payload.errors?.map((error) => error.message).join('; ') || `Linear HTTP ${response.status}`,
    );
  }
  return payload.data;
}

function loadGithubIssues(repo, runner = execFileSync) {
  const pages = JSON.parse(
    runner(
      'gh',
      ['api', `repos/${repo}/issues?state=all&per_page=100`, '--paginate', '--slurp'],
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
    ),
  );
  return pages.flat().filter((issue) => !issue.pull_request);
}

async function loadLinearContext(apiKey, teamKey, projectName, queryLinear = linearGraphql) {
  const metadata = await queryLinear(
    apiKey,
    `query ReconcileMetadata($teamKey: String!, $projectName: String!) {
      teams(first: 2, filter: { key: { eq: $teamKey } }) {
        nodes { id key name states(first: 100) { nodes { id name type } } }
      }
      projects(first: 2, filter: { name: { eq: $projectName } }) {
        nodes { id name teams { nodes { id } } }
      }
    }`,
    { projectName, teamKey },
  );
  const teams = metadata.teams?.nodes || [];
  const projects = metadata.projects?.nodes || [];
  if (teams.length !== 1) {
    throw new ReconcileError('TEAM_AMBIGUOUS', `Expected one Linear team for ${teamKey}, found ${teams.length}`);
  }
  if (projects.length !== 1) {
    throw new ReconcileError(
      'PROJECT_AMBIGUOUS',
      `Expected one Linear project for ${projectName}, found ${projects.length}`,
    );
  }
  const team = teams[0];
  const project = projects[0];
  if (!(project.teams?.nodes || []).some((candidate) => candidate.id === team.id)) {
    throw new ReconcileError('PROJECT_TEAM_MISMATCH', `${projectName} is not attached to team ${teamKey}`);
  }
  const states = team.states?.nodes || [];
  const open = states.find((state) => state.type === 'backlog') || states.find((state) => state.type === 'unstarted');
  const closed = states.find((state) => state.type === 'completed');
  if (!open || !closed) {
    throw new ReconcileError('MISSING_STATES', `Team ${teamKey} lacks backlog/unstarted or completed state`);
  }

  const linearIssues = [];
  let after = null;
  do {
    const data = await queryLinear(
      apiKey,
      `query ReconcileIssues($projectId: ID!, $after: String) {
        issues(first: 100, after: $after, filter: { project: { id: { eq: $projectId } } }) {
          nodes {
            id identifier title description
            state { id name type }
            project { id name }
            attachments { nodes { url } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after, projectId: project.id },
    );
    linearIssues.push(...(data.issues?.nodes || []));
    after = data.issues?.pageInfo?.hasNextPage ? data.issues.pageInfo.endCursor : null;
  } while (after);

  return {
    linearIssues,
    projectId: project.id,
    stateIds: { closed: closed.id, open: open.id },
    teamId: team.id,
  };
}

function createLiveAdapter(dependencies = {}) {
  const apiKey = dependencies.apiKey || readLinearApiKey();
  const queryLinear = dependencies.queryLinear || linearGraphql;
  const githubLoader = dependencies.loadGithubIssues || loadGithubIssues;
  let teamId = null;
  return {
    async createLinearIssue(input) {
      const data = await queryLinear(
        apiKey,
        `mutation ReconcileCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }`,
        { input: { ...input, teamId } },
      );
      if (!data.issueCreate?.success) throw new ReconcileError('LINEAR_CREATE_FAILED', 'Linear issueCreate failed');
      return data.issueCreate.issue;
    },
    loadGithubIssues: githubLoader,
    async loadLinearContext(team, project) {
      const context = await loadLinearContext(apiKey, team, project, queryLinear);
      teamId = context.teamId;
      return context;
    },
    async updateLinearIssue(id, input) {
      const data = await queryLinear(
        apiKey,
        `mutation ReconcileUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success issue { id identifier url } }
        }`,
        { id, input },
      );
      if (!data.issueUpdate?.success) throw new ReconcileError('LINEAR_UPDATE_FAILED', 'Linear issueUpdate failed');
      return data.issueUpdate.issue;
    },
  };
}

function printHelp() {
  process.stdout.write(`Usage: node tools/github-linear-reconcile.js [options]\n\n`);
  process.stdout.write(`Default mode is read-only dry-run.\n`);
  process.stdout.write(`  --repo owner/name\n  --team TEAM_KEY\n  --project PROJECT_NAME\n`);
  process.stdout.write(`  --dry-run (default)\n  --max-mutations N\n  --json\n`);
  process.stdout.write(`  --apply --confirm-project PROJECT_NAME\n`);
}

async function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.help) return printHelp();
  const result = await executeReconciliation(options, createLiveAdapter());
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    const { stats } = result.plan;
    process.stdout.write(
      `${result.applied ? 'APPLIED' : 'DRY RUN'}: ${stats.githubIssues} GitHub issues, ` +
        `${stats.creates} creates, ${stats.updates} updates, ` +
        `${stats.skippedClosedUntracked} historical closed skipped\n`,
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    const payload = {
      code: error.code || 'UNEXPECTED',
      details: error.details || {},
      error: error.message,
      ok: false,
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MANAGED_END,
  MANAGED_START,
  ReconcileError,
  applyPlan,
  buildReconciliationPlan,
  canonicalGitHubIssueUrl,
  createLiveAdapter,
  defaultLockPath,
  executeReconciliation,
  extractLinearSourceUrl,
  formatManagedBlock,
  isActiveLinearIssue,
  linearGraphql,
  loadGithubIssues,
  loadLinearContext,
  normalizeGitHubIssue,
  newLinearDescription,
  parseArgs,
  readLinearApiKey,
  upsertManagedBlock,
  withAtomicLock,
};
