'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  distillActivityIntoSkill,
  synthesizeAndSaveSkill,
} = require('../tools/hermes-activity-skill-distiller');

test('distillActivityIntoSkill builds SKILL.md body with commands and files', () => {
  const distilled = distillActivityIntoSkill({
    title: 'Cloudflare Deploy Interval',
    actions: [
      { type: 'command', command: 'npm run build:cloudflare' },
      { type: 'file_edit', file: 'apps/hermes-control-plane/app/page.tsx' },
    ],
    tags: ['deploy'],
    verificationCommand: 'node -e "process.exit(0)"',
  });
  assert.equal(distilled.name, 'cloudflare-deploy-interval');
  assert.ok(distilled.skillContent.includes('npm run build:cloudflare'));
  assert.ok(distilled.skillContent.includes('apps/hermes-control-plane/app/page.tsx'));
  assert.equal(distilled.commandCount, 1);
  assert.equal(distilled.fileCount, 1);
});

test('synthesizeAndSaveSkill writes skill dir under repo root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-skill-'));
  fs.writeFileSync(path.join(root, 'SKILLS.md'), '# skills\n');
  const result = synthesizeAndSaveSkill(
    {
      title: 'Temp Activity Skill',
      actions: [{ type: 'command', command: 'echo ok' }],
    },
    root,
  );
  assert.equal(result.success, true);
  assert.ok(fs.existsSync(result.skillPath));
  const skillsMd = fs.readFileSync(path.join(root, 'SKILLS.md'), 'utf8');
  assert.ok(skillsMd.includes(result.name));
  fs.rmSync(root, { recursive: true, force: true });
});
