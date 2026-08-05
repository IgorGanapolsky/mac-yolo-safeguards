#!/usr/bin/env node
'use strict';

/**
 * test-session-context.js — Validates the context-engineering layer itself.
 *
 * This is the "is my agent infrastructure healthy?" test suite. It checks:
 *   1. ~/.claude/settings.json is valid JSON with required hook chains
 *   2. All referenced hook scripts exist and are executable
 *   3. .mcp.json is valid and declares required MCP servers
 *   4. SKILLS.md registry is well-formed (every skill has a health-checkable path)
 *   5. bin/agent-loop exists and produces structured output
 *   6. RAG / grepai index is non-dead (index bytes > threshold)
 *
 * Run:  node tests/test-session-context.js
 *       node tests/test-session-context.js --json
 *
 * Maps to HuggingFace Context Course Unit 2 (MCP) + Unit 5 (Hooks).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MCP_PATH = path.join(ROOT, '.mcp.json');
const SKILLS_PATH = path.join(ROOT, 'SKILLS.md');
const AGENT_LOOP_PATH = path.join(ROOT, 'bin', 'agent-loop');
const GREPAI_STATS = path.join(ROOT, '.grepai', 'stats.json');
const GREPAI_INDEX = path.join(os.homedir(), '.hermes', 'semantic-index', 'mac-yolo-safeguards');

const MIN_INDEX_BYTES = 10_000;
const REQUIRED_MCP_SERVERS = ['grepai']; // thumbgate is host-dependent — checked softly below
const REQUIRED_SKILL_HEALTH = [
  'agent-session-start',
  'social-publish-gate',
  'mac-freeze-rescue',
];

const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

let passed = 0;
let failed = 0;
const failures = [];
const warnings = [];

// Checks that depend on local Mac resources (~/.claude, ~/.hermes, etc.)
// are skipped in CI where those resources don't exist.
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
  }
}

// Like check() but skips (as a warning) in CI environment
function local_check(name, fn) {
  if (IS_CI) {
    warn(name, 'skipped in CI (local-only check)');
    return;
  }
  check(name, fn);
}

// Like check() but always runs, but failure is a warning not an error
function soft_check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    warnings.push({ name, message: err.message });
  }
}

function warn(name, msg) {
  warnings.push({ name, message: msg });
}

// ─── 1. Claude Settings Hooks (local-Mac only) ─────────────────────────────

local_check('claude settings.json exists', () => {
  assert.ok(fs.existsSync(CLAUDE_SETTINGS), `${CLAUDE_SETTINGS} not found`);
});

local_check('claude settings.json is valid JSON', () => {
  const raw = fs.readFileSync(CLAUDE_SETTINGS, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(data.hooks, 'settings.json missing hooks section');
});

local_check('claude settings.json has SessionStart hooks', () => {
  const data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  assert.ok(data.hooks?.SessionStart, 'No SessionStart hooks');
});

local_check('claude settings.json has UserPromptSubmit hooks', () => {
  const data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  assert.ok(data.hooks?.UserPromptSubmit, 'No UserPromptSubmit hooks');
});

local_check('claude settings.json has PreToolUse hooks', () => {
  const data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  assert.ok(data.hooks?.PreToolUse, 'No PreToolUse hooks');
});

// ─── 2. Hook Script Paths Resolve ───────────────────────────────────────────

function extractHookCommands(data) {
  const cmds = [];
  const hookTypes = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'];
  for (const type of hookTypes) {
    const entries = data.hooks?.[type];
    if (!entries) continue;
    for (const entry of entries) {
      if (Array.isArray(entry)) {
        for (const h of entry) {
          if (h.command) cmds.push(h);
        }
      } else if (entry.hooks) {
        for (const h of entry.hooks) {
          if (h.command) cmds.push(h);
        }
      } else if (entry.command) {
        cmds.push(entry);
      }
    }
  }
  return cmds;
}

local_check('all hook command paths exist', () => {
  const data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  const cmds = extractHookCommands(data);
  assert.ok(cmds.length > 0, 'No hook commands found');
  for (const c of cmds) {
    const cmd = c.command;
    // Extract the script path from commands like "node /path/to/script.js" or "bash /path/to/script.sh"
    const parts = cmd.split(/\s+/);
    if (parts[0] === 'bash' || parts[0] === 'sh' || parts[0] === 'node') {
      const scriptPath = parts[1];
      if (scriptPath && scriptPath.startsWith('/')) {
        assert.ok(
          fs.existsSync(scriptPath),
          `Hook script not found: ${scriptPath} (from command: ${cmd})`,
        );
      }
    }
  }
});

local_check('settings.json mcpServers are configured', () => {
  const data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'));
  assert.ok(data.mcpServers, 'No mcpServers in settings.json');
  const servers = Object.keys(data.mcpServers);
  assert.ok(servers.length > 0, 'No MCP servers configured');
});

// ─── 3. .mcp.json Validation ─────────────────────────────────────────────────

check('.mcp.json exists', () => {
  assert.ok(fs.existsSync(MCP_PATH), `${MCP_PATH} not found`);
});

check('.mcp.json is valid JSON', () => {
  const raw = fs.readFileSync(MCP_PATH, 'utf8');
  JSON.parse(raw);
});

check('.mcp.json has required MCP servers', () => {
  const data = JSON.parse(fs.readFileSync(MCP_PATH, 'utf8'));
  assert.ok(data.mcpServers, '.mcp.json missing mcpServers');
  for (const server of REQUIRED_MCP_SERVERS) {
    assert.ok(
      data.mcpServers[server],
      `Required MCP server "${server}" not found in .mcp.json`,
    );
  }
});

soft_check('thumbgate MCP is registered', () => {
  const data = JSON.parse(fs.readFileSync(MCP_PATH, 'utf8'));
  // thumbgate is host-dependent (requires local ThumbGate install) — warn if missing
  assert.ok(
    data.mcpServers && data.mcpServers.thumbgate,
    'MCP server "thumbgate" not found in .mcp.json — host-dependent, may be optional on some machines',
  );
});

// ─── 4. SKILLS.md Registry Validation ────────────────────────────────────────

check('SKILLS.md exists', () => {
  assert.ok(fs.existsSync(SKILLS_PATH), `${SKILLS_PATH} not found`);
});

check('SKILLS.md has skill entries', () => {
  const raw = fs.readFileSync(SKILLS_PATH, 'utf8');
  // Look for the skill table
  const tableMatch = raw.match(/\| Skill \| Trigger |/i);
  assert.ok(tableMatch, 'SKILLS.md does not contain a skill table');
});

check('SKILLS.md critical skills have health checks', () => {
  const raw = fs.readFileSync(SKILLS_PATH, 'utf8');
  for (const skill of REQUIRED_SKILL_HEALTH) {
    // Skill should appear as a row in the table
    const skillRow = raw.split('\n').find((line) =>
      line.toLowerCase().startsWith(`| \`${skill}\``),
    );
    assert.ok(
      skillRow,
      `Skill "${skill}" not found in SKILLS.md table`,
    );
  }
});

check('SKILLS.md skill paths/dirs resolve', () => {
  const raw = fs.readFileSync(SKILLS_PATH, 'utf8');
  const lines = raw.split('\n');
  // Match table rows that start with | `skill-name`
  const tableLines = lines.filter((l) => l.startsWith('| `') && !l.includes('Skill |') && !l.includes('---'));

  for (const line of tableLines) {
    const cols = line.split('|').map((c) => c.trim());
    // cols[1] is skill name (with backticks), cols[3] is definition path (with backticks)
    if (cols.length < 4) continue;
    // Strip backticks from definition path
    let definition = cols[3].replace(/`/g, '').trim();
    if (!definition) continue;

    // Handle composite paths like "docs/agents/coordination.md + plan.md"
    // Take the first path component (the primary reference)
    let primaryDef = definition.split(' + ')[0].split(' (')[0].trim();

    // Determine if this is a home-relative (~) path — these are local-Mac only
    const isHomeRelative = primaryDef.startsWith('~');

    // Handle ~ (home-relative) paths
    let resolvedPath;
    if (isHomeRelative) {
      resolvedPath = path.join(os.homedir(), primaryDef.slice(2));
    } else {
      resolvedPath = path.join(ROOT, primaryDef);
    }

    // For .maestro paths, they're relative to hermes-mobile/, not repo root
    const checkPaths = [resolvedPath];
    if (primaryDef.startsWith('.maestro/')) {
      checkPaths.push(path.join(ROOT, 'hermes-mobile', primaryDef));
    }
    // For .yaml files, also check without extension (some entries reference flows)
    if (primaryDef.endsWith('.yaml')) {
      checkPaths.push(...checkPaths.map((p) => p.replace(/\.yaml$/, '')));
    }

    const exists = checkPaths.some((p) => fs.existsSync(p));
    if (!exists) {
      if (isHomeRelative && IS_CI) {
        // Home-relative paths are local-Mac resources — skip in CI
        warn(`SKILLS.md ${primaryDef}`, `home-relative path not found (CI) — local-only resource`);
      } else if (isHomeRelative) {
        // Even locally, some home-relative paths may not exist yet
        warn(`SKILLS.md ${primaryDef}`, `home-relative path not found — may need local setup`);
      } else {
        assert.ok(exists, `SKILLS.md entry definition path not found: ${primaryDef} → checked: ${checkPaths.join(', ')}`);
      }
    }
  }
});

// ─── 5. bin/agent-loop ───────────────────────────────────────────────────────

check('bin/agent-loop exists and is executable', () => {
  assert.ok(fs.existsSync(AGENT_LOOP_PATH), `${AGENT_LOOP_PATH} not found`);
  const stat = fs.statSync(AGENT_LOOP_PATH);
  assert.ok(
    stat.mode & 0o111,
    'bin/agent-loop is not executable',
  );
});

check('tools/validate-skills-registry.js lints all repo skills clean', () => {
  const validatorPath = path.join(ROOT, 'tools', 'validate-skills-registry.js');
  assert.ok(fs.existsSync(validatorPath), 'validate-skills-registry.js not found');
  const output = execFileSync('node', [validatorPath, '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.ok, true, `Skill linter reported errors: ${JSON.stringify(parsed.skills.filter((s) => !s.valid))}`);
  assert.ok(parsed.totalSkills > 0, 'No skills discovered');
});

check('Anti-AI-Washing stack (telemetry, vendor checklist, benchmark drift) is healthy', () => {
  const telemetryTest = path.join(ROOT, 'tests', 'test-model-telemetry.js');
  const vendorTest = path.join(ROOT, 'tests', 'test-ai-vendor-checklist.js');
  const benchTest = path.join(ROOT, 'tests', 'test-benchmark-model-drift.js');
  execFileSync('node', [telemetryTest], { encoding: 'utf8' });
  execFileSync('node', [vendorTest], { encoding: 'utf8' });
  execFileSync('node', [benchTest], { encoding: 'utf8' });
});

// ─── 6. RAG / Grepai Index Health ────────────────────────────────────────────

soft_check('grepai index is non-trivial', () => {
  if (!fs.existsSync(GREPAI_INDEX)) {
    warn('grepai index', `Index dir ${GREPAI_INDEX} not found — RAG may be offline`);
    return;
  }
  // Recursively sum all file sizes — statSync on a directory returns the
  // inode size (a few KB), not the actual content (which can be hundreds of MB).
  let sizeBytes = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) sizeBytes += fs.statSync(full).size;
    }
  };
  walk(GREPAI_INDEX);
  if (sizeBytes < MIN_INDEX_BYTES) {
    warn(
      'grepai index',
      `Index dir ${GREPAI_INDEX} is only ${sizeBytes} bytes — likely dead. Run: grepai watch`,
    );
  }
});

// ─── 7. Agent Loop Produces Structured Output ────────────────────────────────

soft_check('agent-loop --health returns structured JSON', () => {
  try {
    const out = execFileSync(AGENT_LOOP_PATH, ['--health', '--json'], {
      encoding: 'utf8',
      timeout: 30_000,
      cwd: ROOT,
    });
    const data = JSON.parse(out);
    assert.ok(data.hooks !== undefined, 'agent-loop --health missing "hooks" field');
    assert.ok(data.metrics !== undefined, 'agent-loop --health missing "metrics" field');
    assert.ok(data.learning !== undefined, 'agent-loop --health missing "learning" field');
    // Verify hooks sub-fields exist
    const hooksData = typeof data.hooks === 'string' ? JSON.parse(data.hooks) : data.hooks;
    assert.ok(hooksData.hooks_valid_json !== undefined, 'hooks missing hooks_valid_json');
    assert.ok(hooksData.e2e_status !== undefined, 'hooks missing e2e_status');
  } catch (err) {
    if (err.status !== undefined) {
      assert.fail(`agent-loop --health exited with code ${err.status}: ${err.stderr || err.message}`);
    }
    assert.fail(`agent-loop --health did not produce valid JSON: ${err.message}`);
  }
});

// ─── 8. Stacked PR & Dead Code Verifier Integration ─────────────────────────

check('pr-stack-verifier.js script exists and runs', () => {
  const verifierScript = path.join(ROOT, 'tools/pr-stack-verifier.js');
  assert.ok(fs.existsSync(verifierScript), 'pr-stack-verifier.js missing in tools/');
  const verifier = require(verifierScript);
  const result = verifier.verifyPrStackHygiene();
  assert.ok(result.ok !== undefined, 'verifyPrStackHygiene missing ok boolean');
});

// ─── Report ──────────────────────────────────────────────────────────────────

function main() {
  const json = process.argv.slice(2).includes('--json');

  if (json) {
    console.log(JSON.stringify({
      passed,
      failed,
      warnings: warnings.length,
      warningDetails: warnings,
      failures,
      suite: 'test-session-context',
      timestamp: new Date().toISOString(),
    }, null, 2));
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log(`\n=== Session Context Test Suite ===\n`);
  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Warned:  ${warnings.length}\n`);

  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const w of warnings) {
      console.log(`  ⚠ ${w.name}: ${w.message}`);
    }
    console.log();
  }

  if (failed === 0) {
    console.log('✅ All context-engineering checks green');
  } else {
    console.log(`❌ ${failed} check(s) failed`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
