#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');
const DEFAULT_HERMES_HOME = path.join(os.homedir(), '.hermes');

const PACKS = [
  {
    key: 'money-offer-pack',
    title: 'Money Offer Pack',
    role: 'Revenue control source pack for the frozen AI Automation Workflow Reliability Diagnostic offer.',
    sources: [
      'docs/REVENUE-OPERATING-PLAN.md',
      'docs/SALES-CLOSE-KIT.md',
      'README.md',
    ],
    outputs: [
      'qualified buyer score',
      'diagnostic ask',
      'payment-readiness decision',
      'follow-up draft',
      'objection response',
    ],
    hermesRule: 'Use this pack before sales copy, payment asks, follow-ups, and next-dollar claims. Never treat drafts, alerts, or agent runs as revenue proof.',
    notebookLmPrompt: [
      'You are Hermes source synthesis for a productized AI workflow reliability offer.',
      'Use only these sources. Produce: buyer fit, strongest proof, objections, next paid ask, and follow-up assets.',
      'Flag missing evidence instead of inventing payments or qualified conversations.',
    ].join(' '),
  },
  {
    key: 'reliability-diagnostic-pack',
    title: 'Reliability Diagnostic Pack',
    role: 'Fulfillment source pack for one failing agent workflow, logs, root causes, tests, and repair plan.',
    sources: [
      'docs/AI-AGENT-HARDENING.md',
      'tools/hermes-self-harness.js',
      'tools/hermes-decision-loop.js',
      'tools/tencentdb-memory-readiness.js',
      'tests/test-hermes-self-harness.js',
      'tests/test-tencentdb-memory-readiness.js',
    ],
    outputs: [
      'failure reproduction checklist',
      'root-cause ranking',
      'test plan',
      'repair sprint scope',
      'monitoring upsell',
    ],
    hermesRule: 'Use this pack before dispatching Codex or promising a diagnostic result. Findings need file, trace, log, test, or source evidence.',
    notebookLmPrompt: [
      'You are the source-grounded analyst for a paid AI workflow reliability diagnostic.',
      'From the sources, generate a reproducible failure-analysis template, ranked causes, test checklist, and smallest repair plan.',
      'Separate proven evidence from uncertainty.',
    ].join(' '),
  },
  {
    key: 'hermes-runtime-pack',
    title: 'Hermes Runtime Pack',
    role: 'Operational source pack for Hermes CLI, Telegram, gateway, provider, memory, and machine health.',
    sources: [
      'AGENTS.md',
      'README.md',
      'hermes-yolo-wrapper.js',
      'tools/hermes-project-context.js',
      'tools/hermes-decision-loop.js',
      'tools/hermes-project-routing-audit.js',
      'tools/hermes-goal-cells.js',
      'tools/glm52-hermes-config.js',
      'tools/tencentdb-memory-readiness.js',
      'tests/test-hermes-goal-cells.js',
    ],
    outputs: [
      'runtime status',
      'machine-specific blocker classification',
      'provider readiness split',
      'gateway verification checklist',
      'safe autonomous action list',
    ],
    hermesRule: 'Use this pack before saying Hermes is blocked, healthy, on GLM, launchd-managed, or safe for Telegram actions.',
    notebookLmPrompt: [
      'You are Hermes runtime source synthesis.',
      'Use the sources to classify runtime truth by provider config, launchd state, gateway liveness, Telegram state, memory state, and machine identity.',
      'Do not compress those states into one yes/no.',
    ].join(' '),
  },
  {
    key: 'content-repurposing-pack',
    title: 'Content Repurposing Pack',
    role: 'NotebookLM-style source pack for turning one verified source into safe multi-format content.',
    sources: [
      'docs/MEDIA-CONTENT-INGESTION.md',
      'tools/media-content-ingest.js',
      'tests/test-media-content-ingest.js',
      'docs/REVENUE-OPERATING-PLAN.md',
      'docs/SALES-CLOSE-KIT.md',
    ],
    outputs: [
      'LinkedIn draft',
      'Reddit reply draft',
      'Skool post draft',
      'email follow-up',
      'short video outline',
    ],
    hermesRule: 'Use this pack only for source-backed content. Public posts and outbound sends still require ThumbGate approval.',
    notebookLmPrompt: [
      'You are the content studio for Hermes.',
      'Turn verified sources into concise assets for LinkedIn, Reddit, Skool, email, and video.',
      'Keep claims source-backed and route every public/outbound action to approval.',
    ].join(' '),
  },
];

