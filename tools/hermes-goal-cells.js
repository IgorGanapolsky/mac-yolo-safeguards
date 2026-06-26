#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_HERMES_HOME = path.join(os.homedir(), '.hermes');
const DEFAULT_OBJECTIVE = 'Make one verified revenue action today for the AI Automation Workflow Reliability Diagnostic.';

const ROLE_LIBRARY = {
  router: {
    title: 'Owner/Router',
    responsibility: 'Choose the next highest-value action, keep the goal bounded, and stop context drift.',
  },
  researcher: {
    title: 'Researcher',
    responsibility: 'Gather source-backed buyer pain, logs, docs, and objections from the selected source pack.',
  },
  builder: {
    title: 'Builder/Codex',
    responsibility: 'Create code, tests, reports, job manifests, or fulfillment artifacts inside the allowed workspace.',
  },
  verifier: {
    title: 'Verifier',
    responsibility: 'Check external truth, tests, CI, screenshots, provider state, Stripe readback, or browser evidence.',
  },
  closer: {
    title: 'Closer',
    responsibility: 'Package the next buyer-facing action, but route outbound/payment/public side effects through ThumbGate.',
  },
};

const TEMPLATES = [
  {
    key: 'money',
    patterns: [/money/i, /revenue/i, /buyer/i, /payment/i, /stripe/i, /diagnostic/i, /offer/i],
    sourcePackKey: 'money-offer-pack',
    roles: ['router', 'researcher', 'verifier', 'closer'],
    truthSource: 'pipeline files + browser/provider readback + Stripe/payment evidence when relevant',
    verifier: 'Verifier checks source-pack evidence, buyer fit, payment-route readiness, and external proof before any completion claim.',
    doneWhen: 'One verified buyer-facing action is approved/sent, or the blocker names the missing buyer/payment/source evidence.',
    actions: [
      'Load money-offer-pack and classify the active buyer/prospect stage.',
      'Score exact offer fit using explicit pain, supplied assets, production impact, access, and budget/deadline evidence.',
      'Generate one useful technical observation or diagnostic ask from the source pack.',
      'Verify whether a payment ask is allowed by scope and Stripe/payment-route readiness.',
      'Write the next owner-visible action packet for ThumbGate approval when needed.',
    ],
  },
  {
    key: 'diagnostic',
    patterns: [/failure/i, /root cause/i, /repair/i, /test/i, /diagnos/i, /workflow/i, /log/i],
    sourcePackKey: 'reliability-diagnostic-pack',
    roles: ['router', 'researcher', 'builder', 'verifier'],
    truthSource: 'repo/log/test evidence + Codex job result + acceptance checks',
    verifier: 'Verifier checks reproduction, cited evidence, tests run, and remaining uncertainty.',
    doneWhen: 'A diagnostic report or repair plan cites source evidence, test output, and unresolved uncertainty.',
    actions: [
      'Load reliability-diagnostic-pack and identify the minimum reproducible path.',
      'Collect logs, traces, code paths, screenshots, and expected behavior.',
      'Ask Codex for bounded analysis or tests only after scope is clear.',
      'Rank root-cause hypotheses with evidence and confidence.',
      'Verify test/lint/typecheck results or mark the failure non-reproducible with evidence.',
    ],
  },
  {
    key: 'runtime',
    patterns: [/hermes/i, /cli/i, /gateway/i, /telegram/i, /glm/i, /provider/i, /launchd/i, /blocked/i, /runtime/i],
    sourcePackKey: 'hermes-runtime-pack',
    roles: ['router', 'builder', 'verifier'],
    truthSource: 'Hermes config + launchctl + gateway/API liveness + logs + machine identity',
    verifier: 'Verifier checks provider config, launchd state, gateway liveness, Telegram state, memory state, and machine identity separately.',
    doneWhen: 'Runtime state is classified by surface with commands and no broad healthy/blocked claim.',
    actions: [
      'Load hermes-runtime-pack and identify the exact machine and repo.',
      'Check config/provider truth separately from launchd and live API behavior.',
      'Repair the smallest runtime blocker inside local hygiene boundaries.',
      'Run the matching smoke/probe command.',
      'Report healthy, blocked, or observe-only with evidence per surface.',
    ],
  },
  {
    key: 'content',
    patterns: [/content/i, /post/i, /linkedin/i, /reddit/i, /skool/i, /email/i, /repurpose/i],
    sourcePackKey: 'content-repurposing-pack',
    roles: ['router', 'researcher', 'closer', 'verifier'],
    truthSource: 'source-pack documents + target-channel draft + ThumbGate approval record',
    verifier: 'Verifier checks that every claim comes from the sources and every public/outbound action has approval.',
    doneWhen: 'One source-backed asset is ready for approval, or the missing source/approval blocker is named.',
    actions: [
      'Load content-repurposing-pack and pick one verified source.',
      'Extract one audience-specific pain, proof point, and CTA.',
      'Draft one channel-specific asset without unsupported claims.',
      'Check public/outbound approval requirements.',
      'Write the exact approval packet or stop before the side effect.',
    ],
  },
];

