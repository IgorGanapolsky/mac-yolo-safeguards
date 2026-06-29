#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildBrief,
  parseFileLocks,
  parsePlanTasks,
  redact,
  renderMarkdown,
  writeOutputs,
} = require('../tools/agent-sync-brief');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function makeFixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sync-brief-'));
  const fakePat = `ghp_${'1'.repeat(36)}`;
  fs.mkdirSync(path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# AGENTS\n\nClaim files first.\n');
  fs.writeFileSync(path.join(repo, 'OBSIDIAN.md'), '# OBSIDIAN\n\nRead the sync note.\n');
  fs.writeFileSync(path.join(repo, 'plan.md'), `# plan.md

## 1. Task Board

| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |
|-----|------|--------|-------|---------------|-----------------|
| T-1 | Active sync | in_progress | codex | \`tools/agent-sync-brief.js\` | test passes |
| T-2 | Blocked mobile | blocked | gemini | \`hermes-mobile/src/context/GatewayContext.tsx\` | owner releases |
| T-3 | Finished | done | antigravity | \`docs/done.md\` | done |

## 2. File Ownership Map

- \`tools/agent-sync-brief.js\` → **codex** (T-1)
- \`hermes-mobile/src/context/GatewayContext.tsx\` → **gemini** (T-2) — DO NOT EDIT
- \`docs/done.md\` → **antigravity** (T-3) — released (2026-06-29)
- everything else → (free)

## 3. Decisions Log

- 2026-06-29 \`codex\`: Added sync packet idea with TOKEN=${fakePat}.
`);
  fs.writeFileSync(
    path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json'),
    JSON.stringify({ e2e: 'pass', unit: 'pass', checkedAt: '2026-06-29T00:00:00.000Z' }),
  );
  return repo;
}

test('parsePlanTasks extracts task board rows', () => {
  const plan = fs.readFileSync(path.join(makeFixtureRepo(), 'plan.md'), 'utf8');
  const tasks = parsePlanTasks(plan);
  assert.strictEqual(tasks.length, 3);
  assert.strictEqual(tasks[0].id, 'T-1');
  assert.strictEqual(tasks[1].status, 'blocked');
});

test('parseFileLocks excludes released and free rows from active locks', () => {
  const plan = fs.readFileSync(path.join(makeFixtureRepo(), 'plan.md'), 'utf8');
  const locks = parseFileLocks(plan);
  assert.strictEqual(locks.length, 3);
  assert.deepStrictEqual(locks.map((lock) => lock.active), [true, true, false]);
});

test('redact strips common credential forms', () => {
  const fakePat = `ghp_${'2'.repeat(36)}`;
  const fakeOpenAiKey = `sk-${'3'.repeat(24)}`;
  const input = `GITHUB_TOKEN=${fakePat} and ${fakeOpenAiKey}`;
  const output = redact(input);
  assert.doesNotMatch(output, /ghp_/);
  assert.doesNotMatch(output, /sk-123/);
  assert.match(output, /\[REDACTED\]/);
});

test('buildBrief includes source-backed state and blockers', () => {
  const repo = makeFixtureRepo();
  const brief = buildBrief({ repo, skipLaunchctl: true });
  assert.strictEqual(brief.schema, 'hermes-agent-sync-brief/v1');
  assert.strictEqual(brief.plan.activeTasks.length, 2);
  assert.match(brief.blockers.join('\n'), /Blocked mobile/);
  assert.strictEqual(brief.protectedState.latestE2e.e2e, 'pass');
  assert.ok(brief.sources.some((source) => source.label === 'coordination board' && source.exists));
  assert.doesNotMatch(JSON.stringify(brief), /ghp_/);
});

test('renderMarkdown gives Obsidian-readable sections', () => {
  const repo = makeFixtureRepo();
  const markdown = renderMarkdown(buildBrief({ repo, skipLaunchctl: true }));
  assert.match(markdown, /^# Hermes Agent Sync/m);
  assert.match(markdown, /## Active Tasks/);
  assert.match(markdown, /## Sources/);
  assert.doesNotMatch(markdown, /ghp_/);
});

test('writeOutputs writes markdown and json artifacts including vault note', () => {
  const repo = makeFixtureRepo();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sync-out-'));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sync-vault-'));
  const brief = buildBrief({ repo, skipLaunchctl: true });
  const outputs = writeOutputs(brief, { outDir, vault, notePath: path.join('AI Agents', 'Sync.md'), noWrite: false });
  assert.strictEqual(outputs.writes.length, 4);
  assert.ok(fs.existsSync(path.join(outDir, 'Hermes-Agent-Sync.md')));
  assert.ok(fs.existsSync(path.join(outDir, 'Hermes-Agent-Sync.json')));
  assert.ok(fs.existsSync(path.join(vault, 'AI Agents', 'Sync.md')));
  assert.ok(fs.existsSync(path.join(vault, 'AI Agents', 'Sync.json')));
});
