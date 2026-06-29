#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REQUIRED_PATHS,
  buildConditions,
  buildManifest,
  compileVault,
  estimateTokens,
  extractRecentDecisions,
  parseArgs,
  validateVault,
} = require('../tools/hermes-ai-vault');

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

function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ai-vault-repo-'));
  const files = {
    'AGENTS.md': '# AGENTS\n\nClaim before editing. TOKEN=ghp_' + '1'.repeat(36) + '\n',
    'plan.md': `# plan

| ID | Task | Status | Owner | Files (claim) | AcceptanceCheck |
|----|------|--------|-------|---------------|-----------------|
| T-1 | Build vault | in_progress | codex | \`tools/hermes-ai-vault.js\` | tests pass |

## Decisions

- 2026-06-29 \`codex\`: Built AI vault bridge.
`,
    'OBSIDIAN.md': '# Obsidian\n\nUse Markdown notes as shared context.\n',
    'docs/AGENT-SYNC-BRIEF.md': '# Agent Sync Brief\n',
    'docs/RECURSIVE-EXPERIMENT-LOOP.md': '# Recursive Loop\n',
    'docs/HERMES-LOOP-ENGINE.md': '# Hermes Loop Engine\n',
    'tools/agent-sync-brief.js': 'module.exports = {};\n',
    'tests/test-agent-sync-brief.js': 'console.log("pass");\n',
    'tools/recursive-experiment-loop.js': 'module.exports = {};\n',
    'tests/test-recursive-experiment-loop.js': 'console.log("pass");\n',
    'hermes-mobile/docs/proofs/continuous/latest.json': JSON.stringify({ e2e: 'pass', unit: 'pass' }),
  };
  for (const [relativePath, text] of Object.entries(files)) {
    const filePath = path.join(repo, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
  }
  return repo;
}

test('estimateTokens uses compact deterministic heuristic', () => {
  assert.strictEqual(estimateTokens('abcd'), 1);
  assert.strictEqual(estimateTokens('abcde'), 2);
});

test('buildManifest inventories local source candidates and redacts secrets', () => {
  const repo = fixtureRepo();
  const manifest = buildManifest(repo);
  assert.strictEqual(manifest.sources.find((source) => source.id === 'agent-directives').exists, true);
  const sourceIndex = JSON.stringify(manifest);
  assert.doesNotMatch(sourceIndex, /ghp_/);
});

test('extractRecentDecisions keeps newest decision rows', () => {
  const decisions = extractRecentDecisions('- 2026-06-28 `a`: old\n- 2026-06-29 `b`: new\n');
  assert.deepStrictEqual(decisions, ['2026-06-28 `a`: old', '2026-06-29 `b`: new']);
});

test('buildConditions emits Kubernetes-style observed status rows', () => {
  const manifest = buildManifest(fixtureRepo());
  const conditions = buildConditions({
    manifest,
    syncBrief: { plan: { activeTasks: [] }, git: { branch: 'main', dirtyCount: 0 } },
    validation: {
      ok: true,
      fileCount: 12,
      required: { missing: [] },
      secretFindings: [],
    },
    generation: 3,
  });
  assert(conditions.some((condition) => condition.type === 'SourceInventoryReady' && condition.status === 'True'));
  assert(conditions.every((condition) => condition.observedGeneration === 3));
});

test('compileVault writes required Markdown and JSON files', () => {
  const repo = fixtureRepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ai-vault-out-'));
  const result = compileVault({ repo, out });
  assert.strictEqual(result.ok, true);
  for (const relativePath of REQUIRED_PATHS) {
    assert.ok(fs.existsSync(path.join(out, relativePath)), `${relativePath} should exist`);
  }
  assert.match(fs.readFileSync(path.join(out, 'Context Packs/Token Efficiency Context.md'), 'utf8'), /Source Token Estimates/);
  assert.match(fs.readFileSync(path.join(out, 'Status/Vault Conditions.md'), 'utf8'), /Observed Generation/);
});

test('validateVault catches missing required files', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ai-vault-empty-'));
  const validation = validateVault(out);
  assert.strictEqual(validation.ok, false);
  assert(validation.required.missing.includes('README.md'));
});

test('compiled vault redacts token-shaped source content', () => {
  const repo = fixtureRepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ai-vault-redact-'));
  compileVault({ repo, out });
  const files = fs.readdirSync(path.join(out, 'Context Packs'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(out, 'Context Packs', file), 'utf8');
    assert.doesNotMatch(text, /ghp_/);
  }
});

test('parseArgs supports build and validate modes', () => {
  const buildArgs = parseArgs(['build', '--out', '/tmp/vault', '--json']);
  assert.strictEqual(buildArgs._[0], 'build');
  assert.strictEqual(buildArgs.out, '/tmp/vault');
  assert.strictEqual(buildArgs.json, true);
  const validateArgs = parseArgs(['validate', '--vault', '/tmp/vault']);
  assert.strictEqual(validateArgs._[0], 'validate');
  assert.strictEqual(validateArgs.vault, '/tmp/vault');
});
