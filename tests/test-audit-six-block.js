#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  honesty,
  examplesConcrete,
  auditText,
  auditFile,
  runDoctor,
  main,
} = require('../tools/audit-six-block');

const h = honesty();
assert.strictEqual(h.clonedEverydayAi, false);
assert.strictEqual(h.chatgptConnectorSku, false);
assert.strictEqual(h.dualEditContextSixBlockJs2114, false);
assert.strictEqual(h.dualEditCodexContextContract2126, false);

const GOLD = `---
name: demo
description: Produce a prune ledger for whom: Grok on Linear Basic.
---
# Goal
Produce a label-delete ledger.

## Constraints
NEVER delete AGENT agent-* labels. ALWAYS print issues:0 first. HARD fail closed.

## Reference
https://linear.app/pricing
\`~/.grok/skills/linear-basic-full-use/SKILL.md\`
[[linear-no-steal-locks]]
tools/audit-six-block.js

## Examples (show, don't tell)
Weak: Clean up labels.
Gold:
\`\`\`bash
$ python3 prune_unused.py --apply
DEL IGO build
\`\`\`

## Procedures
\`\`\`bash
python3 inventory.py
\`\`\`

## Rubric
- ok=true when empty labels=0
- doctor_exit=0
- evidence: inventory.json
`;

const g = auditText(GOLD);
assert.strictEqual(g.ok, true, JSON.stringify(g));
assert.strictEqual(g.clonedEverydayAi, false);

const headingOnly = GOLD.replace(
  /## Examples[\s\S]*?## Procedures/,
  '## Examples (show, don\'t tell)\nBe concrete.\n\n## Procedures',
);
assert.strictEqual(examplesConcrete(headingOnly), false);
assert.ok(auditText(headingOnly).missing.includes('examples'));

const emptyGold = GOLD.replace(
  /## Examples[\s\S]*?## Procedures/,
  '## Examples (show, don\'t tell)\nWeak:\nGold:\n\n## Procedures',
);
assert.strictEqual(examplesConcrete(emptyGold), false);
assert.ok(auditText(emptyGold).missing.includes('examples'));

const noGoalHeading = GOLD.replace(/^# Goal\n[^\n]*\n/m, '# Demo\n');
assert.ok(auditText(noGoalHeading).missing.includes('section.goal'));

const scatter = [
  'NEVER ALWAYS HARD fail closed REFUSE',
  'https://example.com `~/x.md` [[linear-no-steal-locks]] tools/x.js SKILL.md',
  'Weak: Clean up labels.',
  'Gold:',
  '```bash',
  '$ python3 prune_unused.py --apply',
  '```',
  'ok=true doctor_exit=0 evidence PASS',
].join('\n');
assert.ok(auditText(scatter).missing.includes('section.goal'));
assert.ok(auditText(scatter).missing.includes('section.examples'));

const abstract = [
  '## Goal',
  'Produce fluff for whom: nobody.',
  '## Constraints',
  'NEVER invent. ALWAYS evidence. HARD fail closed.',
  '## Reference',
  'https://example.com tools/x.js SKILL.md',
  '## Examples (show, don\'t tell)',
  'Do a good job writing well.',
  '## Procedures',
  '```bash',
  'true',
  '```',
  '## Rubric',
  'grade PASS evidence',
].join('\n');
assert.ok(auditText(abstract).missing.includes('examples.gold_concrete'));

const cloned = `${GOLD}\nclonedEverydayAi: true\n`;
assert.strictEqual(auditText(cloned).ok, false);
assert.strictEqual(auditText(cloned).clonedEverydayAi, true);

assert.strictEqual(main(['--demo', '--json']), 0);

const skillPath = path.join(__dirname, '../.agents/skills/context-six-block/SKILL.md');
const skillAudit = auditFile(skillPath);
assert.strictEqual(skillAudit.ok, true, JSON.stringify(skillAudit));

const doctor = runDoctor(path.join(__dirname, '..'));
assert.strictEqual(doctor.ok, true, JSON.stringify(doctor.results, null, 2));

const js = fs.readFileSync(path.join(__dirname, '../tools/audit-six-block.js'), 'utf8');
assert.doesNotMatch(js, /require\(['\"]\.\/context-vault/);
assert.doesNotMatch(js, /require\(['\"]\.\/coding-context-pack/);
assert.match(js, /dualEditContextSixBlockJs2114/);
assert.match(js, /dualEditCodexContextContract2126/);

console.log('test-audit-six-block: PASS');
