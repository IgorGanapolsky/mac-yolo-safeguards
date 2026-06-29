#!/usr/bin/env node
'use strict';

/**
 * Hermes AI Vault compiler
 *
 * Builds a vendor-agnostic Markdown vault that Claude, Codex, Gemini, GPT,
 * Ollama-backed agents, Hermes, and Obsidian can all read as plain files.
 *
 * Bounded by design: local source files only, no external connector ingestion,
 * no emails/messages/payments, and no original-source mutation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBrief, redact } = require('./agent-sync-brief');
const { planExperiments } = require('./recursive-experiment-loop');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(DEFAULT_REPO, 'artifacts', 'hermes-ai-vault');

const REQUIRED_PATHS = [
  'README.md',
  'AGENTS.md',
  'SOURCE-MANIFEST.md',
  'VALIDATION-REPORT.md',
  'state.json',
  'Context Packs/Hermes Operating Context.md',
  'Context Packs/LLM Routing Context.md',
  'Context Packs/Token Efficiency Context.md',
  'Procedures/Agent Sync Procedure.md',
  'Procedures/Experiment Loop Procedure.md',
  'Decisions/Recent Decisions.md',
  'Status/Vault Conditions.md',
  'Sources/source-index.json',
];

const SOURCE_CANDIDATES = [
  { id: 'agent-directives', path: 'AGENTS.md', role: 'canonical agent directive' },
  { id: 'coordination-board', path: 'plan.md', role: 'live task board and ownership map' },
  { id: 'obsidian-index', path: 'OBSIDIAN.md', role: 'Obsidian AI Agent entrypoint' },
  { id: 'agent-sync-brief-doc', path: 'docs/AGENT-SYNC-BRIEF.md', role: 'sync packet contract' },
  { id: 'recursive-loop-doc', path: 'docs/RECURSIVE-EXPERIMENT-LOOP.md', role: 'experiment loop contract' },
  { id: 'loop-engine-doc', path: 'docs/HERMES-LOOP-ENGINE.md', role: 'Hermes task loop contract' },
  { id: 'latest-e2e', path: 'hermes-mobile/docs/proofs/continuous/latest.json', role: 'latest mobile proof state' },
];

function usage() {
  return `Usage:
  node tools/hermes-ai-vault.js build [--repo PATH] [--out PATH] [--json]
  node tools/hermes-ai-vault.js validate [--vault PATH] [--json]

Builds a local Markdown vault for shared AI context. Defaults to:
  artifacts/hermes-ai-vault/`;
}

function parseArgs(argv) {
  const args = { _: [], repo: DEFAULT_REPO, out: DEFAULT_OUT, vault: DEFAULT_OUT, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--out') {
      args.out = path.resolve(requireValue(argv, ++i, arg));
      args.vault = args.out;
    } else if (arg === '--vault') args.vault = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else args._.push(arg);
  }
  if (args._.length === 0) args._.push('build');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readSource(repo, candidate) {
  const absolutePath = path.join(repo, candidate.path);
  if (!fs.existsSync(absolutePath)) {
    return { ...candidate, absolutePath, exists: false };
  }
  const stat = fs.statSync(absolutePath);
  const text = redact(fs.readFileSync(absolutePath, 'utf8'));
  return {
    ...candidate,
    absolutePath,
    exists: true,
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
    shaHint: `${stat.size}:${Math.round(stat.mtimeMs)}`,
    text,
  };
}

function excerpt(text, max = 1200) {
  const clean = redact(String(text || '').replace(/\s+\n/g, '\n').trim());
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}\n\n[excerpt truncated; read source file for full context]`;
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function extractRecentDecisions(planText, limit = 10) {
  return String(planText || '')
    .split('\n')
    .filter((line) => /^- 20\d\d-\d\d-\d\d /.test(line))
    .slice(-limit)
    .map((line) => redact(line.replace(/^-\s*/, '').trim()));
}

function buildManifest(repo) {
  const sources = SOURCE_CANDIDATES.map((candidate) => readSource(repo, candidate));
  return {
    generatedAt: new Date().toISOString(),
    repo,
    hostname: os.hostname(),
    sources: sources.map((source) => ({
      id: source.id,
      path: source.path,
      role: source.role,
      exists: source.exists,
      sizeBytes: source.sizeBytes || 0,
      mtime: source.mtime || null,
      shaHint: source.shaHint || null,
    })),
    blockedConnectors: [
      'External email/message/payment/browser connector ingestion is intentionally out of scope for this compiler.',
    ],
  };
}

function markdownFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${JSON.stringify(String(item))}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function renderReadme(manifest) {
  return `${markdownFrontmatter({
    type: 'vault-readme',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
  })}# Hermes AI Vault

This vault is a vendor-agnostic shared brain for Hermes and our LLM tools.
It is plain Markdown plus JSON so Codex, Claude, Gemini, GPT, Ollama-local
agents, Hermes, and Obsidian can all read the same context without a proprietary
runtime.

## Read Order

1. [[AGENTS]]
2. [[Context Packs/Hermes Operating Context]]
3. [[Context Packs/LLM Routing Context]]
4. [[Procedures/Agent Sync Procedure]]
5. [[Procedures/Experiment Loop Procedure]]
6. [[Decisions/Recent Decisions]]
7. [[SOURCE-MANIFEST]]
8. [[VALIDATION-REPORT]]

## Boundaries

- This vault is context, not proof of money, messages, deploys, merges, or CI.
- Broad ingestion from external connectors requires explicit approval.
- Original source files are not mutated by this compiler.
- Every promoted context pack must name provenance in SOURCE-MANIFEST.md.
`;
}

function renderAgents(manifest) {
  return `${markdownFrontmatter({
    type: 'agent-directive',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
  })}# AGENTS

## Universal Rule

Before any agent acts, read this file, SOURCE-MANIFEST.md, and the relevant
context pack. If the task touches the repo, read the live repo AGENTS.md and
plan.md too.

## LLM Operating Modes

- **Codex / code agents:** use repo source, run tests, cite files and commands.
- **Claude / Gemini / GPT:** use context packs for reasoning, but do not claim
  local execution unless a tool actually ran.
- **Ollama / local models:** use compact context packs and avoid browser or
  external connector assumptions.
- **Obsidian AI Agent:** edit vault notes only when asked; repo work still uses
  plan.md claims and git evidence.
- **Hermes:** coordinate actions through sync packets, experiment loops, and
  approval gates.

## Stop Gates

- Another agent owns the target file.
- Worktree has unowned dirty changes in the target path.
- The requested action would send, charge, refund, publish, deploy, merge, or
  kill an unknown process without approval.
- The answer would claim revenue, delivery, CI pass, external send, or release
  without provider/source evidence.
`;
}

function renderSourceManifest(manifest) {
  const rows = manifest.sources.map((source) => `| ${source.id} | ${source.exists ? 'yes' : 'no'} | \`${source.path}\` | ${source.role} | ${source.mtime || ''} |`);
  return `${markdownFrontmatter({
    type: 'source-manifest',
    source_status: 'generated',
    last_verified: manifest.generatedAt,
  })}# SOURCE-MANIFEST

Generated: ${manifest.generatedAt}
Repo: ${manifest.repo}
Host: ${manifest.hostname}

| Source | Exists | Path | Role | Modified |
|--------|--------|------|------|----------|
${rows.join('\n')}

## Blocked Connectors

${manifest.blockedConnectors.map((item) => `- ${item}`).join('\n')}
`;
}

function renderHermesContext({ manifest, sources, syncBrief, experimentPlan }) {
  const directives = sources.find((source) => source.id === 'agent-directives')?.text || '';
  const obsidian = sources.find((source) => source.id === 'obsidian-index')?.text || '';
  return `${markdownFrontmatter({
    type: 'context-pack',
    scope: 'Hermes operating context',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
    tags: ['hermes', 'agents', 'sync'],
  })}# Hermes Operating Context

## Use This When

Use this pack when an LLM needs to understand how Hermes, repo agents, Obsidian,
and local safeguards should coordinate.

## Essential Context

- Canonical directives live in AGENTS.md.
- Live ownership and in-progress work live in plan.md.
- Obsidian is a Markdown interface, not the synchronization authority.
- Sync packets are generated by tools/agent-sync-brief.js.
- Experiment loops are ranked by tools/recursive-experiment-loop.js.

## Current Sync Snapshot

- Branch: ${syncBrief.git.branch || 'unknown'}
- Head: ${syncBrief.git.head || 'unknown'}
- Dirty entries: ${syncBrief.git.dirtyCount}
- Active tasks: ${syncBrief.plan.activeTasks.length}
- Active locks: ${syncBrief.plan.activeLocks.length}

## Highest-Ranked Experiment

${experimentPlan.selected[0] ? `- ${experimentPlan.selected[0].id}: ${experimentPlan.selected[0].objective}` : '- No selected experiment.'}

## Directive Excerpt

${excerpt(directives)}

## Obsidian Excerpt

${excerpt(obsidian)}

## Provenance

- SOURCE-MANIFEST.md: agent-directives, coordination-board, obsidian-index
- Tools: tools/agent-sync-brief.js, tools/recursive-experiment-loop.js
`;
}

