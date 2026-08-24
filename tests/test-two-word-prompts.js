'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  PROMPT_COUNT,
  CONTEXT_PROMPTS,
  listPrompts,
  listAll,
  resolvePrompt,
  getRole,
  getTool,
  validateContent,
  validateMarkdown,
  generateMarkdown,
} = require('../tools/two-word-prompts.js');

// ── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  [PASS] ' + name);
  } catch (err) {
    failed++;
    console.error('  [FAIL] ' + name + ' — ' + (err.message || err));
  }
}

// ── registry integrity ─────────────────────────────────────────────────────

check('PROMPT_COUNT is 18', () => {
  assert.strictEqual(PROMPT_COUNT, 18);
});

check('CONTEXT_PROMPTS has exactly 18 entries', () => {
  assert.strictEqual(CONTEXT_PROMPTS.length, 18);
});

check('listPrompts returns the same array', () => {
  assert.strictEqual(listPrompts().length, 18);
});

check('listAll returns 18 plain objects', () => {
  const all = listAll();
  assert.strictEqual(all.length, 18);
  assert.deepStrictEqual(all, CONTEXT_PROMPTS.map((e) => ({
    prompt: e.prompt,
    role: e.role,
    purpose: e.purpose,
    repo_tool: e.repo_tool,
    repo_mapping: e.repo_mapping,
  })));
});

check('validateContent returns ok=true with 0 errors', () => {
  const v = validateContent();
  assert.ok(v.ok, 'validateContent should return ok=true');
  assert.strictEqual(v.promptCount, 18);
  assert.strictEqual(v.expected, 18);
  assert.strictEqual(v.errors.length, 0);
});

check('all 18 Allie K. Miller prompts are present', () => {
  const expected = [
    'now what', 'plz fix', 'do this', 'interview me', 'keep going!',
    'elii elie', 'first principles?', 'simulate it', 'challenge me',
    'da fuq?', 'find leverage', 'hey simon', 'spawn agents',
    'automate this', 'remember this', 'forecast impact',
    'show receipts', 'girl bye',
  ];
  const actual = CONTEXT_PROMPTS.map((e) => e.prompt);
  expected.forEach((p) => {
    assert.ok(actual.includes(p), 'Expected prompt "' + p + '" is missing');
  });
});

// ── each prompt has required fields ─────────────────────────────────────────

CONTEXT_PROMPTS.forEach(function (entry) {
  check(entry.prompt + ' has non-empty prompt field', function () {
    assert.ok(entry.prompt && typeof entry.prompt === 'string');
  });
  check(entry.prompt + ' has non-empty role field', function () {
    assert.ok(entry.role && typeof entry.role === 'string');
  });
  check(entry.prompt + ' has non-empty purpose field', function () {
    assert.ok(entry.purpose && typeof entry.purpose === 'string');
  });
  check(entry.prompt + ' has non-empty repo_tool field', function () {
    assert.ok(entry.repo_tool && typeof entry.repo_tool === 'string');
  });
  check(entry.prompt + ' has non-empty repo_mapping field', function () {
    assert.ok(entry.repo_mapping && typeof entry.repo_mapping === 'string');
  });
});

// ── resolvePrompt ───────────────────────────────────────────────────────────

check('resolvePrompt finds "now what" exactly', () => {
  const entry = resolvePrompt('now what');
  assert.ok(entry);
  assert.strictEqual(entry.prompt, 'now what');
});

check('resolvePrompt is case-insensitive', () => {
  const entry = resolvePrompt('NOW WHAT');
  assert.ok(entry);
  assert.strictEqual(entry.prompt, 'now what');
});

check('resolvePrompt matches by prefix', () => {
  const entry = resolvePrompt('now');
  assert.ok(entry);
  assert.strictEqual(entry.prompt, 'now what');
});

check('resolvePrompt returns null for unknown prompt', () => {
  assert.strictEqual(resolvePrompt('totally unknown'), null);
});

check('resolvePrompt handles empty input', () => {
  assert.strictEqual(resolvePrompt(''), null);
  assert.strictEqual(resolvePrompt(null), null);
  assert.strictEqual(resolvePrompt(undefined), null);
});

// ── getRole ─────────────────────────────────────────────────────────────────

check('getRole returns correct role for "now what"', () => {
  assert.strictEqual(getRole('now what'), 'next-actions advisor');
});

check('getRole returns correct role for "plz fix"', () => {
  assert.strictEqual(getRole('plz fix'), 'debugger');
});

check('getRole returns correct role for "interview me"', () => {
  assert.strictEqual(getRole('interview me'), 'context gatherer');
});

check('getRole returns correct role for "challenge me"', () => {
  assert.strictEqual(getRole('challenge me'), 'critical sparring partner');
});

check('getRole returns null for unknown prompt', () => {
  assert.strictEqual(getRole('nope nop'), null);
});

// ── getTool ─────────────────────────────────────────────────────────────────

check('getTool returns correct tool for "now what"', () => {
  const tool = getTool('now what');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('agent-decision-stack'));
});

check('getTool returns correct tool for "plz fix"', () => {
  const tool = getTool('plz fix');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('codeql-pattern-gate'));
});

check('getTool returns correct tool for "interview me"', () => {
  const tool = getTool('interview me');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('context-vault'));
});

check('getTool returns correct tool for "show receipts"', () => {
  const tool = getTool('show receipts');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('skill-card-validate'));
});

check('getTool returns correct tool for "spawn agents"', () => {
  const tool = getTool('spawn agents');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('agent-loop'));
});

check('getTool returns correct tool for known prompt', () => {
  const tool = getTool('show receipts');
  assert.ok(tool, 'should return tool string');
  assert.ok(tool.includes('skill-card-validate'));
});

