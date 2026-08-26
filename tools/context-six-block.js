#!/usr/bin/env node
'use strict';

/**
 * Everyday AI Ep 710 FORMAT steal: six context blocks + four layers.
 * Source: https://www.youreverydayai.com/ep-710-context-engineering-how-to-get-expert-level-outputs-from-ai-chatbots/
 *
 * Steal: Goal, Constraints, Reference, Examples, Procedures, Rubric —
 * applied across Personal / Team / Company / Market layers.
 * Show-don't-tell (few-shot gold) and rubric-first grading are required.
 *
 * Do not clone Everyday AI, Jordan Wilson, Prime Prompt Polish, or
 * ChatGPT/Claude/Gemini connector SKUs. Business data stays on existing
 * rails (coding-context-pack, recall, SKILLS.md).
 *
 * Complementary to tools/context-vault.js (Allie K. Miller 8 prompts).
 * Do not dual-edit that file.
 */

const fs = require('fs');
const path = require('path');

const SOURCE =
  'https://www.youreverydayai.com/ep-710-context-engineering-how-to-get-expert-level-outputs-from-ai-chatbots/';
const SCHEMA = 'context-six-block/v1';
const BLOCK_IDS = Object.freeze([
  'goal',
  'constraints',
  'reference',
  'examples',
  'procedures',
  'rubric',
]);
const LAYER_IDS = Object.freeze(['personal', 'team', 'company', 'market']);

const HOSTED_GOLD =
  'Hosted Hermes is $10/mo chat on a fenced VPS. 14-day trial. Cancel anytime. Approvals happen in thumbgate.app.';
const HOSTED_BAD =
  'Continuity Cloud on your MacBook Pro with pair-a-Mac RUN ON picker. $49 Team. Join 3 million trained users.';

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedEverydayAi: false,
    clonedChatGptConnectors: false,
    dualEditContextVault: false,
    liveClaim: false,
    steal: [
      'six named blocks (goal, constraints, reference, examples, procedures, rubric)',
      'four layers (personal, team, company, market)',
      'show-dont-tell: at least one concrete gold example, not an abstract instruction',
      'rubric-first: grade against criteria before treating output as done',
    ],
    skip: [
      'Everyday AI course / Prime Prompt Polish',
      'ChatGPT Apps, Claude connectors, Gemini Gems, Copilot plugins as a SKU',
      'chain-of-thought as the default (episode: decline)',
      'editing tools/context-vault.js',
    ],
  };
}

function connectors() {
  return [
    {
      need: 'issue AC + e2e proof',
      use: 'node tools/coding-context-pack.js --minimal',
      not: 'ChatGPT / Claude / Gemini business connector',
    },
    {
      need: 'lessons from prior sessions',
      use: 'mcp__thumbgate__recall',
      not: 're-explain the repo every turn',
    },
    {
      need: 'how-to for agents',
      use: 'SKILLS.md + .agents/skills/',
      not: 'ChatGPT Skills store',
    },
  ];
}

function hostedRubric() {
  return {
    mustInclude: ['hosted Hermes', '$10', 'fenced VPS'],
    mustNot: ['Continuity Cloud', 'pair-a-Mac', 'RUN ON picker', '$49 Team', '3 million trained'],
  };
}

function assemble(opts = {}) {
  const task = opts.task || 'hosted_copy';
  const h = honesty();
  const blocks = {
    goal: {
      produce: 'Truthful public or agent artifact for the named audience',
      forWhom: 'Igor / fleet agents / hosted-Hermes buyers',
    },
    constraints: {
      rules: [
        'Chief lock: hosted Hermes on a fenced VPS, $10/mo, 14-day trial',
        'Do not hero Continuity, pair-Mac, lid-close, or a RUN ON picker',
        'Do not invent traction; cash is $0 until Stripe from a stranger',
        'Evidence in the same turn as any ship claim',
      ],
      format: 'short Markdown; liveClaim false unless a validated live payload exists',
    },
    reference: {
      files: ['AGENTS.md', '.agents/CHIEF.md', 'SKILLS.md', 'plan.md'],
      facts: [
        'Public offer is hosted Hermes $10/mo on a fenced VPS',
        'mac-yolo-safeguards is a public freeze-guard + funnel repo',
      ],
    },
    examples: {
      gold: [{ id: 'hosted-vps-one-liner', text: HOSTED_GOLD, why: 'names product, price, fence, cancel, approvals' }],
      bad: [{ id: 'continuity-hero', text: HOSTED_BAD, why: 'heroes Continuity, Mac-pair, fake Team SKU, invented scale' }],
    },
    procedures: {
      steps: [
        'Load this pack before drafting',
        'Paste the gold example (show, do not tell)',
        'Apply the rubric before emitting',
        'Repair only failed criteria (max 2)',
        'Ship only if grade.pass === true',
      ],
    },
    rubric: hostedRubric(),
  };
  const layers = {
    personal: 'Agent in this worktree; claim files; isolated branch; no sibling overwrite',
    team: 'AGENTS.md multi-agent protocol; plan.md claims; vault grok.md one-writer',
    company: 'Chief product lock in .agents/CHIEF.md; ECI pauses paid ThumbGate outreach',
    market: 'Hosted VPS $10/mo vs Mac-pair theater; not Everyday AI, not ChatGPT Skills',
  };
  if (task === 'guard_fix') {
    blocks.goal = {
      produce: 'A fail-closed guard change with a focused test',
      forWhom: 'mac-yolo LaunchAgent on Igors Mac',
    };
    blocks.examples.gold = [
      {
        id: 'claw-90pct',
        text: 'Allowlisted helper browseros-claw-server autokills at >=90% CPU after two 60s ticks. GUI apps stay notify-only.',
        why: 'names helper, threshold, cadence, GUI exception',
      },
    ];
  }
  return {
    ...h,
    task,
    blocks,
    layers,
    connectors: connectors(),
    status: 'PACKED',
  };
}

