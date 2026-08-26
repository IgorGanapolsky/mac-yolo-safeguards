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

const HEADING_ALIASES = Object.freeze({
  goal: ['goal', 'purpose', 'mission'],
  constraints: ['constraints', 'constraint', 'never', 'always', 'must', 'hard rules'],
  reference: ['reference', 'references', 'related', 'sources', 'source'],
  examples: ['examples', 'example', "show, don't tell", 'show dont tell', "show don't tell"],
  procedures: ['procedures', 'procedure', 'commands', 'steps', 'how to'],
  rubric: ['rubric', 'acceptance', 'grade', 'grading', 'acceptance criteria'],
});

const CHECKS = {
  goal: [/\bfor whom\b/i, /\bproduce\b/i, /^description:/im, /what to produce/i],
  constraints: [/\bNEVER\b/, /\bALWAYS\b/, /\bHARD\b/, /fail closed/i, /\bREFUSE\b/],
  reference: [/https?:\/\//, /`~\//, /\[\[/, /SKILL\.md/, /tools\//, /AGENTS\.md/, /CHIEF\.md/],
  examples: [
    /show.{0,8}don.?t tell/i,
    /```(?:bash|text|json)?\n\$ /,
    /\bgold\b/i,
    /^Weak:/m,
    /^Gold:/m,
  ],
  procedures: [/```bash/, /^```\n(?:python3|bash|but |node )/m, /^\d+\. /m, /\$ /],
  rubric: [/\bok\s*=\s*true\b/i, /doctor_exit/, /\bPASS\b/, /evidence/i, /mustInclude/, /grade/i, /ok=false/],
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

function mapHeadingToBlock(title) {
  const t = String(title || '')
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [block, aliases] of Object.entries(HEADING_ALIASES)) {
    for (const alias of aliases) {
      if (t === alias || t.startsWith(`${alias} `) || t.endsWith(` ${alias}`)) {
        return block;
      }
    }
  }
  return null;
}

/** Split markdown into named six-block sections (plus preamble). */
function splitSections(text) {
  const sections = { _preamble: '' };
  let current = '_preamble';
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m) {
      const block = mapHeadingToBlock(m[1]);
      if (block) {
        current = block;
        if (!sections[current]) sections[current] = '';
      }
    }
    sections[current] = `${sections[current] || ''}${line}\n`;
  }
  return sections;
}

function goldHasSubstance(text) {
  const src = String(text || '');
  const goldIdx = src.search(/^Gold:/im);
  if (goldIdx < 0) return false;
  const after = src.slice(goldIdx).replace(/^Gold:\s*/i, '');
  const cut = after.search(/\n#{1,3}\s|\nWeak:/);
  const body = cut === -1 ? after : after.slice(0, cut);
  const cmdBody = body.match(/```(?:bash|text|json)?\n([\s\S]*?)```/);
  if (cmdBody && cmdBody[1].replace(/\s+/g, '').length >= 3) return true;
  const stripped = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\$\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length >= 8;
}

function examplesConcrete(text) {
  const weak = /^Weak:[^\S\n]*\S/m.test(text);
  const goldLabel = /^Gold:/im.test(text);
  return Boolean(weak && goldLabel && goldHasSubstance(text));
}

function auditText(text) {
  const sections = splitSections(text);
  const missing = [];
  const hits = {};
  const present = {};

  for (const block of BLOCKS) {
    const sectionText = sections[block] || '';
    present[block] = Boolean(sectionText.trim());
    if (!present[block]) {
      missing.push(`section.${block}`);
      hits[block] = 0;
      continue;
    }
    const pats = CHECKS[block] || [];
    const found = pats.filter((p) => p.test(sectionText));
    hits[block] = found.length;
    if (block === 'examples') {
      if (!examplesConcrete(sectionText)) missing.push('examples');
    } else if (found.length === 0) {
      missing.push(block);
    }
  }

  const abstract =
    /write well|be concise|do a good job/i.test(text) && !examplesConcrete(sections.examples || '');
  if (abstract) missing.push('examples.gold_concrete');
  const cloned = /clonedEverydayAi\s*[:=]\s*true/.test(text);
  return {
    schema: SCHEMA,
    ok: missing.length === 0 && !cloned,
    missing,
    hits,
    present,
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
          'Produce a prune ledger for whom: Grok on Linear Basic.',
          '## Constraints',
          'NEVER delete AGENT locks. ALWAYS print issues:0. HARD fail closed.',
          '## Reference',
          'https://linear.app [[linear-no-steal-locks]] `~/x.md` tools/a.js SKILL.md',
          "## Examples (show, don't tell)",
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
  mapHeadingToBlock,
  splitSections,
  goldHasSubstance,
  examplesConcrete,
  auditText,
  auditFile,
  defaultDoctorTargets,
  runDoctor,
  main,
};
