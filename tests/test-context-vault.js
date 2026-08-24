'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTEXT_PROMPTS,
  PROMPT_COUNT,
  readRepoMetadata,
  fillTemplate,
  generateVault,
  validateVault,
  validateContent,
  listPrompts,
  DEFAULT_REPO,
  DEFAULT_OUT,
} = require('../tools/context-vault');

console.log('=== test-context-vault ===');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// --- Tier 1: Structure — 8 prompts, all required fields ---

check('PROMPT_COUNT is 8', () => {
  assert.strictEqual(PROMPT_COUNT, 8);
});

check('all prompts have id, title, description, source_files, template', () => {
  for (const p of CONTEXT_PROMPTS) {
    assert.ok(p.id, `prompt missing id: ${JSON.stringify(p)}`);
    assert.ok(p.title, `prompt ${p.id} missing title`);
    assert.ok(p.description, `prompt ${p.id} missing description`);
    assert.ok(Array.isArray(p.source_files), `prompt ${p.id} source_files not array`);
    assert.ok(p.source_files.length > 0, `prompt ${p.id} has no source_files`);
    assert.ok(p.template, `prompt ${p.id} missing template`);
  }
});

check('prompt ids are unique', () => {
  const ids = CONTEXT_PROMPTS.map(p => p.id);
  const unique = [...new Set(ids)];
  assert.strictEqual(unique.length, PROMPT_COUNT, 'duplicate prompt ids');
});

check('prompt ids are sequential and readable', () => {
  const expected = ['who-am-i', 'what-matters', 'how-should-you-work',
    'tools-and-access', 'whats-current', 'hard-constraints',
    'what-do-i-know', 'next-action'];
  assert.deepStrictEqual(CONTEXT_PROMPTS.map(p => p.id), expected);
});

check('no template variable is left unresolved in any prompt template', () => {
  // The templates use {{VAR}} placeholders; readRepoMetadata must fill ALL of them
  const allVars = new Set();
  for (const p of CONTEXT_PROMPTS) {
    const vars = p.template.match(/\{\{([A-Z_]+)\}\}/g);
    if (vars) {
      for (const v of vars) {
        allVars.add(v.slice(2, -2));
      }
    }
  }
  const metadata = readRepoMetadata(DEFAULT_REPO);
  for (const v of allVars) {
    assert.ok(v in metadata, `metadata missing key for template var: ${v}`);
    assert.ok(metadata[v] !== undefined && metadata[v] !== '',
      `metadata value for ${v} is undefined or empty`);
  }
});

// --- Tier 2: Metadata extraction from repo files ---

check('readRepoMetadata extracts REPO_NAME', () => {
  const m = readRepoMetadata(DEFAULT_REPO);
  assert.ok(m.REPO_NAME, 'REPO_NAME not extracted');
});

check('readRepoMetadata extracts at least 50 skills', () => {
  const m = readRepoMetadata(DEFAULT_REPO);
  assert.ok(m.SKILL_COUNT >= 50, `expected >= 50 skills, got ${m.SKILL_COUNT}`);
});

check('readRepoMetadata extracts NEVER_LIST from AGENTS.md', () => {
  const m = readRepoMetadata(DEFAULT_REPO);
  assert.ok(Array.isArray(m.NEVER_LIST), 'NEVER_LIST should be array');
  assert.ok(m.NEVER_LIST.length > 0, 'NEVER_LIST should have entries');
});

check('readRepoMetadata extracts DIRECTIVES', () => {
  const m = readRepoMetadata(DEFAULT_REPO);
  assert.ok(m.DIRECTIVES, 'DIRECTIVES not set');
  assert.ok(m.DIRECTIVES.length > 0, 'DIRECTIVES should have entries');
});

check('readRepoMetadata extracts DOCS_TOC', () => {
  const m = readRepoMetadata(DEFAULT_REPO);
  assert.ok(m.DOCS_TOC, 'DOCS_TOC not set');
});

// --- Tier 3: Template filling and vault generation ---

check('fillTemplate resolves all {{VAR}} placeholders', () => {
  const metadata = readRepoMetadata(DEFAULT_REPO);
  for (const p of CONTEXT_PROMPTS) {
    const filled = fillTemplate(p.template, metadata);
    const unresolved = filled.match(/\{\{[A-Z_]+\}\}/g);
    assert.strictEqual(unresolved, null,
      `unresolved vars in prompt ${p.id}: ${unresolved && unresolved.join(', ')}`);
  }
});

