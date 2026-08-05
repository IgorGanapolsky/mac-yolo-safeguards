#!/usr/bin/env node
'use strict';

/**
 * Context Engineering Diagnostic Harness
 * ---------------------------------------
 * Purpose:
 *   Validates the codebase against the Hugging Face Context Course (Units 0-6)
 *   engineering standards. Ensures system prompts stay within token budgets, skills
 *   follow frontmatter standards, KV-cache heads are static, and PreToolUse safety
 *   gates are active.
 *
 * Background & Architecture:
 *   Context Engineering manages how LLM prompts and context windows are structured.
 *   This harness runs 6 automated diagnostic layers:
 *
 *   1. Prompt Footprint & Token Budget (Units 1 & 6):
 *      Measures AGENTS.md character count to ensure the top-level system prompt stays
 *      under ~3,200-4,000 tokens (avoiding slow prefill times on local models).
 *
 *   2. Skills Metadata & Line Limits (Unit 1):
 *      Audits all skill files (.agents/skills/[name]/SKILL.md) to ensure valid YAML
 *      frontmatter (name, description) and strictly caps instructions under 500 lines.
 *
 *   3. KV-Cache Prefix Optimization (Units 1 & 6):
 *      Verifies that static, immutable directives stay at the top of AGENTS.md (for KV-cache
 *      reuse) while dynamic links/indices are isolated at the tail.
 *
 *   4. PreToolUse Safety Hooks & Guardrails (Unit 5):
 *      Ensures high-risk operations (social publishing, secret storage) are guarded by
 *      executable verification scripts (social-publish-gate.js, secret-store.js).
 *
 *   5. RAG & Decision Stack Retrieval (Units 2 & 4):
 *      Verifies that agent decision stack tools load cleanly for structured RAG lookups.
 *
 *   6. Session-Context Layer Verification (Unit 5):
 *      Recursively invokes tests/test-session-context.js to validate system context health.
 *
 * Usage:
 *   node tools/context-engineering-harness.js        # Output human-readable report
 *   node tools/context-engineering-harness.js --json # Output structured JSON for CI/CD
 *
 * Environment Variables:
 *   SKIP_SESSION_CONTEXT_TEST=1  Prevents infinite recursion when invoked by test-session-context.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Define key paths relative to repository root
const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS_MD = path.join(REPO_ROOT, 'AGENTS.md');
const CONTEXT_MD = path.join(REPO_ROOT, 'docs/agents/context-engineering.md');
const SKILLS_DIR = path.join(REPO_ROOT, '.agents/skills');
const SOCIAL_GATE = path.join(REPO_ROOT, 'tools/social-publish-gate.js');
const SECRET_STORE = path.join(REPO_ROOT, 'tools/secret-store.js');
const DECISION_STACK = path.join(REPO_ROOT, 'tools/agent-decision-stack.js');
const SESSION_CONTEXT_TEST = path.join(REPO_ROOT, 'tests/test-session-context.js');

// Parse --json CLI argument flag
const JSON_MODE = process.argv.slice(2).includes('--json');

// Global test counters and check registry
const checks = [];
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

/**
 * Registers and logs a diagnostic assertion.
 *
 * @param {string} name - Human-readable description of the check.
 * @param {boolean} condition - Boolean result (true = PASS, false = FAIL).
 * @param {string} [details=''] - Additional contextual metadata (e.g. token counts, paths).
 */
