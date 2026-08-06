'use strict';

/**
 * Google Agent Skills quality gates — unit tests.
 *   node tests/test-hermes-yolo-skill-quality.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('../tools/hermes-yolo-skill-quality.js');

console.log('=== hermes-yolo skill-quality tests (Google scale bar) ===\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-quality-'));

// Good skill
const goodDir = path.join(tmp, 'auth-pairing');
fs.mkdirSync(goodDir);
fs.writeFileSync(
  path.join(goodDir, 'SKILL.md'),
  `---
name: auth-pairing
description: Fix mobile auth pairing and QR handshake failures when the phone cannot reach the computer
owner: hermes-mobile
---

# Auth pairing SOP

1. Check adb devices
2. Exchange secret over USB reverse
3. Verify loopback connectivity

Prefer MCP tools when available for diagnostics.
`,
);

// Bad skill — no frontmatter, bad name
const badDir = path.join(tmp, 'Bad_Skill_Name');
fs.mkdirSync(badDir);
fs.writeFileSync(path.join(badDir, 'SKILL.md'), '# Just a blob\nNo frontmatter.\n');

// YAML block scalar description trap
const yamlDir = path.join(tmp, 'yaml-trap');
fs.mkdirSync(yamlDir);
fs.writeFileSync(
  path.join(yamlDir, 'SKILL.md'),
  `---
name: yaml-trap
description: >
---

# Body is fine but description is bare greater-than
`,
);

{
  const good = Q.lintSkillFile(path.join(goodDir, 'SKILL.md'));
  assert.strictEqual(good.ok, true, JSON.stringify(good.issues));
  assert.ok(good.catalogTokensEstimate > 0);
}

{
  const bad = Q.lintSkillFile(path.join(badDir, 'SKILL.md'));
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === 'frontmatter_missing'));
}

{
  const yaml = Q.lintSkillFile(path.join(yamlDir, 'SKILL.md'));
  assert.strictEqual(yaml.ok, false);
  assert.ok(yaml.issues.some((i) => i.code === 'description_missing'));
}

{
  const urls = Q.extractUrls('See https://example.com/a and https://cloud.google.com/blog/x.');
  assert.ok(urls.some((u) => u.includes('example.com')));
  assert.ok(urls.some((u) => u.includes('cloud.google.com')));
}

(async () => {
  const lint = await Q.lintLibrary({ roots: [tmp], checkLinks: false });
  assert.strictEqual(lint.schema, 'hermes-yolo/skill-lint-v1');
  assert.ok(lint.skillCount >= 3);
  assert.ok(lint.errorSkills >= 1);
  assert.strictEqual(lint.ok, false);

  // Eval on isolated roots — activation correctness for good skill
  const evaluation = Q.evalSkillActivation({
    roots: [tmp],
    suite: [
      {
        prompt: 'fix mobile auth pairing QR handshake',
        expectAnyOf: ['auth-pairing'],
      },
      {
        prompt: 'write a pure hello world function',
        expectNone: true,
      },
    ],
  });
  assert.strictEqual(evaluation.schema, 'hermes-yolo/skill-eval-v1');
  assert.ok(evaluation.uplift.accuracyRate >= 0.5);
  assert.ok(evaluation.uplift.efficiencyRate >= 0.5);
  assert.ok(evaluation.cases[0].activated.includes('auth-pairing'));
  assert.strictEqual(evaluation.cases[1].activated.length, 0);

  const report = await Q.fullReport({
    roots: [tmp],
    suite: [
      { prompt: 'fix mobile auth pairing QR', expectAnyOf: ['auth-pairing'] },
      { prompt: 'write pure hello world', expectNone: true },
    ],
  });
  assert.strictEqual(report.schema, 'hermes-yolo/skill-quality-report-v1');
  // Library has bad skills → lint gate fails even if eval ok
  assert.strictEqual(report.gate.lintOk, false);
  assert.ok(report.eval.matrix);

  // Clean library-only: only good skill root via single-skill tree
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-clean-'));
  const cdir = path.join(clean, 'auth-pairing');
  fs.mkdirSync(cdir);
  fs.copyFileSync(path.join(goodDir, 'SKILL.md'), path.join(cdir, 'SKILL.md'));
  const cleanReport = await Q.fullReport({
    roots: [clean],
    suite: [
      { prompt: 'fix mobile auth pairing QR', expectAnyOf: ['auth-pairing'] },
      { prompt: 'write pure hello world', expectNone: true },
    ],
  });
  assert.strictEqual(cleanReport.gate.lintOk, true, JSON.stringify(cleanReport.lint));
  assert.strictEqual(cleanReport.gate.evalOk, true, JSON.stringify(cleanReport.eval));
  assert.strictEqual(cleanReport.gate.pass, true);

  console.log('All skill-quality tests passed.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
