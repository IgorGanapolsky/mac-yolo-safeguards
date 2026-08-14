'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  extractSection,
  validateCard,
  validateSkillDir,
  audit,
  main,
} = require('../tools/skill-card-validate');

console.log('=== test-skill-card-validate ===');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-card-'));
try {
  const goodDir = path.join(tmp, 'good-skill');
  fs.mkdirSync(goodDir);
  fs.writeFileSync(path.join(goodDir, 'SKILL.md'), `---
name: good-skill
description: A compliant skill for tests.
---

# Good skill
`);
  fs.writeFileSync(path.join(goodDir, 'skill-card.md'), `# Skill Card

## Description

Validates skill governance cards.

## Owner

mac-yolo-safeguards agents

## License

MIT
`);

  const badDir = path.join(tmp, 'bad-skill');
  fs.mkdirSync(badDir);
  fs.writeFileSync(path.join(badDir, 'SKILL.md'), `---
name: bad-skill
description: Missing card.
---
`);

  assert.strictEqual(extractSection(fs.readFileSync(path.join(goodDir, 'skill-card.md'), 'utf8'), 'Owner'),
    'mac-yolo-safeguards agents');
  assert.strictEqual(validateCard(path.join(goodDir, 'skill-card.md')).ok, true);
  assert.strictEqual(validateSkillDir(goodDir).ok, true);
  assert.strictEqual(validateSkillDir(badDir).ok, false);

  const report = audit(tmp);
  assert.strictEqual(report.total, 2);
  assert.strictEqual(report.passed, 1);
  assert.strictEqual(report.ok, false);

  assert.strictEqual(main(['--dir', tmp]), 0);
  assert.strictEqual(main(['--dir', tmp, '--strict']), 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('✅ test-skill-card-validate PASSED');