function usage() {
  return `Usage:
  node tools/hermes-source-packs.js [--apply] [--json] [--repo PATH] [--hermes-home PATH] [--pack-dir PATH]

Builds Hermes source packs inspired by NotebookLM:
- stable source lists
- source hashes
- operator rules
- NotebookLM handoff prompts
- Hermes memory markers

Default output with --apply: ~/.hermes/source-packs`;
}

function parseArgs(argv) {
  const args = {
    apply: false,
    json: false,
    repo: DEFAULT_REPO,
    hermesHome: DEFAULT_HERMES_HOME,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--hermes-home') args.hermesHome = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--pack-dir') args.packDir = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.packDir) args.packDir = path.join(args.hermesHome, 'source-packs');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (_) {
    return null;
  }
}

function sourceRecord(repo, relativePath) {
  const fullPath = path.join(repo, relativePath);
  const stat = safeStat(fullPath);
  if (!stat || !stat.isFile()) {
    return {
      path: relativePath,
      exists: false,
      bytes: 0,
      sha256: null,
    };
  }
  const text = fs.readFileSync(fullPath, 'utf8');
  return {
    path: relativePath,
    exists: true,
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
  };
}

function buildPack(repo, definition) {
  const sources = definition.sources.map((relativePath) => sourceRecord(repo, relativePath));
  const availableSources = sources.filter((source) => source.exists);
  return {
    key: definition.key,
    title: definition.title,
    role: definition.role,
    hermesRule: definition.hermesRule,
    notebookLmPrompt: definition.notebookLmPrompt,
    outputs: definition.outputs,
    sources,
    availableSourceCount: availableSources.length,
    missingSources: sources.filter((source) => !source.exists).map((source) => source.path),
    combinedSourceHash: sha256(availableSources.map((source) => `${source.path}:${source.sha256}`).join('\n')),
    updatedAt: new Date().toISOString(),
  };
}

function buildAll(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const hermesHome = path.resolve(options.hermesHome || DEFAULT_HERMES_HOME);
  const packDir = path.resolve(options.packDir || path.join(hermesHome, 'source-packs'));
  const packs = PACKS.map((definition) => buildPack(repo, definition));
  return {
    checkedAt: new Date().toISOString(),
    repo,
    hermesHome,
    packDir,
    packCount: packs.length,
    availableSourceCount: packs.reduce((sum, pack) => sum + pack.availableSourceCount, 0),
    missingSourceCount: packs.reduce((sum, pack) => sum + pack.missingSources.length, 0),
    packs,
    integration: {
      hermes: 'Load ~/.hermes/source-packs/index.json before source-grounded revenue, runtime, diagnostic, or content decisions.',
      notebookLm: 'Create one NotebookLM notebook per pack; upload the listed sources and use notebookLmPrompt as the configured task instruction.',
      codex: 'Use reliability-diagnostic-pack output as the typed Codex job manifest evidence and acceptance-check input.',
      thumbgate: 'Require approval before public/outbound sends, payments, deployments, refunds, and scope or price changes.',
    },
  };
}

