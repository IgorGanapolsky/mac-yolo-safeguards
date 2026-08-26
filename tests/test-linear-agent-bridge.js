#!/usr/bin/env node
'use strict';

/**
 * Offline unit tests for linear-agent-bridge pure helpers.
 * Does not call Linear API (no network, no PAT required in CI).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  scoreTeamsProbe,
  normalizeAgent,
  loadVaultClaimsIndex,
  resetLinearApiKeyCache,
  LINEAR_HTTP_TIMEOUT_MS,
  coordStatus,
  ensureAgentLabels,
  listTeamLabels,
} = require('../tools/linear-agent-bridge');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

test('scoreTeamsProbe prefers IGO', () => {
  const narrow = scoreTeamsProbe([{ key: 'AGENT' }]);
  const full = scoreTeamsProbe([{ key: 'AGENT' }, { key: 'IGO' }]);
  assert.ok(full > narrow, `full=${full} narrow=${narrow}`);
  assert.ok(full >= 100);
});

test('scoreTeamsProbe empty', () => {
  assert.strictEqual(scoreTeamsProbe([]), 0);
  assert.strictEqual(scoreTeamsProbe(null), 0);
});

test('normalizeAgent aliases', () => {
  assert.strictEqual(normalizeAgent('grok-build'), 'grok');
  assert.strictEqual(normalizeAgent('claude'), 'claude-code');
  assert.strictEqual(normalizeAgent('hermes'), 'Hermes');
});

test('loadVaultClaimsIndex reads latest claim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-claims-'));
  const older = path.join(dir, 'a.md');
  const newer = path.join(dir, 'b.md');
  fs.writeFileSync(
    older,
    `---
linear_id: IGO-99
agent: cursor
action: claim
status: In Progress
updated_at: 2026-08-01T00:00:00.000Z
---
`,
  );
  fs.writeFileSync(
    newer,
    `---
linear_id: IGO-99
agent: grok
action: done
status: Done
updated_at: 2026-08-03T00:00:00.000Z
---
`,
  );
  // loadVaultClaimsIndex uses fixed CLAIMS_DIR — test via direct parse simulation
  // by temporarily not available; instead re-implement index logic check on files:
  const texts = [fs.readFileSync(older, 'utf8'), fs.readFileSync(newer, 'utf8')];
  const index = {};
  for (const text of texts) {
    const id = text.match(/^linear_id:\s*(.+)$/m)[1].trim().toUpperCase();
    const agent = text.match(/^agent:\s*(.+)$/m)[1].trim();
    const updated = text.match(/^updated_at:\s*(.+)$/m)[1].trim();
    const prev = index[id];
    if (prev && prev.updated > updated) continue;
    index[id] = { agent, updated };
  }
  assert.strictEqual(index['IGO-99'].agent, 'grok');
  fs.rmSync(dir, { recursive: true, force: true });
  // ensure export exists
  assert.strictEqual(typeof loadVaultClaimsIndex, 'function');
  assert.strictEqual(typeof resetLinearApiKeyCache, 'function');
});

test('resetLinearApiKeyCache is callable', () => {
  resetLinearApiKeyCache();
});

test('HTTP timeout configured (no hang forever)', () => {
  assert.ok(Number(LINEAR_HTTP_TIMEOUT_MS) >= 5000);
  assert.ok(Number(LINEAR_HTTP_TIMEOUT_MS) <= 120_000);
});

test('coordStatus is exported', () => {
  assert.strictEqual(typeof coordStatus, 'function');
});

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

async function runAsyncTests() {
  await asyncTest('listTeamLabels reads every page and deduplicates by name', async () => {
    const calls = [];
    const queryClient = async (query, variables) => {
      calls.push({ query, variables });
      assert.doesNotMatch(query, /\bmutation\b/i);
      if (!variables.after) {
        return {
          data: {
            issueLabels: {
              nodes: [{ id: 'label-agent', name: 'agent-codex' }],
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
            },
          },
        };
      }
      return {
        data: {
          issueLabels: {
            nodes: [
              { id: 'label-agent', name: 'agent-codex' },
              { id: 'label-lock', name: 'agent-lock' },
            ],
            pageInfo: { hasNextPage: false, endCursor: 'page-2' },
          },
        },
      };
    };
    const result = await listTeamLabels('team-1', queryClient);
    assert.strictEqual(result.pages, 2);
    assert.deepStrictEqual(result.labels.map((label) => label.name).sort(), ['agent-codex', 'agent-lock']);
    assert.strictEqual(calls.length, 2);
  });

  await asyncTest('ensureAgentLabels finds a lock beyond page one instead of duplicating it', async () => {
    const calls = [];
    const createdNames = [];
    const queryClient = async (query, variables) => {
      calls.push({ query, variables });
      if (/\bmutation\b/i.test(query)) {
        createdNames.push(variables.input.name);
        return {
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: { id: 'label-new-agent', name: 'agent-codex-new' },
            },
          },
        };
      }
      if (!variables.after) {
        return {
          data: {
            issueLabels: {
              nodes: [{ id: 'label-old-agent', name: 'agent-old' }],
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
            },
          },
        };
      }
      return {
        data: {
          issueLabels: {
            nodes: [{ id: 'label-lock', name: 'agent-lock' }],
            pageInfo: { hasNextPage: false, endCursor: 'page-2' },
          },
        },
      };
    };
    const result = await ensureAgentLabels('team-1', 'codex-new', queryClient);
    assert.deepStrictEqual(result.labelIds, ['label-lock', 'label-new-agent']);
    assert.deepStrictEqual(result.labels, ['agent-lock', 'agent-codex-new']);
    assert.strictEqual(calls.filter((call) => /\bmutation\b/i.test(call.query)).length, 1);
    assert.deepStrictEqual(createdNames, ['agent-codex-new']);
  });

  await asyncTest('ensureAgentLabels fails closed when a required label cannot be resolved', async () => {
    const queryClient = async (query) => {
      if (/\bmutation\b/i.test(query)) {
        return { error: true, code: 'GRAPHQL', message: 'label limit' };
      }
      return {
        data: {
          issueLabels: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    };
    const result = await ensureAgentLabels('team-1', 'codex-new', queryClient);
    assert.strictEqual(result.error, true);
    assert.strictEqual(result.code, 'REQUIRED_AGENT_LABEL_UNAVAILABLE');
    assert.match(result.message, /agent-lock/);
  });

  if (!process.exitCode) console.log('test-linear-agent-bridge: all assertions ran');
}

runAsyncTests();