function validatePack(pack) {
  const missing = [];
  if (!pack || typeof pack !== 'object') {
    return { ok: false, missing: ['pack'], reason: 'no pack' };
  }
  for (const id of BLOCK_IDS) {
    if (!pack.blocks || pack.blocks[id] == null) missing.push(`block:${id}`);
  }
  for (const id of LAYER_IDS) {
    if (!pack.layers || !pack.layers[id]) missing.push(`layer:${id}`);
  }
  const examples = pack.blocks && pack.blocks.examples;
  const gold = examples && Array.isArray(examples.gold) ? examples.gold : [];
  const concrete = gold.filter((g) => g && typeof g.text === 'string' && g.text.trim().length >= 24);
  if (concrete.length < 1) missing.push('examples.gold_concrete');
  const rubric = pack.blocks && pack.blocks.rubric;
  if (!rubric || !Array.isArray(rubric.mustInclude) || rubric.mustInclude.length < 1) {
    missing.push('rubric.mustInclude');
  }
  if (!rubric || !Array.isArray(rubric.mustNot) || rubric.mustNot.length < 1) {
    missing.push('rubric.mustNot');
  }
  if (pack.clonedEverydayAi === true || pack.clonedChatGptConnectors === true) {
    missing.push('honesty.cloned');
  }
  if (pack.liveClaim === true) missing.push('liveClaim');
  return {
    ok: missing.length === 0,
    missing,
    reason: missing.length === 0 ? 'six blocks + four layers + gold example + rubric' : missing.join(','),
  };
}

function grade(text, rubric = hostedRubric()) {
  const body = String(text || '');
  const failed = [];
  for (const needle of rubric.mustInclude || []) {
    if (!body.toLowerCase().includes(String(needle).toLowerCase())) {
      failed.push(`missing:${needle}`);
    }
  }
  for (const needle of rubric.mustNot || []) {
    if (body.toLowerCase().includes(String(needle).toLowerCase())) {
      failed.push(`forbidden:${needle}`);
    }
  }
  return {
    pass: failed.length === 0,
    failed,
    rubricFirst: true,
    liveClaim: false,
  };
}

function parseArgs(argv) {
  const out = { json: false, validate: false, pack: true, task: 'hosted_copy', gradeText: '', gradeFile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--json') out.json = true;
    else if (a === '--validate') out.validate = true;
    else if (a === '--task' && next) {
      out.task = next;
      i += 1;
    } else if (a === '--grade' && next) {
      out.gradeText = next;
      i += 1;
    } else if (a === '--grade-file' && next) {
      out.gradeFile = next;
      i += 1;
    }
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const pack = assemble({ task: args.task });
  const check = validatePack(pack);
  let gradeResult = null;
  let text = args.gradeText;
  if (args.gradeFile) {
    text = fs.readFileSync(path.resolve(args.gradeFile), 'utf8');
  }
  if (text) gradeResult = grade(text, pack.blocks.rubric);
  const result = { ...pack, validation: check, grade: gradeResult };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!check.ok) return 1;
  if (gradeResult && gradeResult.pass === false) return 2;
  return 0;
}

module.exports = {
  SCHEMA,
  SOURCE,
  BLOCK_IDS,
  LAYER_IDS,
  HOSTED_GOLD,
  HOSTED_BAD,
  honesty,
  connectors,
  hostedRubric,
  assemble,
  validatePack,
  grade,
  main,
};

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  }
}