function packMarkdown(pack) {
  const lines = [
    `# ${pack.title}`,
    '',
    `Key: ${pack.key}`,
    `Updated: ${pack.updatedAt}`,
    '',
    '## Role',
    '',
    pack.role,
    '',
    '## Hermes Rule',
    '',
    pack.hermesRule,
    '',
    '## NotebookLM Handoff Prompt',
    '',
    pack.notebookLmPrompt,
    '',
    '## Expected Outputs',
    '',
    ...pack.outputs.map((output) => `- ${output}`),
    '',
    '## Sources',
    '',
    ...pack.sources.map((source) => {
      const status = source.exists ? 'OK' : 'MISSING';
      const hash = source.sha256 ? ` sha256=${source.sha256.slice(0, 16)}` : '';
      return `- ${status} ${source.path} bytes=${source.bytes}${hash}`;
    }),
    '',
    `Combined source hash: ${pack.combinedSourceHash}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function writeIfChanged(filePath, text) {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (previous === text) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return true;
}

function appendMarker(filePath, marker) {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (previous.includes(marker.trim())) return false;
  const next = `${previous.trim()}${previous.trim() ? '\n§\n' : ''}${marker}`;
  return writeIfChanged(filePath, next);
}

function apply(report) {
  const actions = [];
  fs.mkdirSync(report.packDir, { recursive: true });
  for (const pack of report.packs) {
    const jsonChanged = writeIfChanged(path.join(report.packDir, `${pack.key}.json`), `${JSON.stringify(pack, null, 2)}\n`);
    const mdChanged = writeIfChanged(path.join(report.packDir, `${pack.key}.md`), packMarkdown(pack));
    actions.push(`${pack.key}: ${jsonChanged || mdChanged ? 'written' : 'verified'}`);
  }

  const index = {
    checkedAt: report.checkedAt,
    repo: report.repo,
    packCount: report.packCount,
    availableSourceCount: report.availableSourceCount,
    missingSourceCount: report.missingSourceCount,
    packs: report.packs.map((pack) => ({
      key: pack.key,
      title: pack.title,
      role: pack.role,
      availableSourceCount: pack.availableSourceCount,
      missingSources: pack.missingSources,
      combinedSourceHash: pack.combinedSourceHash,
      json: `${pack.key}.json`,
      markdown: `${pack.key}.md`,
    })),
    integration: report.integration,
  };
  const indexChanged = writeIfChanged(path.join(report.packDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  const readmeChanged = writeIfChanged(path.join(report.packDir, 'README.md'), render(report));
  actions.push(`index: ${indexChanged || readmeChanged ? 'written' : 'verified'}`);

  const memoryMarker = [
    'Hermes Source Packs are available at ~/.hermes/source-packs/index.json.',
    'Use money-offer-pack, reliability-diagnostic-pack, hermes-runtime-pack, and content-repurposing-pack before revenue, fulfillment, runtime, or public-content decisions.',
    'NotebookLM may synthesize sources; Hermes routes actions; Codex executes code; ThumbGate gates external side effects.',
    '',
  ].join('\n');
  const memoryChanged = appendMarker(path.join(report.hermesHome, 'memories', 'MEMORY.md'), memoryMarker);
  const userChanged = appendMarker(path.join(report.hermesHome, 'memories', 'USER.md'), 'Preference: before broad Hermes money or runtime claims, load ~/.hermes/source-packs/index.json and cite the relevant source pack rather than relying on raw chat history.\n');
  actions.push(`Hermes MEMORY.md: ${memoryChanged ? 'updated' : 'verified'}`);
  actions.push(`Hermes USER.md: ${userChanged ? 'updated' : 'verified'}`);
  return actions;
}

function render(report) {
  const lines = [
    '# Hermes Source Packs',
    '',
    `Repo: ${report.repo}`,
    `Checked: ${report.checkedAt}`,
    `Packs: ${report.packCount}`,
    `Available sources: ${report.availableSourceCount}`,
    `Missing sources: ${report.missingSourceCount}`,
    '',
    '## Packs',
    '',
  ];
  for (const pack of report.packs) {
    lines.push(`- ${pack.title} (${pack.key})`);
    lines.push(`  Rule: ${pack.hermesRule}`);
    lines.push(`  Sources: ${pack.availableSourceCount}/${pack.sources.length}`);
    if (pack.missingSources.length) lines.push(`  Missing: ${pack.missingSources.join(', ')}`);
  }
  lines.push('', '## Operating Split', '');
  lines.push(`- Hermes: ${report.integration.hermes}`);
  lines.push(`- NotebookLM: ${report.integration.notebookLm}`);
  lines.push(`- Codex: ${report.integration.codex}`);
  lines.push(`- ThumbGate: ${report.integration.thumbgate}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = buildAll(args);
  let actions = ['dry-run: no files changed'];
  if (args.apply) actions = apply(report);
  const output = { ...report, actions };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else {
    process.stdout.write(render(report));
    for (const action of actions) console.log(`- ${action}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  PACKS,
  apply,
  buildAll,
  buildPack,
  parseArgs,
  render,
};