function renderRoutingContext({ manifest, experimentPlan }) {
  const selected = experimentPlan.selected.map((experiment) => `- ${experiment.id}: metric=${experiment.targetMetric}; evaluator=\`${experiment.evaluator}\``);
  return `${markdownFrontmatter({
    type: 'context-pack',
    scope: 'LLM routing and context selection',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
    tags: ['llm', 'routing', 'context'],
  })}# LLM Routing Context

## Routing Principles

- Use the smallest context pack that answers the task.
- Prefer source-backed Markdown over chat memory.
- Use code-capable agents for repository edits and tests.
- Use stronger reasoning models for ambiguous synthesis, audits, and risk calls.
- Use local/Ollama models only when the compact pack is enough and privacy or
  latency is more important than broad tool capability.

## Experiment-Gated Defaults

${selected.join('\n')}

## Privacy Boundaries

- Do not copy secrets into prompts or vault notes.
- Do not ingest external accounts unless connector identity and approval are
  recorded.
- Summarize sensitive operational data minimally and point to source provenance.

## Provenance

- SOURCE-MANIFEST.md: agent-directives, coordination-board
- Recursive plan generated from tools/recursive-experiment-loop.js
`;
}

function renderTokenEfficiencyContext({ manifest, sources }) {
  const rows = sources.map((source) => {
    const tokens = source.exists ? estimateTokens(source.text) : 0;
    const recommendation = tokens > 6000 ? 'use excerpt or targeted source query' : tokens > 2500 ? 'use only when directly relevant' : 'safe for compact prompt';
    return `| ${source.id} | ${source.exists ? 'yes' : 'no'} | ${tokens} | ${recommendation} |`;
  });

  return `${markdownFrontmatter({
    type: 'context-pack',
    scope: 'Token-efficient LLM context selection',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
    tags: ['llm', 'token-efficiency', 'arena'],
  })}# Token Efficiency Context

## Why This Exists

Agent Arena-style evaluation rewards useful work per token, not just raw task
completion. Hermes should load the smallest source-backed pack that can answer
the task, then fetch targeted source files only when needed.

## Context Budget Rules

- Start with README.md, AGENTS.md, and one task-specific context pack.
- Do not paste broad source dumps when a source manifest plus targeted excerpt
  is enough.
- Prefer JSON state for machine routing and Markdown packs for reasoning.
- If a pack exceeds the model's useful context window, ask the repo tools for a
  narrower source query instead of truncating blindly.
- Report evidence density: source files used, commands run, and tokens avoided
  when possible.

## Source Token Estimates

| Source | Exists | Est. Tokens | Recommendation |
|--------|--------|-------------|----------------|
${rows.join('\n')}

## Provenance

- SOURCE-MANIFEST.md
- Public Arena signal: token efficiency in agent evaluation
`;
}

function renderProcedure(title, body, manifest) {
  return `${markdownFrontmatter({
    type: 'procedure',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
  })}# ${title}

${body}

## Provenance

- SOURCE-MANIFEST.md
`;
}

function renderDecisions(manifest, planText) {
  const decisions = extractRecentDecisions(planText);
  return `${markdownFrontmatter({
    type: 'decision-log',
    source_status: 'source-backed',
    last_verified: manifest.generatedAt,
  })}# Recent Decisions

${decisions.length ? decisions.map((decision) => `- ${decision}`).join('\n') : '- No recent decisions found.'}

## Provenance

- SOURCE-MANIFEST.md: coordination-board
`;
}

function condition(type, status, reason, message, observedGeneration) {
  return {
    type,
    status,
    reason,
    message,
    observedGeneration,
    lastTransitionTime: new Date().toISOString(),
  };
}

