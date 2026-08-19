'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AutonomousSkillForge,
} = require('../tools/autonomous-skill-forge.js');

test('AutonomousSkillForge forges valid skill manifest and registers in SKILLS.md', () => {
  const tmpDir = path.join(os.tmpdir(), `test-forge-${Date.now()}`);
  const tmpSkillsDir = path.join(tmpDir, '.agents', 'skills');
  const tmpSkillsMd = path.join(tmpDir, 'SKILLS.md');

  fs.mkdirSync(tmpSkillsDir, { recursive: true });
  fs.writeFileSync(tmpSkillsMd, '# Skills Registry\n\n| Skill | Description | Path | Type |\n|---|---|---|---|\n\n---\n', 'utf8');

  const forge = new AutonomousSkillForge(tmpSkillsDir, tmpSkillsMd);

  const res = forge.forgeSkill({
    name: 'test-auto-skill',
    description: 'A dynamically synthesized test skill.',
    triggers: ['test', 'auto'],
    instructions: '1. Execute step one.\n2. Execute step two.',
    verificationCmd: 'node -v',
  });

  assert.equal(res.success, true);
  assert.equal(res.name, 'test-auto-skill');
  assert.ok(fs.existsSync(res.skillFile));

  const content = fs.readFileSync(res.skillFile, 'utf8');
  assert.ok(content.includes('name: test-auto-skill'));
  assert.ok(content.includes('trigger: ["test", "auto"]'));

  const skillsMdContent = fs.readFileSync(tmpSkillsMd, 'utf8');
  assert.ok(skillsMdContent.includes('`test-auto-skill`'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
