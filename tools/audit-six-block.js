#!/usr/bin/env node
'use strict';

/**
 * Fail-closed six-block skill auditor (Everyday AI Ep 710 FORMAT).
 * Complementary to tools/context-six-block.js (assembler, PR #2114).
 * This file never edits that assembler or Codex #2126 context-vault/coding-context-pack.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'audit-six-block/v1';
const SOURCE =
  'https://www.youreverydayai.com/ep-710-context-engineering-how-to-get-expert-level-outputs-from-ai-chatbots/';

const BLOCKS = Object.freeze([
  'goal',
  'constraints',
  'reference',
  'examples',
  'procedures',
  'rubric',
]);

const CHECKS = {
  goal: [/^description:/im, /\bfor whom\b/i, /\bproduce\b/i, /^# /m],
  constraints: [/\bNEVER\b/, /\bALWAYS\b/, /\bHARD\b/, /fail closed/i, /\bREFUSE\b/],
  reference: [/https?:\/\//, /`~\//, /\[\[/, /SKILL\.md/, /tools\//],
  examples: [
    /show.{0,8}don.?t tell/i,
    /```(?:bash|text|json)?\n\$ /,
    /\bgold\b/i,
    /^Weak:/m,
    /^Gold:/m,
    /Example:/,
  ],
  procedures: [/```bash/, /^```\n(?:python3|bash|but |node )/m, /^\d+\. /m],
  rubric: [/\brubric\b/i, /doctor_exit/, /\bPASS\b/, /evidence/i, /mustInclude/, /ok=true/, /grade/i],
};

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedEverydayAi: false,
    chatgptConnectorSku: false,
    dualEditContextSixBlockJs2114: false,
    dualEditCodexContextContract2126: false,
    steal: [
      'grade SKILL.md packs for six named blocks',
      'heading-only show-dont-tell is a FAIL',
      'rubric-first: grade criteria must exist before treating the skill as wired',
      'business data stays on coding-context-pack / recall / SKILLS.md — not ChatGPT Apps',
    ],
    skip: [
      'Everyday AI course / Prime Prompt Polish',
      'ChatGPT Apps, Claude connectors, Gemini Gems as a SKU',
      'editing tools/context-six-block.js or tools/context-vault.js',
    ],
  };
}

function examplesConcrete(text) {
  const weakGold = /^Weak:/m.test(text) && /^Gold:/im.test(text);
  const cmd = /```(?:bash|text|json)?\n\$ /.test(text);
  return weakGold || cmd;
}

function auditText(text) {
  const missing = [];
  const hits = {};
  for (const [block, pats] of Object.entries(CHECKS)) {
    const found = pats.filter((p) => p.test(text));
    hits[block] = found.length;
    if (block === 'examples') {
      if (!examplesConcrete(text)) missing.push('examples');
    } else if (found.length === 0) {
      missing.push(block);
    }
  }
  const abstract =
    /write well|be concise|do a good job/i.test(text) && !examplesConcrete(text);
  if (abstract) missing.push('examples.gold_concrete');
  const cloned = /clonedEverydayAi\s*[:=]\s*true/.test(text);
  return {
    schema: SCHEMA,
    ok: missing.length === 0 && !cloned,
    missing,
    hits,
    clonedEverydayAi: cloned,
  };
}

function auditFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return { ...auditText(text), path: filePath };
}

function defaultDoctorTargets(repoRoot) {
  const root = repoRoot || process.cwd();
  const required = [path.join(root, '.agents/skills/context-six-block/SKILL.md')];
  const optional = [
    'gitbutler-fleet-automations',
    'gitbutler-mcp-isolated',
    'gitbutler-session-absorb',
    'gitbutler-google-sso',
    'linear-basic-full-use',
  ].map((name) => path.join(root, '.agents/skills', name, 'SKILL.md'));
  return { required, optional: optional.filter((p) => fs.existsSync(p)) };
}

function runDoctor(repoRoot) {
  const { required, optional } = defaultDoctorTargets(repoRoot);
  const results = [];
  let ok = true;
  for (const p of required) {
    if (!fs.existsSync(p)) {
      results.push({ path: p, ok: false, missing: ['file'] });
      ok = false;
      continue;
    }
    const row = auditFile(p);
    results.push(row);
    if (!row.ok) ok = false;
  }
  for (const p of optional) {
    const row = auditFile(p);
    results.push(row);
    if (!row.ok) ok = false;
  }
  return { schema: SCHEMA, ok, results };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const pretty = json ? 2 : 0;
  const payload = { ...honesty() };
  if (argv.includes('--doctor')) {
    payload.doctor = runDoctor(process.cwd());
    process.stdout.write(`${JSON.stringify(payload, null, pretty)}\n`);
    return payload.doctor.ok ? 0 : 1;
  }
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0 && !argv.includes('--demo')) {
    process.stderr.write('usage: audit-six-block [--json] [--doctor] SKILL.md [...]\n');
    return 2;
  }
  if (argv.includes('--demo')) {
    payload.demo = {
      gold: auditText(
        [
          '---',
          'name: demo',
          'description: Produce a prune ledger for whom: Grok.',
          '---',
          '# Goal',
          '## Constraints',
          'NEVER delete AGENT locks. ALWAYS print issues:0. HARD fail closed.',
          '## Reference',
          'https://linear.app [[linear-no-steal-locks]] `~/x.md` tools/a.js SKILL.md',
          '## Examples (show, don\'t tell)',
          'Weak: Clean up labels.',
          'Gold:',
          '```bash',
          '$ python3 prune_unused.py --apply',
          '```',
          '## Procedures',
          '```bash',
          'python3 inventory.py',
          '```',
          '## Rubric',
          '- ok=true empty=0 doctor_exit=0 evidence: inventory',
        ].join('\n'),
      ),
    };
  }
  if (files.length) payload.audits = files.map(auditFile);
  process.stdout.write(`${JSON.stringify(payload, null, pretty)}\n`);
  const failed = (payload.audits || []).some((row) => !row.ok);
  return failed ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  BLOCKS,
  honesty,
  examplesConcrete,
  auditText,
  auditFile,
  defaultDoctorTargets,
  runDoctor,
  main,
};