check('getTool returns null for unknown prompt', () => {
  assert.strictEqual(getTool('not a real prompt'), null);
});

// ── forecast impact maps to risk analyst and hygiene audit ──────────────────

check('forecast impact maps to risk analyst and 5-walls gate', () => {
  const entry = resolvePrompt('forecast impact');
  assert.ok(entry);
  assert.strictEqual(entry.role, 'risk / downstream analyst');
  assert.ok(entry.repo_tool.includes('codeql-agent-hygiene'),
    'repo_tool should reference codeql-agent-hygiene, got: ' + entry.repo_tool);
});

// ── repo_tool references resolve to existing files ──────────────────────────

check('all repo_tool references point to existing files', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const missing = [];

  for (const entry of CONTEXT_PROMPTS) {
    const toolRef = entry.repo_tool;
    // All tool refs start with either "node tools/..." or "bash bin/..."
    // Extract the file path
    const match = toolRef.match(/^(?:node\s+|bash\s+)?(.+?)(?:\s+|$)/);
    if (!match) {
      missing.push(entry.prompt + ': cannot parse tool ref "' + toolRef + '"');
      continue;
    }
    const toolPath = path.join(repoRoot, match[1]);
    if (!fs.existsSync(toolPath)) {
      missing.push(entry.prompt + ': tool file does not exist at ' + toolPath);
    }
  }

  if (missing.length > 0) {
    assert.fail('Some tool references do not exist:\n' + missing.join('\n'));
  }
});

// ── repo_mapping references are valid URLs ──────────────────────────────────

check('all repo_mapping references are valid GitHub URLs', () => {
  for (const entry of CONTEXT_PROMPTS) {
    assert.ok(entry.repo_mapping.startsWith('https://github.com/'),
      'repo_mapping should start with https://github.com/ — got: ' + entry.repo_mapping);
    assert.ok(entry.repo_mapping.includes('/blob/main/'),
      'repo_mapping should contain /blob/main/ — got: ' + entry.repo_mapping);
  }
});

// ── generateMarkdown / validateMarkdown ──────────────────────────────────────

check('generateMarkdown produces non-empty markdown', () => {
  const md = generateMarkdown();
  assert.ok(md.length > 100, 'markdown should be substantial');
  assert.ok(md.includes('18 Two-Word AI Prompts'));
  assert.ok(md.includes('Allie K. Miller'));
});

check('generateMarkdown includes all 18 prompts', () => {
  const md = generateMarkdown();
  for (const entry of CONTEXT_PROMPTS) {
    assert.ok(md.includes(entry.prompt), 'Markdown should include prompt: ' + entry.prompt);
    assert.ok(md.includes(entry.role), 'Markdown should include role: ' + entry.role);
  }
});

check('validateMarkdown passes on generated markdown', () => {
  const md = generateMarkdown();
  const result = validateMarkdown(md);
  assert.ok(result.ok, 'validateMarkdown should pass on generated content. Errors: ' + JSON.stringify(result.errors));
});

check('validateMarkdown fails on empty string', () => {
  const result = validateMarkdown('');
  assert.ok(!result.ok, 'validateMarkdown should fail on empty input');
});

// ── CLI integration ─────────────────────────────────────────────────────────

check('CLI --json outputs valid JSON with ok=true', () => {
  const output = execFileSync('node', ['tools/two-word-prompts.js', '--json'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  const data = JSON.parse(output);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.promptCount, 18);
  assert.strictEqual(data.expected, 18);
  assert.strictEqual(data.findingCount, 0);
});

check('CLI list outputs all 18 prompts', () => {
  const output = execFileSync('node', ['tools/two-word-prompts.js', 'list'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  for (const entry of CONTEXT_PROMPTS) {
    assert.ok(output.includes(entry.prompt), 'CLI list should include: ' + entry.prompt);
  }
  assert.ok(output.includes('Total: 18/18'));
});

check('CLI resolve outputs JSON for known prompt', () => {
  const output = execFileSync('node', ['tools/two-word-prompts.js', 'resolve', 'now what'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  const data = JSON.parse(output);
  assert.strictEqual(data.prompt, 'now what');
  assert.ok(data.role);
  assert.ok(data.repo_tool);
});

check('CLI generate works without --out (stdout)', () => {
  const output = execFileSync('node', ['tools/two-word-prompts.js', 'generate'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.ok(output.includes('Two-Word AI Prompts'));
});

check('CLI generate --out writes file', () => {
  const tmpDir = require('os').tmpdir();
  const tmpPath = path.join(tmpDir, 'two-word-test-' + Date.now() + '.md');
  execFileSync('node', ['tools/two-word-prompts.js', 'generate', '--out', tmpPath], {
    cwd: path.resolve(__dirname, '..'),
  });
  assert.ok(fs.existsSync(tmpPath), 'Output file should exist');
  const content = fs.readFileSync(tmpPath, 'utf8');
  assert.ok(content.includes('Two-Word AI Prompts'));
  fs.unlinkSync(tmpPath);
});

// ── No dangerous patterns (CodeQL pre-check) ─────────────────────────────────

check('source passes CodeQL pattern gate', () => {
  const toolPath = path.resolve(__dirname, '../tools/two-word-prompts.js');
  const output = execFileSync('node', ['tools/codeql-pattern-gate.js', '--json', 'tools/two-word-prompts.js'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  const data = JSON.parse(output);
  assert.ok(data.ok, 'CodeQL pattern gate should pass. Findings: ' + JSON.stringify(data.findings));
});

// ── summary ──────────────────────────────────────────────────────────────────

(function summary() {
  console.log('');
  console.log('test-two-word-prompts: ' + passed + ' passed, ' + failed + ' failed');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();