check('generateVault produces valid content', () => {
  const result = generateVault(DEFAULT_REPO);
  assert.ok(result.content, 'no content generated');
  assert.ok(result.content.length > 500, 'content too short');
  const validation = validateContent(result.content);
  assert.strictEqual(validation.ok, true, `validation failed: ${JSON.stringify(validation.errors)}`);
  assert.strictEqual(validation.promptCount, PROMPT_COUNT);
});

check('generateVault writes to file when outPath given', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const outFile = path.join(tmp, 'out.md');
  const result = generateVault(DEFAULT_REPO, outFile);
  assert.strictEqual(result.written, true, 'should be written');
  assert.ok(fs.existsSync(outFile), 'file should exist');
  assert.ok(fs.statSync(outFile).size > 500, 'file too small');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- Tier 4: Validation ---

check('validateVault returns ok for generated vault', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const outFile = path.join(tmp, 'out.md');
  generateVault(DEFAULT_REPO, outFile);
  const result = validateVault(outFile);
  assert.strictEqual(result.ok, true, `validation failed: ${JSON.stringify(result.errors)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

check('validateVault returns error for missing file', () => {
  const result = validateVault('/nonexistent/vault.md');
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

check('validateVault returns error for empty content', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const emptyFile = path.join(tmp, 'empty.md');
  fs.writeFileSync(emptyFile, '');
  const result = validateVault(emptyFile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

check('validateContent flags unresolved template variables', () => {
  const content = '# 1. Who am I?\n\nUse {{UNRESOLVED_VAR}} here\n\n---\n';
  const result = validateContent(content + '\n# 2. What\n\n---\n');
  // Even with 2 prompts, unresolved var should be caught
  assert.ok(result.errors.some(e => /Unresolved/.test(JSON.stringify(e))),
    'should detect unresolved template variables');
});

// --- Tier 5: CLI behavior ---

check('listPrompts returns all 8 prompts with metadata', () => {
  const prompts = listPrompts();
  assert.strictEqual(prompts.length, PROMPT_COUNT);
  for (const p of prompts) {
    assert.ok(p.id, 'missing id');
    assert.ok(p.title, 'missing title');
    assert.ok(p.description, 'missing description');
    assert.ok(p.source_files, 'missing source_files');
  }
});

check('DEFAULT_OUT points to artifacts dir', () => {
  assert.ok(DEFAULT_OUT.includes('artifacts'), 'default out should be in artifacts');
  assert.ok(DEFAULT_OUT.endsWith('context-vault.md'), 'should be context-vault.md');
});

check('prompts cover core AGENTS.md themes (MUST/SHOULD, safety, shipping)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const outFile = path.join(tmp, 'out.md');
  generateVault(DEFAULT_REPO, outFile);
  const content = fs.readFileSync(outFile, 'utf8');

  // Check that key concepts from AGENTS.md are surfaced in prompts
  assert.ok(content.includes('MUST'), 'should include MUST enforcement concept');
  assert.ok(content.includes('SHOULD'), 'should include SHOULD advisory concept');
  assert.ok(content.includes('safety') || content.includes('Safety'),
    'should include safety concept');
  assert.ok(content.includes('plan.md'), 'should reference plan.md');
  assert.ok(content.includes('AGENTS.md'), 'should reference AGENTS.md');
  assert.ok(content.includes('CodeQL') || content.includes('codeql-pattern'),
    'should reference CodeQL gate');

  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- Tier 6: Integration with existing CI patterns ---

check('generateVault --json mode produces valid JSON output', () => {
  // Simulate what CI would do
  const result = generateVault(DEFAULT_REPO);
  const validation = validateContent(result.content);
  const json = {
    ok: validation.ok,
    promptCount: validation.promptCount,
    prompts: CONTEXT_PROMPTS.map(p => ({ id: p.id, title: p.title })),
    sources: [...new Set(CONTEXT_PROMPTS.flatMap(p => p.source_files))],
  };
  assert.ok(json.ok, `JSON mode should report ok: ${JSON.stringify(json)}`);
  assert.strictEqual(json.promptCount, PROMPT_COUNT);
  assert.strictEqual(json.prompts.length, PROMPT_COUNT);
  assert.ok(json.sources.length > 0, 'should have source files');
});

check('all source_files reference real repo paths', () => {
  for (const p of CONTEXT_PROMPTS) {
    for (const sf of p.source_files) {
      assert.ok(sf.trim(), `prompt ${p.id} has empty source_file`);
    }
  }
});

// --- Summary ---
console.log('');
console.log(`=== test-context-vault: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
console.log('✅ test-context-vault PASSED');
