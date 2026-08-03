'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MANAGED_START,
  ReconcileError,
  buildReconciliationPlan,
  canonicalGitHubIssueUrl,
  createLiveAdapter,
  defaultLockPath,
  executeReconciliation,
  extractLinearSourceUrl,
  linearGraphql,
  loadGithubIssues,
  loadLinearContext,
  parseArgs,
  readLinearApiKey,
  upsertManagedBlock,
  withAtomicLock,
} = require('../tools/github-linear-reconcile');

const PROJECT_ID = 'project-1';
const STATE_IDS = { closed: 'state-done', open: 'state-backlog' };

function githubIssue(overrides = {}) {
  return {
    body: 'Original body',
    number: 42,
    state: 'OPEN',
    title: 'Fix orchestration drift',
    url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/42',
    ...overrides,
  };
}

function linearIssue(source = githubIssue(), overrides = {}) {
  const canonicalSource = {
    ...source,
    state: String(source.state).toLowerCase(),
    url: canonicalGitHubIssueUrl(source.url),
  };
  return {
    attachments: [],
    description: upsertManagedBlock('', canonicalSource),
    id: 'linear-42',
    identifier: 'AGENT-42',
    project: { id: PROJECT_ID },
    state: { id: STATE_IDS.open, type: 'backlog' },
    title: `[GH-#${source.number}] ${source.title}`,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ReconcileError && error.code === code);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryAdapter(githubIssues, linearIssues) {
  let sequence = linearIssues.length;
  const writes = [];
  return {
    async createLinearIssue(input) {
      writes.push({ input: clone(input), type: 'create' });
      sequence += 1;
      const created = {
        attachments: [],
        description: input.description,
        id: `linear-created-${sequence}`,
        identifier: `AGENT-${sequence}`,
        project: { id: input.projectId },
        state: {
          id: input.stateId,
          type: input.stateId === STATE_IDS.closed ? 'completed' : 'backlog',
        },
        title: input.title,
      };
      linearIssues.push(created);
      return created;
    },
    async loadGithubIssues() {
      return clone(githubIssues);
    },
    async loadLinearContext() {
      return { linearIssues: clone(linearIssues), projectId: PROJECT_ID, stateIds: STATE_IDS };
    },
    async updateLinearIssue(id, input) {
      writes.push({ id, input: clone(input), type: 'update' });
      const target = linearIssues.find((issue) => issue.id === id);
      Object.assign(target, input);
      if (input.projectId) target.project = { id: input.projectId };
      if (input.stateId) {
        target.state = {
          id: input.stateId,
          type: input.stateId === STATE_IDS.closed ? 'completed' : 'backlog',
        };
      }
      return target;
    },
    withLock: async (_lockPath, callback) => callback(),
    writes,
  };
}

async function run() {
  assert.strictEqual(
    canonicalGitHubIssueUrl('see https://www.github.com/Org/Repo/issues/0042?x=1'),
    'https://github.com/org/repo/issues/42',
  );
  assert.strictEqual(canonicalGitHubIssueUrl('https://github.com/Org/Repo/pull/42'), null);
  assert.strictEqual(defaultLockPath('a/b', 'Safety'), defaultLockPath('a/b', 'Safety'));
  assert.notStrictEqual(defaultLockPath('a/b', 'Safety'), defaultLockPath('a/b', 'Other'));
  const apiShapedPlan = buildReconciliationPlan({
    githubIssues: [
      githubIssue({
        html_url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/42',
        url: 'https://api.github.com/repos/IgorGanapolsky/mac-yolo-safeguards/issues/42',
      }),
    ],
    linearIssues: [],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.strictEqual(
    apiShapedPlan.creates[0].githubUrl,
    'https://github.com/igorganapolsky/mac-yolo-safeguards/issues/42',
  );

  const parsed = parseArgs([
    'node',
    'script',
    '--repo',
    'a/b',
    '--project',
    'Safety',
    '--max-mutations',
    '3',
    '--json',
  ]);
  assert.strictEqual(parsed.apply, false);
  assert.strictEqual(parsed.project, 'Safety');
  assert.strictEqual(parsed.maxMutations, 3);
  assert.strictEqual(parsed.json, true);
  expectCode(() => parseArgs(['node', 'script', '--unknown']), 'INVALID_ARGS');
  expectCode(() => parseArgs(['node', 'script', '--repo']), 'INVALID_ARGS');
  expectCode(() => parseArgs(['node', 'script', '--repo', 'invalid']), 'INVALID_ARGS');
  expectCode(() => parseArgs(['node', 'script', '--max-mutations', '-1']), 'INVALID_ARGS');
  expectCode(
    () => parseArgs(['node', 'script', '--project', 'Safety', '--apply']),
    'CONFIRMATION_REQUIRED',
  );
  expectCode(
    () =>
      parseArgs([
        'node',
        'script',
        '--project',
        'Safety',
        '--dry-run',
        '--apply',
        '--confirm-project',
        'Safety',
      ]),
    'INVALID_ARGS',
  );
  assert.strictEqual(
    parseArgs([
      'node',
      'script',
      '--project',
      'Safety',
      '--apply',
      '--confirm-project',
      'Safety',
    ]).apply,
    true,
  );
  assert.strictEqual(
    readLinearApiKey({
      env: { LINEAR_API_KEY: 'env-key' },
      platform: 'linux',
      readFileSync: () => {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
    }),
    'env-key',
  );
  assert.strictEqual(
    readLinearApiKey({ env: {}, platform: 'linux', readFileSync: () => 'file-key\n' }),
    'file-key',
  );
  assert.strictEqual(
    readLinearApiKey({
      env: {},
      execFileSync: () => 'keychain-key\n',
      platform: 'darwin',
      readFileSync: () => {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
    }),
    'keychain-key',
  );
  expectCode(
    () =>
      readLinearApiKey({
        env: {},
        platform: 'linux',
        readFileSync: () => {
          const error = new Error('missing');
          error.code = 'ENOENT';
          throw error;
        },
      }),
    'MISSING_AUTH',
  );

  const managedIdentity = linearIssue();
  assert.strictEqual(
    extractLinearSourceUrl(managedIdentity),
    'https://github.com/igorganapolsky/mac-yolo-safeguards/issues/42',
  );
  assert.strictEqual(
    extractLinearSourceUrl({
      attachments: [{ url: 'https://github.com/Org/Repo/issues/7' }],
      description: 'Related https://github.com/Org/Repo/issues/8',
      title: '[GH-#7] Exact identity',
    }),
    'https://github.com/org/repo/issues/7',
  );
  assert.strictEqual(
    extractLinearSourceUrl({
      attachments: [],
      description: 'Related https://github.com/Org/Repo/issues/8 then https://github.com/Org/Repo/issues/9',
      title: '[GH-#9] Exact identity',
    }),
    'https://github.com/org/repo/issues/9',
  );

  const preserved = upsertManagedBlock('Human-owned context', {
    ...githubIssue(),
    state: 'open',
  });
  assert.ok(preserved.startsWith('Human-owned context'));
  assert.strictEqual((preserved.match(new RegExp(MANAGED_START, 'g')) || []).length, 1);
  const changed = upsertManagedBlock(preserved, {
    ...githubIssue({ body: 'Changed body' }),
    state: 'open',
  });
  assert.ok(changed.includes('Human-owned context'));
  assert.ok(!changed.includes('Changed body'));
  assert.ok(!changed.includes('Original body'));
  assert.strictEqual((changed.match(new RegExp(MANAGED_START, 'g')) || []).length, 1);
  expectCode(
    () => upsertManagedBlock(`bad ${MANAGED_START}`, { ...githubIssue(), state: 'open' }),
    'MALFORMED_MANAGED_BLOCK',
  );
  expectCode(
    () =>
      upsertManagedBlock(`${preserved}\n${preserved}`, { ...githubIssue(), state: 'open' }),
    'MALFORMED_MANAGED_BLOCK',
  );

  const firstPlan = buildReconciliationPlan({
    githubIssues: [githubIssue()],
    linearIssues: [],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.deepStrictEqual(firstPlan.stats, {
    creates: 1,
    githubIssues: 1,
    linearIssues: 0,
    mutations: 1,
    skippedClosedUntracked: 0,
    updates: 0,
  });
  assert.strictEqual(firstPlan.creates[0].input.projectId, PROJECT_ID);
  assert.strictEqual(firstPlan.creates[0].input.stateId, STATE_IDS.open);
  assert.ok(!firstPlan.creates[0].input.description.includes('Original body'));
  assert.ok(firstPlan.creates[0].input.description.includes('Canonical details: GitHub'));

  const historicalClosedPlan = buildReconciliationPlan({
    githubIssues: [githubIssue({ state: 'CLOSED' })],
    linearIssues: [],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.strictEqual(historicalClosedPlan.stats.creates, 0);
  assert.strictEqual(historicalClosedPlan.stats.mutations, 0);
  assert.strictEqual(historicalClosedPlan.stats.skippedClosedUntracked, 1);

  const source = githubIssue();
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [source],
        linearIssues: [
          linearIssue(source, { id: 'one', identifier: 'AGENT-1' }),
          linearIssue(source, { id: 'two', identifier: 'AGENT-2' }),
        ],
        projectId: PROJECT_ID,
        stateIds: STATE_IDS,
      }),
    'DUPLICATE_LINEAR_IDENTITY',
  );
  const duplicateTerminalPlan = buildReconciliationPlan({
    githubIssues: [source],
    linearIssues: [
      linearIssue(source, { id: 'canonical', identifier: 'AGENT-1' }),
      linearIssue(source, {
        id: 'duplicate',
        identifier: 'AGENT-2',
        state: { id: 'state-duplicate', type: 'duplicate' },
      }),
    ],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.strictEqual(duplicateTerminalPlan.stats.mutations, 0);
  const canceledTerminalPlan = buildReconciliationPlan({
    githubIssues: [source],
    linearIssues: [
      linearIssue(source, { id: 'canonical', identifier: 'AGENT-1' }),
      linearIssue(source, {
        id: 'canceled',
        identifier: 'AGENT-2',
        state: { id: 'state-canceled', type: 'canceled' },
      }),
    ],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.strictEqual(canceledTerminalPlan.stats.mutations, 0);
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [source, clone(source)],
        linearIssues: [],
        projectId: PROJECT_ID,
        stateIds: STATE_IDS,
      }),
    'DUPLICATE_GITHUB_IDENTITY',
  );
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [githubIssue({ url: 'not-a-url' })],
        linearIssues: [],
        projectId: PROJECT_ID,
        stateIds: STATE_IDS,
      }),
    'INVALID_GITHUB_ISSUE',
  );
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [githubIssue({ number: 0 })],
        linearIssues: [],
        projectId: PROJECT_ID,
        stateIds: STATE_IDS,
      }),
    'INVALID_GITHUB_ISSUE',
  );
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [githubIssue({ state: 'MERGED' })],
        linearIssues: [],
        projectId: PROJECT_ID,
        stateIds: STATE_IDS,
      }),
    'INVALID_GITHUB_ISSUE',
  );
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [source],
        linearIssues: [],
        projectId: null,
        stateIds: STATE_IDS,
      }),
    'MISSING_PROJECT',
  );
  expectCode(
    () =>
      buildReconciliationPlan({
        githubIssues: [source],
        linearIssues: [],
        projectId: PROJECT_ID,
        stateIds: { open: STATE_IDS.open },
      }),
    'MISSING_STATES',
  );

  const driftPlan = buildReconciliationPlan({
    githubIssues: [source],
    linearIssues: [
      linearIssue(source, {
        description: `Human notes ${source.url}`,
        project: { id: 'wrong-project' },
        state: { id: 'started', type: 'started' },
        title: 'Old title',
      }),
    ],
    projectId: PROJECT_ID,
    stateIds: STATE_IDS,
  });
  assert.strictEqual(driftPlan.stats.updates, 1);
  assert.strictEqual(driftPlan.updates[0].input.projectId, PROJECT_ID);
  assert.ok(driftPlan.updates[0].input.description.startsWith('Human notes'));
  assert.strictEqual(driftPlan.updates[0].input.stateId, undefined, 'active workflow state is preserved');

  const fixtureGithub = [githubIssue()];
  const fixtureLinear = [];
  const adapter = createMemoryAdapter(fixtureGithub, fixtureLinear);
  const applyOptions = {
    apply: true,
    confirmProject: 'Safety',
    maxMutations: 10,
    project: 'Safety',
    repo: 'a/b',
    team: 'AGENT',
  };
  const firstRun = await executeReconciliation(applyOptions, adapter);
  assert.strictEqual(firstRun.applied, true);
  assert.strictEqual(firstRun.plan.stats.creates, 1);
  assert.strictEqual(adapter.writes.length, 1);
  const secondRun = await executeReconciliation(applyOptions, adapter);
  assert.strictEqual(secondRun.plan.stats.mutations, 0);
  assert.strictEqual(adapter.writes.length, 1, 'second identical run must write nothing');

  fixtureGithub[0].state = 'CLOSED';
  const closedRun = await executeReconciliation(applyOptions, adapter);
  assert.strictEqual(closedRun.plan.stats.updates, 1);
  assert.strictEqual(fixtureLinear.length, 1, 'closing must update the same Linear identity');
  assert.strictEqual(fixtureLinear[0].state.type, 'completed');
  fixtureGithub[0].state = 'OPEN';
  const reopenedRun = await executeReconciliation(applyOptions, adapter);
  assert.strictEqual(reopenedRun.plan.stats.updates, 1);
  assert.strictEqual(fixtureLinear.length, 1, 'reopening must retain the same Linear identity');
  assert.strictEqual(fixtureLinear[0].state.type, 'backlog');

  const dryAdapter = createMemoryAdapter([githubIssue()], []);
  const dryRun = await executeReconciliation(
    { ...applyOptions, apply: false, maxMutations: 10 },
    dryAdapter,
  );
  assert.strictEqual(dryRun.applied, false);
  assert.strictEqual(dryRun.plan.stats.creates, 1);
  assert.strictEqual(dryAdapter.writes.length, 0, 'dry-run must never mutate');

  const limitedAdapter = createMemoryAdapter([githubIssue()], []);
  await assert.rejects(
    executeReconciliation({ ...applyOptions, maxMutations: 0 }, limitedAdapter),
    (error) => error instanceof ReconcileError && error.code === 'MUTATION_LIMIT',
  );
  assert.strictEqual(limitedAdapter.writes.length, 0, 'mutation limit must fail before writes');
  await assert.rejects(
    executeReconciliation({ ...applyOptions, confirmProject: null }, limitedAdapter),
    (error) => error instanceof ReconcileError && error.code === 'CONFIRMATION_REQUIRED',
  );
  assert.strictEqual(limitedAdapter.writes.length, 0, 'programmatic apply also requires confirmation');

  const ghPages = JSON.stringify([
    [
      { html_url: githubIssue().url, number: 42, state: 'open', title: 'Issue' },
      { html_url: 'https://github.com/a/b/pull/1', number: 1, pull_request: {}, state: 'open' },
    ],
  ]);
  let ghArgs;
  const loadedGithub = loadGithubIssues('a/b', (_command, args) => {
    ghArgs = args;
    return ghPages;
  });
  assert.strictEqual(loadedGithub.length, 1);
  assert.ok(ghArgs.includes('--paginate'));

  const queryCalls = [];
  const queryLinear = async (_apiKey, query, variables) => {
    queryCalls.push({ query, variables });
    if (query.includes('ReconcileMetadata')) {
      return {
        projects: { nodes: [{ id: PROJECT_ID, name: 'Safety', teams: { nodes: [{ id: 'team-1' }] } }] },
        teams: {
          nodes: [
            {
              id: 'team-1',
              key: 'AGENT',
              states: {
                nodes: [
                  { id: STATE_IDS.open, name: 'Backlog', type: 'backlog' },
                  { id: STATE_IDS.closed, name: 'Done', type: 'completed' },
                ],
              },
            },
          ],
        },
      };
    }
    const firstPage = variables.after === null;
    return {
      issues: {
        nodes: firstPage ? [linearIssue()] : [],
        pageInfo: { endCursor: firstPage ? 'next' : null, hasNextPage: firstPage },
      },
    };
  };
  const loadedLinear = await loadLinearContext('secret-not-logged', 'AGENT', 'Safety', queryLinear);
  assert.strictEqual(loadedLinear.linearIssues.length, 1);
  assert.strictEqual(queryCalls.length, 3, 'metadata plus two issue pages');
  await assert.rejects(
    loadLinearContext('key', 'AGENT', 'Safety', async (_key, query) => {
      if (query.includes('ReconcileMetadata')) return { projects: { nodes: [] }, teams: { nodes: [] } };
      throw new Error('unexpected');
    }),
    (error) => error instanceof ReconcileError && error.code === 'TEAM_AMBIGUOUS',
  );
  const metadataResult = (projects, teams) => async (_key, query) => {
    if (query.includes('ReconcileMetadata')) return { projects: { nodes: projects }, teams: { nodes: teams } };
    throw new Error('unexpected');
  };
  const validTeam = {
    id: 'team-1',
    states: {
      nodes: [
        { id: STATE_IDS.open, type: 'backlog' },
        { id: STATE_IDS.closed, type: 'completed' },
      ],
    },
  };
  await assert.rejects(
    loadLinearContext('key', 'AGENT', 'Safety', metadataResult([], [validTeam])),
    (error) => error instanceof ReconcileError && error.code === 'PROJECT_AMBIGUOUS',
  );
  await assert.rejects(
    loadLinearContext(
      'key',
      'AGENT',
      'Safety',
      metadataResult([{ id: PROJECT_ID, teams: { nodes: [{ id: 'other-team' }] } }], [validTeam]),
    ),
    (error) => error instanceof ReconcileError && error.code === 'PROJECT_TEAM_MISMATCH',
  );
  await assert.rejects(
    loadLinearContext(
      'key',
      'AGENT',
      'Safety',
      metadataResult(
        [{ id: PROJECT_ID, teams: { nodes: [{ id: 'team-1' }] } }],
        [{ id: 'team-1', states: { nodes: [{ id: STATE_IDS.open, type: 'backlog' }] } }],
      ),
    ),
    (error) => error instanceof ReconcileError && error.code === 'MISSING_STATES',
  );

  const fetchCalls = [];
  const graphData = await linearGraphql(
    'secret-not-logged',
    'query { viewer { id } }',
    {},
    async (url, options) => {
      fetchCalls.push({ options, url });
      return { json: async () => ({ data: { viewer: { id: 'viewer-1' } } }), ok: true, status: 200 };
    },
  );
  assert.strictEqual(graphData.viewer.id, 'viewer-1');
  assert.strictEqual(fetchCalls[0].url, 'https://api.linear.app/graphql');
  assert.strictEqual(fetchCalls[0].options.headers.Authorization, 'secret-not-logged');
  await assert.rejects(
    linearGraphql('key', 'bad', {}, async () => ({
      json: async () => ({ errors: [{ message: 'synthetic GraphQL failure' }] }),
      ok: true,
      status: 200,
    })),
    (error) => error instanceof ReconcileError && error.code === 'LINEAR_GRAPHQL',
  );
  await assert.rejects(
    linearGraphql('key', 'bad-http', {}, async () => ({
      json: async () => ({}),
      ok: false,
      status: 503,
    })),
    (error) => error instanceof ReconcileError && error.code === 'LINEAR_GRAPHQL',
  );

  const mutationQueries = [];
  const liveAdapter = createLiveAdapter({
    apiKey: 'secret-not-logged',
    loadGithubIssues: async () => [githubIssue()],
    queryLinear: async (_key, query, variables) => {
      mutationQueries.push({ query, variables });
      if (query.includes('ReconcileMetadata') || query.includes('ReconcileIssues')) {
        return queryLinear(_key, query, variables);
      }
      if (query.includes('ReconcileCreate')) {
        return { issueCreate: { issue: { id: 'created' }, success: true } };
      }
      if (query.includes('ReconcileUpdate')) {
        return { issueUpdate: { issue: { id: variables.id }, success: true } };
      }
      throw new Error('unexpected query');
    },
  });
  await liveAdapter.loadLinearContext('AGENT', 'Safety');
  await liveAdapter.createLinearIssue({
    description: 'managed',
    projectId: PROJECT_ID,
    stateId: STATE_IDS.open,
    title: 'title',
  });
  await liveAdapter.updateLinearIssue('existing', { title: 'updated' });
  const createMutation = mutationQueries.find((call) => call.query.includes('ReconcileCreate'));
  assert.strictEqual(createMutation.variables.input.teamId, 'team-1');
  const failingAdapter = createLiveAdapter({
    apiKey: 'secret-not-logged',
    queryLinear: async (_key, query) => {
      if (query.includes('ReconcileCreate')) return { issueCreate: { success: false } };
      if (query.includes('ReconcileUpdate')) return { issueUpdate: { success: false } };
      throw new Error('unexpected query');
    },
  });
  await assert.rejects(
    failingAdapter.createLinearIssue({ title: 'x' }),
    (error) => error instanceof ReconcileError && error.code === 'LINEAR_CREATE_FAILED',
  );
  await assert.rejects(
    failingAdapter.updateLinearIssue('x', { title: 'x' }),
    (error) => error instanceof ReconcileError && error.code === 'LINEAR_UPDATE_FAILED',
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-linear-lock-'));
  const lockPath = path.join(tempDir, 'reconcile.lock');
  let releaseFirst;
  const firstLock = withAtomicLock(
    lockPath,
    () => new Promise((resolve) => {
      releaseFirst = resolve;
    }),
  );
  while (!fs.existsSync(lockPath)) await new Promise((resolve) => setTimeout(resolve, 1));
  await assert.rejects(
    withAtomicLock(lockPath, async () => {}),
    (error) => error instanceof ReconcileError && error.code === 'LOCKED',
  );
  releaseFirst();
  await firstLock;
  assert.strictEqual(fs.existsSync(lockPath), false, 'lock must release after success');
  fs.rmSync(tempDir, { recursive: true });

  const failedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-linear-lock-fail-'));
  const failedLockPath = path.join(failedDir, 'reconcile.lock');
  await assert.rejects(withAtomicLock(failedLockPath, async () => {
    throw new Error('synthetic failure');
  }), /synthetic failure/);
  assert.strictEqual(fs.existsSync(failedLockPath), false, 'lock must release after failure');
  fs.rmSync(failedDir, { recursive: true });

  console.log('ok test-github-linear-reconcile.js');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
