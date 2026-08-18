#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanSkills } = require('../tools/validate-agent-skills');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-yaml-preflight-'));

function addSkill(name, contents) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), contents);
}

try {
  addSkill('valid', `---
name: valid
description: >
  A valid folded description.
metadata:
  triggers:
    - first
    - second
---

# Valid
`);
  addSkill('invalid-comma-list', `---
name: invalid-comma-list
description: Invalid quoted comma list.
metadata: "first", "second"
---
`);
  addSkill('missing-delimiter', `name: missing-delimiter
description: Missing opening delimiter.
---
`);
  addSkill('empty-description', `---
name: empty-description
description: ""
---
`);

  const report = scanSkills([tempRoot]);
  assert.strictEqual(report.checked, 4);
  assert.strictEqual(report.failed, 3);
  assert.strictEqual(report.results.find((item) => item.file.includes('/valid/')).ok, true);
  assert.match(report.results.find((item) => item.file.includes('/invalid-comma-list/')).error, /invalid YAML/);
  assert.match(report.results.find((item) => item.file.includes('/missing-delimiter/')).error, /missing opening/);
  assert.match(report.results.find((item) => item.file.includes('/empty-description/')).error, /description/);

  const repoReport = scanSkills([path.join(__dirname, '..', '.agents', 'skills')]);
  assert.strictEqual(repoReport.failed, 0, JSON.stringify(repoReport.results.filter((item) => !item.ok), null, 2));
  console.log(`PASS test-validate-agent-skills (${repoReport.checked} repo manifests parsed)`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