function usage() {
  return `Usage:
  node tools/hermes-goal-cells.js --objective "..." [--apply] [--json]
  node tools/hermes-goal-cells.js --template money [--apply]

Creates a high-context Hermes Goal Cell:
- 1 objective
- 1 source pack
- 1-10 generalist roles
- no more than 5 executable actions
- 1 verifier and truth source
- ThumbGate side-effect boundary`;
}

function parseArgs(argv) {
  const args = {
    objective: '',
    template: '',
    apply: false,
    json: false,
    hermesHome: DEFAULT_HERMES_HOME,
    maxActions: 5,
    roles: null,
    sourcePackKey: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--objective') args.objective = requireValue(argv, ++i, arg);
    else if (arg === '--template') args.template = requireValue(argv, ++i, arg);
    else if (arg === '--source-pack') args.sourcePackKey = requireValue(argv, ++i, arg);
    else if (arg === '--roles') args.roles = requireValue(argv, ++i, arg).split(',').map((role) => role.trim()).filter(Boolean);
    else if (arg === '--max-actions') args.maxActions = Number(requireValue(argv, ++i, arg));
    else if (arg === '--hermes-home') args.hermesHome = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.objective) args.objective = DEFAULT_OBJECTIVE;
  if (!Number.isInteger(args.maxActions) || args.maxActions < 1 || args.maxActions > 5) {
    throw new Error('--max-actions must be an integer from 1 to 5');
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function selectTemplate(objective, templateKey) {
  if (templateKey) {
    const explicit = TEMPLATES.find((template) => template.key === templateKey);
    if (!explicit) throw new Error(`Unknown template: ${templateKey}`);
    return explicit;
  }
  return TEMPLATES.find((template) => template.patterns.some((pattern) => pattern.test(objective))) || TEMPLATES[0];
}

function loadSourcePackIndex(hermesHome) {
  const indexPath = path.join(hermesHome, 'source-packs', 'index.json');
  if (!fs.existsSync(indexPath)) {
    return {
      exists: false,
      indexPath,
      packs: [],
    };
  }
  const index = readJson(indexPath);
  return {
    exists: true,
    indexPath,
    packs: index.packs || [],
    checkedAt: index.checkedAt,
  };
}

function roleSpec(roleKey) {
  const item = ROLE_LIBRARY[roleKey];
  if (!item) throw new Error(`Unknown role: ${roleKey}`);
  return {
    key: roleKey,
    title: item.title,
    responsibility: item.responsibility,
  };
}

function buildGoalCell(options = {}) {
  const hermesHome = path.resolve(options.hermesHome || DEFAULT_HERMES_HOME);
  const objective = options.objective || DEFAULT_OBJECTIVE;
  const maxActions = options.maxActions || 5;
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 5) {
    throw new Error('maxActions must be an integer from 1 to 5');
  }

  const template = selectTemplate(objective, options.template);
  const sourcePackKey = options.sourcePackKey || template.sourcePackKey;
  const sourcePackIndex = loadSourcePackIndex(hermesHome);
  const sourcePack = sourcePackIndex.packs.find((pack) => pack.key === sourcePackKey) || null;
  const selectedRoles = options.roles || template.roles;
  if (selectedRoles.length < 1 || selectedRoles.length > 10) {
    throw new Error('Goal Cell roles must contain 1 to 10 high-context generalists');
  }

  const actions = template.actions.slice(0, maxActions);
  const now = new Date().toISOString();
  const id = `goalcell_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}_${sha256(`${objective}:${sourcePackKey}:${now}`).slice(0, 8)}`;
  return {
    id,
    createdAt: now,
    objective,
    template: template.key,
    sourcePackKey,
    sourcePackFound: Boolean(sourcePack),
    sourcePackHash: sourcePack ? sourcePack.combinedSourceHash : null,
    sourcePackIndexPath: sourcePackIndex.indexPath,
    teamSize: selectedRoles.length,
    roles: selectedRoles.map(roleSpec),
    maxActions,
    executableActions: actions,
    verifier: template.verifier,
    truthSource: template.truthSource,
    doneWhen: template.doneWhen,
    externalActionBoundary: {
      owner: 'ThumbGate',
      rule: 'Email/DM sends, public posts, Stripe operations, GitHub writes, deployments, refunds, price or scope changes, and private credential use require approval immediately before the side effect.',
    },
    stopRules: [
      'Stop if the selected source pack is missing.',
      'Stop if a paying customer is waiting and this cell is not the paid-work cell.',
      'Stop before any external side effect that lacks current ThumbGate approval.',
      'Stop rather than inventing source, payment, test, browser, or provider evidence.',
    ],
  };
}

function goalCellMarkdown(cell) {
  const lines = [
    '# Hermes Goal Cell',
    '',
    `ID: ${cell.id}`,
    `Created: ${cell.createdAt}`,
    `Objective: ${cell.objective}`,
    `Template: ${cell.template}`,
    `Source pack: ${cell.sourcePackKey} (${cell.sourcePackFound ? 'found' : 'missing'})`,
    `Source hash: ${cell.sourcePackHash || 'missing'}`,
    `Team size: ${cell.teamSize}`,
    `Max actions: ${cell.maxActions}`,
    '',
    '## Roles',
    '',
    ...cell.roles.map((role) => `- ${role.title}: ${role.responsibility}`),
    '',
    '## Executable Actions',
    '',
    ...cell.executableActions.map((action, index) => `${index + 1}. ${action}`),
    '',
    '## Verification',
    '',
    `Truth source: ${cell.truthSource}`,
    `Verifier: ${cell.verifier}`,
    `Done when: ${cell.doneWhen}`,
    '',
    '## Boundary',
    '',
    `${cell.externalActionBoundary.owner}: ${cell.externalActionBoundary.rule}`,
    '',
    '## Stop Rules',
    '',
    ...cell.stopRules.map((rule) => `- ${rule}`),
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

function applyGoalCell(cell, hermesHome = DEFAULT_HERMES_HOME) {
  const root = path.join(hermesHome, 'goal-cells');
  const archive = path.join(root, 'cells');
  const json = `${JSON.stringify(cell, null, 2)}\n`;
  const md = goalCellMarkdown(cell);
  const actions = [];
  actions.push(`current.json: ${writeIfChanged(path.join(root, 'current.json'), json) ? 'written' : 'verified'}`);
  actions.push(`current.md: ${writeIfChanged(path.join(root, 'current.md'), md) ? 'written' : 'verified'}`);
  actions.push(`${cell.id}.json: ${writeIfChanged(path.join(archive, `${cell.id}.json`), json) ? 'written' : 'verified'}`);
  actions.push(`${cell.id}.md: ${writeIfChanged(path.join(archive, `${cell.id}.md`), md) ? 'written' : 'verified'}`);
  const memoryMarker = [
    'Hermes Goal Cell protocol is active at ~/.hermes/goal-cells/current.json.',
    'Every non-trivial Hermes run should load exactly one source pack, use a 1-10 person high-context team, generate no more than five executable actions, name one verifier, and stop before ungated side effects.',
    '',
  ].join('\n');
  const userMarker = 'Preference: use a Hermes Goal Cell before broad revenue, runtime, diagnostic, or content work so Hermes acts like a small high-context team instead of a sprawling agent swarm.\n';
  actions.push(`Hermes MEMORY.md: ${appendMarker(path.join(hermesHome, 'memories', 'MEMORY.md'), memoryMarker) ? 'updated' : 'verified'}`);
  actions.push(`Hermes USER.md: ${appendMarker(path.join(hermesHome, 'memories', 'USER.md'), userMarker) ? 'updated' : 'verified'}`);
  return actions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const cell = buildGoalCell(args);
  const actions = args.apply ? applyGoalCell(cell, args.hermesHome) : ['dry-run: no files changed'];
  const output = { ...cell, actions };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else {
    process.stdout.write(goalCellMarkdown(cell));
    for (const action of actions) console.log(`- ${action}`);
  }
  if (!cell.sourcePackFound) process.exitCode = 1;
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
  ROLE_LIBRARY,
  TEMPLATES,
  applyGoalCell,
  buildGoalCell,
  goalCellMarkdown,
  parseArgs,
};