function check(name, condition, details = '') {
  totalChecks++;
  const ok = !!condition;
  if (ok) passedChecks++; else failedChecks++;
  checks.push({ name, ok, details });
  if (!JSON_MODE) {
    console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name}${details ? ' — ' + details : ''}`);
  }
}

/**
 * Executes a CLI command synchronously and captures JSON/stdout/stderr safely.
 *
 * @param {string} cmd - Executable name (e.g. 'node').
 * @param {string[]} args - Array of command-line arguments.
 * @param {Record<string, string>} [env={}] - Additional environment variables.
 * @returns {{ ok: boolean, stdout: string, stderr: string, status?: number, message?: string }}
 */
function runJson(cmd, args, env = {}) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: { ...process.env, ...env }
    });
    return { ok: true, stdout: out, stderr: '' };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '', status: err.status, message: err.message };
  }
}

/**
 * Main execution function driving the 6 Context Engineering diagnostic layers.
 */
function main() {
  if (!JSON_MODE) {
    console.log('====================================================');
    console.log('CONTEXT ENGINEERING DIAGNOSTIC HARNESS (HF UNITS 0-6)');
    console.log('====================================================\n');
  }

  // ---------------------------------------------------------------------------
  // Layer 1: Prompt Footprint & Token Budget (Units 1 & 6)
  // Ensures AGENTS.md system prompt stays compact (<4,000 tokens) for fast KV prefill.
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('--- 1. Prompt Footprint & Token Budget (Unit 1 & 6) ---');
  if (fs.existsSync(AGENTS_MD)) {
    const content = fs.readFileSync(AGENTS_MD, 'utf8');
    const charCount = content.length;
    const approxTokens = Math.round(charCount / 4); // ~4 chars per token rule of thumb
    check('AGENTS.md Token Budget < 4000 tokens', approxTokens < 4000, `chars=${charCount} tokens≈${approxTokens}`);
  } else {
    check('AGENTS.md Exists', false, 'file not found');
  }
  check('Context Engineering Architecture Doc Exists', fs.existsSync(CONTEXT_MD), CONTEXT_MD);

  // ---------------------------------------------------------------------------
  // Layer 2: Skills Metadata & Line Limits (Unit 1)
  // Audits all skill SKILL.md files to enforce YAML frontmatter and line caps (<500 lines).
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 2. Skills Metadata & Line Limits (Unit 1) ---');
  if (fs.existsSync(SKILLS_DIR)) {
    const folders = fs.readdirSync(SKILLS_DIR).filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory());
    for (const folder of folders) {
      const skillPath = path.join(SKILLS_DIR, folder, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf8');
        const lines = content.split('\n');
        const hasFrontmatter = content.startsWith('---') && content.indexOf('---', 3) > 3;
        const hasName = /^name:\s*.+/m.test(content);
        const hasDescription = /^description:\s*.+/m.test(content);
        check(`Skill '${folder}' YAML Frontmatter`, hasFrontmatter && hasName && hasDescription, `${lines.length} lines`);
        check(`Skill '${folder}' Line Count (<500 lines)`, lines.length < 500, `${lines.length} lines`);
      } else {
        check(`Skill '${folder}' SKILL.md exists`, false, skillPath);
      }
    }
  } else {
    check('Skills Directory Exists', false, SKILLS_DIR);
  }

  // ---------------------------------------------------------------------------
  // Layer 3: KV-Cache Prefix Optimization (Units 1 & 6)
  // Verifies that static directives stay at prompt top (head) while dynamic links stay at tail.
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 3. KV-Cache Prefix Optimization (Unit 1 & 6) ---');
  if (fs.existsSync(AGENTS_MD)) {
    const content = fs.readFileSync(AGENTS_MD, 'utf8');
    const lines = content.split('\n');
    const first10 = lines.slice(0, 10).join('\n');
    const last20 = lines.slice(-20).join('\n');
    check('Static Prompt Head (KV Cache Matchable)', /AGENTS\.md/i.test(first10) && /operating directives/i.test(first10), 'top lines contain stable title & directive header');
    check('Dynamic Prompt Tail Isolated (Detail Index)', /Detail index/i.test(last20) && /docs\/agents\//.test(last20), 'tail contains detail links, not new directives');
  }

  // ---------------------------------------------------------------------------
  // Layer 4: PreToolUse Safety Hooks & Guardrails (Unit 5)
  // Ensures safety scripts exist to block destructive actions or credential leaks.
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 4. PreToolUse Safety Hooks & Guardrails (Unit 5) ---');
  check('Publish Safety Gate Executable Exists', fs.existsSync(SOCIAL_GATE), SOCIAL_GATE);
  check('Zero-Leak Secret Store Script Exists', fs.existsSync(SECRET_STORE), SECRET_STORE);

  // ---------------------------------------------------------------------------
  // Layer 5: RAG & Decision Stack Retrieval (Units 2 & 4)
  // Verifies that agent decision stack tools load cleanly for structured RAG lookups.
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 5. RAG & Decision Stack Retrieval (Unit 2 & 4) ---');
  check('Agent Decision Stack Script Exists', fs.existsSync(DECISION_STACK), DECISION_STACK);
  if (fs.existsSync(DECISION_STACK)) {
    const result = runJson('node', ['-e', 'require(process.argv[1])', DECISION_STACK]);
    check('Agent Decision Stack Preflight Check', result.ok, result.ok ? 'module loads cleanly' : (result.stderr || result.message));
  }

  // ---------------------------------------------------------------------------
  // Layer 6: Session-Context Layer Verification (Unit 5)
  // Recursively invokes tests/test-session-context.js to audit system context health.
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 6. Session-Context Layer Verification (Unit 5) ---');
  if (!process.env.SKIP_SESSION_CONTEXT_TEST) {
    if (fs.existsSync(SESSION_CONTEXT_TEST)) {
      const result = runJson('node', [SESSION_CONTEXT_TEST, '--json'], { SKIP_SESSION_CONTEXT_TEST: '1' });
      let parsed = null;
      try { parsed = JSON.parse(result.stdout); } catch (e) {}
      check('Session Context Test Runs Cleanly', result.ok && parsed !== null, parsed ? `passed=${parsed.passed} failed=${parsed.failed}` : (result.stderr || result.message || 'no JSON'));
      if (parsed) {
        check('Session Context Test Has Zero Failures', parsed.failed === 0, `failed=${parsed.failed}`);
      }
    } else {
      check('Session Context Test Script Exists', false, SESSION_CONTEXT_TEST);
    }
  } else {
    check('Session Context Test Recursion Guard', true, 'SKIP_SESSION_CONTEXT_TEST=1');
  }

  // ---------------------------------------------------------------------------
  // Layer 7: HF Multi-Agent Skill Registry & Manifest Verification (Unit 1 & HuggingFace Skills)
  // Verifies skill manifest generator tool and outputs (SKILLS.md, gemini-extension.json, .cursor-plugin/plugin.json).
  // ---------------------------------------------------------------------------
  if (!JSON_MODE) console.log('\n--- 7. HF Multi-Agent Skill Registry & Manifest Verification ---');
  const SKILL_MANIFEST_TOOL = path.join(REPO_ROOT, 'tools/skill-manifest-sync.js');
  check('Skill Manifest Generator Script Exists', fs.existsSync(SKILL_MANIFEST_TOOL), SKILL_MANIFEST_TOOL);
  if (fs.existsSync(SKILL_MANIFEST_TOOL)) {
    const result = runJson('node', [SKILL_MANIFEST_TOOL, '--check']);
    check('Multi-Agent Skill Manifests Up-To-Date', result.ok, result.ok ? 'SKILLS.md synced' : (result.stderr || result.message));
  }
  if (!JSON_MODE) {
    console.log('\n====================================================');
    console.log(`HARNESS AUDIT RESULT: ${passedChecks}/${totalChecks} PASSED`);
    console.log('====================================================\n');
  }

  const summary = {
    suite: 'context-engineering-harness',
    timestamp: new Date().toISOString(),
    total: totalChecks,
    passed: passedChecks,
    failed: failedChecks,
    ok: failedChecks === 0,
    checks
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (failedChecks > 0) {
    console.error(`${failedChecks} checks failed context engineering criteria.`);
    process.exit(1);
  } else {
    console.log('All Context Engineering checks PASSED cleanly.');
    process.exit(0);
  }

  if (failedChecks > 0) process.exit(1);
}

main();