function buildConditions({ manifest, syncBrief, validation, generation = 1 }) {
  const existingSources = manifest.sources.filter((source) => source.exists).length;
  return [
    condition(
      'SourceInventoryReady',
      existingSources >= 3 ? 'True' : 'False',
      existingSources >= 3 ? 'MinimumSourcesFound' : 'InsufficientSources',
      `${existingSources}/${manifest.sources.length} source candidates exist.`,
      generation,
    ),
    condition(
      'AgentSyncReadable',
      syncBrief.plan.activeTasks.length >= 0 && Boolean(syncBrief.git.branch) ? 'True' : 'False',
      Boolean(syncBrief.git.branch) ? 'SyncBriefGenerated' : 'GitStateMissing',
      `Sync brief branch=${syncBrief.git.branch || 'unknown'} dirty=${syncBrief.git.dirtyCount}.`,
      generation,
    ),
    condition(
      'ValidationPassed',
      validation && validation.ok ? 'True' : 'False',
      validation && validation.ok ? 'RequiredArtifactsPresent' : 'ValidationPendingOrFailed',
      validation ? `${validation.fileCount} files checked; missing=${validation.required.missing.length}; secretFindings=${validation.secretFindings.length}.` : 'Validation has not run yet.',
      generation,
    ),
  ];
}

function renderConditions(manifest, conditions) {
  const rows = conditions.map((item) => `| ${item.type} | ${item.status} | ${item.reason} | ${item.message} | ${item.observedGeneration} |`);
  return `${markdownFrontmatter({
    type: 'status-conditions',
    source_status: 'generated',
    last_verified: manifest.generatedAt,
  })}# Vault Conditions

This file uses a Kubernetes-style status pattern: each condition reports an
observed state, reason, message, and observed generation. LLMs should treat
status=False as a stop gate unless the task is explicitly to repair that
condition.

| Type | Status | Reason | Message | Observed Generation |
|------|--------|--------|---------|---------------------|
${rows.join('\n')}

## Provenance

- SOURCE-MANIFEST.md
- state.json
`;
}

function renderValidationReport(result) {
  return `${markdownFrontmatter({
    type: 'validation-report',
    source_status: 'generated',
    last_verified: result.checkedAt,
  })}# VALIDATION-REPORT

- OK: ${result.ok}
- Required paths: ${result.required.present.length}/${result.required.present.length + result.required.missing.length}
- Secret findings: ${result.secretFindings.length}
- Provenance findings: ${result.provenanceFindings.length}

## Missing Required Paths

${result.required.missing.length ? result.required.missing.map((item) => `- ${item}`).join('\n') : '- None'}

## Secret Findings

${result.secretFindings.length ? result.secretFindings.map((item) => `- ${item}`).join('\n') : '- None'}

## Provenance Findings

${result.provenanceFindings.length ? result.provenanceFindings.map((item) => `- ${item}`).join('\n') : '- None'}
`;
}

function writeFile(root, relativePath, text) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, redact(text));
  return filePath;
}

