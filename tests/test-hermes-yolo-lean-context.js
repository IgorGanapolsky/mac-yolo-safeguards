'use strict';

/**
 * Unit tests for Google Agent Skills progressive disclosure (lean context).
 *   node tests/test-hermes-yolo-lean-context.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LEAN = require('../tools/hermes-yolo-lean-context.js');
const wrapper = require('../hermes-yolo-wrapper.js');

console.log('=== hermes-yolo lean-context tests ===\n');

// --- frontmatter ---
{
  const { meta, body } = LEAN.parseFrontmatter(
    '---\nname: demo-skill\ndescription: Fix auth pairing bugs\n---\n\n# Body\n\nDo X then Y.\n',
  );
  assert.strictEqual(meta.name, 'demo-skill');
  assert.strictEqual(meta.description, 'Fix auth pairing bugs');
  assert.ok(body.includes('Do X then Y'));
}

// --- discover from temp skill roots ---
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-skills-'));
const skillDir = path.join(tmpRoot, 'auth-pairing-skill');
fs.mkdirSync(skillDir);
fs.writeFileSync(
  path.join(skillDir, 'SKILL.md'),
  '---\nname: auth-pairing\ndescription: Fix mobile auth pairing and QR handshake failures\n---\n\n# Auth pairing SOP\n\n1. Check adb\n2. Exchange secret\n',
);
const otherDir = path.join(tmpRoot, 'unrelated-skill');
fs.mkdirSync(otherDir);
fs.writeFileSync(
  path.join(otherDir, 'SKILL.md'),
  '---\nname: unrelated-billing\ndescription: Stripe invoice reconciliation only\n---\n\n# Billing\n\nNever load for pairing tasks.\n',
);

const skills = LEAN.discoverSkills({ roots: [tmpRoot], maxSkills: 20 });
assert.ok(skills.length >= 2, `expected >=2 skills, got ${skills.length}`);
assert.ok(skills.some((s) => s.name === 'auth-pairing'));

// --- score + progressive pack ---
const pack = LEAN.buildLeanContextPack({
  taskText: 'fix auth pairing on mobile device QR handshake',
  roots: [tmpRoot],
  env: {
    ...process.env,
    HERMES_YOLO_SKILL_PATHS: tmpRoot,
    HERMES_YOLO_SKILL_ACTIVATE_MAX: '2',
    HERMES_YOLO_SKILL_MIN_SCORE: '4',
  },
  cwd: tmpRoot,
  activateMax: 2,
  minScore: 4,
});
assert.ok(pack.skillCount >= 1, `skillCount=${pack.skillCount}`);
assert.ok(pack.catalogCount >= 1);
assert.ok(
  pack.activatedNames.includes('auth-pairing'),
  `expected auth-pairing activated, got ${JSON.stringify(pack.activatedNames)}`,
);
assert.ok(
  !pack.activatedNames.includes('unrelated-billing'),
  'billing skill must not activate for pairing task',
);
// Saved vs full dump is non-negative (catalog+activated can exceed fullDump when
// descriptions are long and bodies short — still a valid progressive pack).
assert.ok(Number.isFinite(pack.fullDumpTokensEstimate));
assert.ok(Number.isFinite(pack.catalogTokensEstimate));
assert.ok(pack.tokensSavedVsFullDump >= 0);
assert.strictEqual(
  pack.tokensSavedVsFullDump,
  Math.max(0, pack.fullDumpTokensEstimate - pack.catalogTokensEstimate - pack.activatedBodyTokensEstimate),
);

const md = LEAN.renderLeanContextMarkdown(pack);
assert.ok(md.includes('progressive disclosure'));
assert.ok(md.includes('Available skills'));

// --- progressive toolsets ---
assert.strictEqual(
  LEAN.resolveProgressiveToolsets('fix a pure logic bug', {}),
  'terminal,file,web,code_execution,memory,clarify',
);
assert.ok(
  LEAN.resolveProgressiveToolsets('analyze this screenshot of the crash', {}).includes('vision'),
);
assert.ok(
  LEAN.resolveProgressiveToolsets('drive chrome and click the login button', {}).includes('computer_use'),
);
assert.strictEqual(
  LEAN.resolveProgressiveToolsets('anything', { HERMES_YOLO_TOOLSETS: 'terminal,file' }),
  'terminal,file',
);

// --- write receipt ---
const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-receipt-'));
const written = LEAN.writeLeanContextPack(pack, { dir: receiptDir });
assert.ok(fs.existsSync(written.mdPath));
assert.ok(fs.existsSync(written.jsonPath));
const json = JSON.parse(fs.readFileSync(written.jsonPath, 'utf8'));
assert.strictEqual(json.schema, 'hermes-yolo/lean-context-v1');
// JSON receipt omits full skill bodies
if (json.activated && json.activated[0]) {
  assert.strictEqual(json.activated[0].body, undefined);
}

// --- wrapper integration helpers ---
assert.strictEqual(wrapper.leanContextEnabled({ HERMES_YOLO_LEAN_CONTEXT: '0' }), false);
assert.strictEqual(wrapper.leanContextEnabled({}), true);
assert.strictEqual(wrapper.extractTaskText(['fix', 'auth', 'pairing']), 'fix auth pairing');
assert.strictEqual(wrapper.extractTaskText(['-z', 'one shot task']), 'one shot task');
assert.strictEqual(wrapper.extractTaskText(['doctor']), '');
assert.strictEqual(wrapper.extractTaskText(['--version']), '');

const composed = wrapper.composePromptWithLeanContext('do the thing', {
  promptPrefix: '# Agent skills\n- **auth**: pairing',
});
assert.ok(composed.includes('# User task'));
assert.ok(composed.includes('do the thing'));
assert.ok(composed.includes('Agent skills'));

// Off switch: no prefix, default toolsets
const off = wrapper.prepareLeanContextForTask('fix pairing', {
  HERMES_YOLO_LEAN_CONTEXT: '0',
  HERMES_YOLO_TOOLSETS: 'terminal,file',
});
assert.strictEqual(off.enabled, false);
assert.strictEqual(off.toolsets, 'terminal,file,skills,context7');
assert.strictEqual(off.promptPrefix, '');

// Ready probe: no skill dump
const ready = wrapper.prepareLeanContextForTask(wrapper.DEFAULT_READY_PROMPT, {
  HERMES_YOLO_LEAN_CONTEXT: '1',
});
assert.strictEqual(ready.promptPrefix, '');

// Injected module path for deterministic activate
const fakeMod = {
  resolveProgressiveToolsets: (t) =>
    /chrome/.test(t) ? 'terminal,file,web,code_execution,memory,clarify,computer_use' : 'terminal,file,web,code_execution,memory,clarify',
  buildLeanContextPack: () => ({
    schema: 'hermes-yolo/lean-context-v1',
    skillCount: 2,
    catalogCount: 2,
    activatedCount: 1,
    activatedNames: ['auth-pairing'],
    catalogTokensEstimate: 40,
    activatedBodyTokensEstimate: 100,
    tokensSavedVsFullDump: 500,
    catalog: [{ name: 'auth-pairing', description: 'pairing', tokensEstimate: 20 }],
    activated: [
      {
        name: 'auth-pairing',
        description: 'pairing',
        score: 9,
        body: '# Auth pairing SOP\n1. adb\n',
        bodyTokensEstimate: 100,
      },
    ],
  }),
  writeLeanContextPack: (pack) => ({
    mdPath: path.join(receiptDir, 'lean-context-latest.md'),
    jsonPath: path.join(receiptDir, 'lean-context-latest.json'),
    markdown: LEAN.renderLeanContextMarkdown(pack),
  }),
  renderLeanContextMarkdown: LEAN.renderLeanContextMarkdown,
};

const inlineOff = wrapper.prepareLeanContextForTask('fix auth pairing QR', {}, {
  module: fakeMod,
  receiptDir,
});
assert.strictEqual(inlineOff.enabled, true);
assert.strictEqual(inlineOff.promptPrefix, '');
assert.strictEqual(inlineOff.packSummary, null);
assert.ok(inlineOff.toolsets.includes('skills'));
assert.ok(inlineOff.toolsets.includes('context7'));
assert.ok(!inlineOff.toolsets.split(',').includes('memory'));

const on = wrapper.prepareLeanContextForTask('fix auth pairing QR', {
  HERMES_YOLO_INLINE_SKILLS: '1',
}, {
  module: fakeMod,
  receiptDir,
});
assert.strictEqual(on.enabled, true);
assert.ok(on.promptPrefix.includes('auth-pairing') || on.promptPrefix.includes('Auth pairing'));
assert.ok(on.packSummary);
assert.strictEqual(on.packSummary.activatedCount, 1);
assert.ok(on.packSummary.tokensSavedVsFullDump === 500);

const chromeTools = wrapper.prepareLeanContextForTask('open chrome and click submit', process.env, {
  module: fakeMod,
  skipPromptPrefix: true,
});
assert.ok(chromeTools.toolsets.includes('computer_use'));

// Receipt policy field accepts leanContext
const receipt = wrapper.buildRouteReceipt({
  rawArgs: ['fix', 'pairing'],
  selectedBackend: 'grok-4.5',
  model: 'grok-4.5',
  status: 'pass',
  exitCode: 0,
  leanContext: on.packSummary,
  toolsets: on.toolsets,
});
assert.ok(receipt.policy.leanContext);
assert.strictEqual(receipt.policy.toolsets, on.toolsets);

console.log('All lean-context tests passed.');
process.exit(0);