function compileVault(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const out = path.resolve(options.out || DEFAULT_OUT);
  const manifest = buildManifest(repo);
  const sources = SOURCE_CANDIDATES.map((candidate) => readSource(repo, candidate));
  const syncBrief = buildBrief({ repo, skipLaunchctl: true });
  const experimentPlan = planExperiments({ repo, task: 'ai second brain llm context vault', limit: 5 });
  const planText = sources.find((source) => source.id === 'coordination-board')?.text || '';

  fs.mkdirSync(out, { recursive: true });
  const writes = [];
  writes.push(writeFile(out, 'README.md', renderReadme(manifest)));
  writes.push(writeFile(out, 'AGENTS.md', renderAgents(manifest)));
  writes.push(writeFile(out, 'SOURCE-MANIFEST.md', renderSourceManifest(manifest)));
  writes.push(writeFile(out, 'Context Packs/Hermes Operating Context.md', renderHermesContext({ manifest, sources, syncBrief, experimentPlan })));
  writes.push(writeFile(out, 'Context Packs/LLM Routing Context.md', renderRoutingContext({ manifest, experimentPlan })));
  writes.push(writeFile(out, 'Context Packs/Token Efficiency Context.md', renderTokenEfficiencyContext({ manifest, sources })));
  writes.push(writeFile(out, 'Procedures/Agent Sync Procedure.md', renderProcedure('Agent Sync Procedure', [
    '1. Read `AGENTS.md` and `SOURCE-MANIFEST.md`.',
    '2. Read the generated Hermes sync packet or run `node tools/agent-sync-brief.js` in the source repo.',
    '3. Check active tasks, active locks, and dirty files before proposing edits.',
    '4. Claim source files in `plan.md` before editing repo code.',
    '5. Verify with tests or source evidence before saying fixed, shipped, sent, paid, or CI passing.',
  ].join('\n'), manifest)));
  writes.push(writeFile(out, 'Procedures/Experiment Loop Procedure.md', renderProcedure('Experiment Loop Procedure', [
    '1. Write the objective and target metric.',
    '2. Name the implementation path and evaluator command.',
    '3. Add reward-hack checks and variance checks.',
    '4. Name retained context and branch-combine plan.',
    '5. Run `node tools/recursive-experiment-loop.js plan --json --task "<task>"` in the source repo.',
    '6. Promote only experiments with validation evidence.',
  ].join('\n'), manifest)));
  writes.push(writeFile(out, 'Decisions/Recent Decisions.md', renderDecisions(manifest, planText)));
  const preValidation = validateVault(out);
  const conditions = buildConditions({ manifest, syncBrief, validation: preValidation, generation: 1 });
  writes.push(writeFile(out, 'Status/Vault Conditions.md', renderConditions(manifest, conditions)));
  writes.push(writeFile(out, 'Sources/source-index.json', `${JSON.stringify(manifest, null, 2)}\n`));
  writes.push(writeFile(out, 'state.json', `${JSON.stringify({
    schema: 'hermes-ai-vault-state/v1',
    generatedAt: manifest.generatedAt,
    observedGeneration: 1,
    outputPath: out,
    currentPhase: 'compiled',
    completedPhases: ['source_inventory', 'context_pack_compile', 'validation'],
    sourcesDiscovered: manifest.sources.length,
    sourcesIngested: manifest.sources.filter((source) => source.exists).length,
    connectorStatus: manifest.blockedConnectors,
    contextPacksCreated: 3,
    nextActions: ['Run validate before using this vault as current context.', 'Export to an Obsidian vault only after reviewing SOURCE-MANIFEST.md.'],
    blockers: [],
    conditions,
  }, null, 2)}\n`));

  const validation = validateVault(out);
  writes.push(writeFile(out, 'VALIDATION-REPORT.md', renderValidationReport(validation)));
  const finalValidation = validateVault(out);

  return {
    ok: finalValidation.ok,
    out,
    writes,
    validation: finalValidation,
    manifest,
  };
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else files.push(fullPath);
    }
  };
  visit(root);
  return files;
}

function validateVault(vaultPath = DEFAULT_OUT) {
  const root = path.resolve(vaultPath);
  const present = [];
  const missing = [];
  for (const relativePath of REQUIRED_PATHS) {
    if (fs.existsSync(path.join(root, relativePath))) present.push(relativePath);
    else missing.push(relativePath);
  }

  const files = walkFiles(root);
  const secretFindings = [];
  const provenanceFindings = [];
  for (const filePath of files) {
    const relative = path.relative(root, filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    if (/\bghp_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)) {
      secretFindings.push(relative);
    }
    if ((relative.startsWith('Context Packs/') || relative.startsWith('Procedures/') || relative.startsWith('Decisions/'))
      && !/## Provenance/.test(text)) {
      provenanceFindings.push(relative);
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    vaultPath: root,
    ok: missing.length === 0 && secretFindings.length === 0 && provenanceFindings.length === 0,
    required: { present, missing },
    secretFindings,
    provenanceFindings,
    fileCount: files.length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const command = args._[0];
  if (command === 'build') {
    const result = compileVault(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Built Hermes AI vault: ${result.out}`);
      console.log(`Files written: ${result.writes.length}`);
      console.log(`Validation ok: ${result.ok}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'validate') {
    const result = validateVault(args.vault);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Vault: ${result.vaultPath}`);
      console.log(`Validation ok: ${result.ok}`);
      console.log(`Files checked: ${result.fileCount}`);
      if (result.required.missing.length) console.log(`Missing: ${result.required.missing.join(', ')}`);
      if (result.secretFindings.length) console.log(`Secret findings: ${result.secretFindings.join(', ')}`);
      if (result.provenanceFindings.length) console.log(`Provenance findings: ${result.provenanceFindings.join(', ')}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  REQUIRED_PATHS,
  SOURCE_CANDIDATES,
  buildManifest,
  buildConditions,
  compileVault,
  condition,
  estimateTokens,
  extractRecentDecisions,
  parseArgs,
  validateVault,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
