#!/usr/bin/env node
'use strict';

/**
 * context-vault — Allie K. Miller "AI Context Vault" (8 copy-paste prompts).
 *
 * Generates vendor-agnostic context prompts that help any LLM understand
 * this repo's identity, goals, constraints, and current work state.
 *
 * Inspired by: https://www.alliekmiller.com/resources (AI Context Vault)
 * Maps to HuggingFace Context Course Unit 1 (Skill Registry) and the
 * mac-yolo-safeguards agent protocol in AGENTS.md.
 *
 * CLI:
 *   node tools/context-vault.js generate [--repo PATH] [--out PATH]
 *   node tools/context-vault.js validate [--vault PATH]
 *   node tools/context-vault.js list
 *
 * No external dependencies. No execSync. No shell:true.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(DEFAULT_REPO, 'artifacts', 'context-vault.md');

/**
 * The 8 copy-paste prompts. Each prompt is a self-contained Markdown chunk
 * that any LLM agent can read to understand one dimension of this repo.
 * Metadata fields are populated from repo source files at generate time.
 */
const CONTEXT_PROMPTS = Object.freeze([
  {
    id: 'who-am-i',
    title: 'Who am I?',
    description: 'Identity, role, and repository purpose — the fundamental question every agent should answer first.',
    source_files: ['README.md', 'AGENTS.md'],
    template: `# 1. Who am I?

**Repo:** {{REPO_NAME}}
**Purpose:** {{REPO_PURPOSE}}
**Role:** {{REPO_ROLE}}

You are an autonomous agent working in the \`{{REPO_NAME}}\` repository. This repo is
{{REPO_TAGLINE}}. You operate under the directives in AGENTS.md — read it first, obey it
always. Your primary mission is: {{REPO_MISSION}}.

**Key directives:**
{{DIRECTIVES}}

---
*Source: README.md, AGENTS.md*`,
  },
  {
    id: 'what-matters',
    title: 'What Matters to Me?',
    description: 'Goals, values, and priorities — what this repo cares about most.',
    source_files: ['AGENTS.md', 'plan.md'],
    template: `# 2. What Matters to Me?

**Core values:**
{{VALUES}}

**Primary objectives:**
{{OBJECTIVES}}

**Non-negotiable priorities:**
{{PRIORITIES}}

This repo prioritizes safety over speed, transparency over convenience, and
correctness over velocity. Every decision should be traceable to an evidence
source and reviewed for blast radius.

---
*Source: AGENTS.md, plan.md*`,
  },
  {
    id: 'how-should-you-work',
    title: 'How Should You Work With Me?',
    description: 'Operating protocols, collaboration style, and workflow expectations.',
    source_files: ['AGENTS.md', 'docs/agents/coordination.md'],
    template: `# 3. How Should You Work With Me?

**Workflow protocol:**
{{WORKFLOW}}

**Multi-agent coordination (READ FIRST):**
{{COORDINATION}}

**Change protocol (always follow):**
{{CHANGE_PROTOCOL}}

**Verification gates:**
Every change must pass: (1) tests, (2) CodeQL, (3) CI, (4) plan.md acceptance check.
Never claim "done" without empirical receipts in the same turn.

---
*Source: AGENTS.md, docs/agents/coordination.md, docs/agents/shipping-and-hygiene.md*`,
  },
  {
    id: 'tools-and-access',
    title: 'What Tools and Access Do I Have?',
    description: 'Available skills, tools, and platform access — what agents can use.',
    source_files: ['SKILLS.md', 'bin/agent-loop'],
    template: `# 4. What Tools and Access Do I Have?

**Available skills ({{SKILL_COUNT}} total):**
{{SKILLS}}

**CLI tools:**
- \`bin/agent-loop\` — agent loop validator (health, context, E2E)
- \`tools/skill-card-validate.js\` — skill catalog enforcement (MUST/SHOULD)
- \`tools/codeql-pattern-gate.js\` — CodeQL pattern gate
- \`tools/ship-claim-gate.js\` — evidence gate for fixed, merged, deployed, and revenue claims
- \`tools/hermes-economic-router.js\` — economic model routing
- \`tools/rag-retrieval-eval.js\` — retrieval quality eval

**Protected components:**
ThumbGate MCP retrieval, SessionStart hooks, mac-freeze-rescue skill,
LaunchAgent com.igor.shutdown-simulators (60s interval),
LaunchAgent com.igor.hermes-mobile-continuous-e2e.

**Environment:** Node v22, GitHub Actions (ubuntu-latest + self-hosted macOS), Expo SDK.

---
*Source: SKILLS.md, bin/agent-loop*`,
  },
  {
    id: 'whats-current',
    title: 'What Is Current?',
    description: 'Live work state, in-progress tasks, and blockers.',
    source_files: ['plan.md'],
    template: `# 5. What Is Current?

**Active agents:** {{ACTIVE_AGENTS}}
**Live work:**
{{CURRENT_WORK}}

**Recently released:**
{{RECEIVED}}

**Blockers:**
{{BLOCKED}}

**Status:**
- Branch: {{CURRENT_BRANCH}}
- main SHA: {{MAIN_SHA}}

Check plan.md §2 (File Ownership Map) for claims and §3 (Decisions) for
recent decisions before starting any work.

---
*Source: plan.md*`,
  },
  {
    id: 'hard-constraints',
    title: 'What Are My Hard Constraints?',
    description: 'Non-negotiable rules, guardrails, and safety limits.',
    source_files: ['AGENTS.md'],
    template: `# 6. What Are My Hard Constraints?

**NEVER (directive breach — violating these is a directive breach):**
{{NEVER_LIST}}

**Operational safety:**
- Never write secrets to tracked files
- Hard-to-reverse actions require explicit consent
- \`business_os/\` is gitignored internal ops data
- Expo SDK pins are law — use \`npx expo install --fix\` only
- Must/SHOULD: MUST violations block CI, SHOULD violations are advisory only

**Spend controls:**
- $10/mo hard caps on all cloud LLM providers
- Metered spend requires explicit consent gate
- Default to local models (Ollama, LM Studio) unless paid-ok is set

**Shipping protocol:**
- Commit on isolated worktree branch, never \`git checkout -b\` in shared tree
- Stage only own files, push, PR, merge when green (--auto --squash)
- Must not claim "done" without verification in same turn

---
*Source: AGENTS.md (The "Never" list)*`,
  },
  {
    id: 'what-do-i-know',
    title: 'What Do I Already Know?',
    description: 'Existing knowledge base, documentation, and prior decisions — avoid rehashing.',
    source_files: ['docs/agents/', 'plan.md'],
    template: `# 7. What Do I Already Know?

**Documentation library:**
{{DOCS_TOC}}

**Prior decisions (key highlights):**
{{DECISIONS}}

**Context-engineering framework:**
- Agent loop (Unit 6): \`bin/agent-loop\` — Recollect then Plan then Observe then Act then Evaluate then Learn
- Skill registry (Unit 1): \`SKILLS.md\` — every skill has trigger, path, version, health check
- Context-layer tests (Unit 5): \`tests/test-session-context.js\`
- Publish gate (Unit 3): \`tools/social-publish-gate.js\` + \`tools/verify-public-post.js\`
- Sub-agent handoff (Unit 4): \`scripts/handoff.sh\`

**Knowledge capture:**
Every fix/incident is captured via \`mcp__thumbgate__capture_memory_feedback\` with signal=up/down.
Use \`mcp__thumbgate__recall\` at session start for relevant context.

---
*Source: docs/agents/, plan.md, AGENTS.md*`,
  },
  {
    id: 'next-action',
    title: 'What Is the Next Action?',
    description: 'Current task claims, expected outcomes, and next concrete steps.',
    source_files: ['plan.md'],
    template: `# 8. What Is the Next Action?

**Current task claims:**
{{TASK_CLAIMS}}

**Acceptance criteria for in-progress work:**
- Tests pass: \`node tests/test-<topic>.js\` — exit 0
- CodeQL gate: \`node tools/codeql-pattern-gate.js --json <files>\` → ok=true
- CI: all 7 required checks green
- No execSync/spawnSync with template-literal interpolation, no shell injection

**Decision stack protocol (before non-trivial decisions):**
1. Run \`tools/agent-session-start.js\` (context layer validation)
2. Run \`tools/agent-decision-stack.js\` (evidence stack)
3. Run \`graphify\` + revenue DS
4. Check plan.md for matching MISTAKE patterns

**Stop conditions:**
Explicitly state stop condition before delegating to subagent:
"open a PR, do NOT merge" — require proof, not completion claims.

---
*Source: plan.md, AGENTS.md, docs/agents/decision-stack.md*`,
  },
]);

const PROMPT_COUNT = CONTEXT_PROMPTS.length;

/**
 * Extract key metadata from repo source files to populate prompt templates.
 */
function readRepoMetadata(repoPath) {
  const metadata = {
    REPO_NAME: path.basename(repoPath) || 'mac-yolo-safeguards',
    REPO_PURPOSE: 'Mac freeze guard scripts + ThumbGate SaaS funnel cross-link',
    REPO_TAGLINE: 'AI agent safety and skill catalog enforcement for autonomous coding agents',
    REPO_MISSION:
      'Maintain a safe, transparent, and verified environment for autonomous AI agents ' +
      'working in the mac-yolo-safeguards repository',
    REPO_ROLE:
      'Autonomous AI agent safety orchestration and skill catalog enforcement for the ' +
      'mac-yolo-safeguards repository',
    VALUES: [
      'Safety over speed',
      'Transparency over convenience',
      'Correctness over velocity',
      'Evidence-based decisions',
      'Honest anti-lying protocol',
    ],
    OBJECTIVES: [
      '5-skill catalog enforcement (MUST/SHOULD)',
      'Zero dead code, zero speculative scaffolding',
      'Always ship finished work: commit, push, PR, verify',
      '4/4 agent-loop health gates',
    ],
    PRIORITIES: [],
    DIRECTIVES: [
      'Never edit a file another agent owns in plan.md without claiming it first',
      'Never bypass a verification gate (tests/E2E) or invent a workaround when blocked',
      'Logs in plan.md (Decisions, Discovered) are append-only',
      'Never claim "done" without empirical receipts verified in the same turn',
      'Never write secrets to tracked files',
    ],
    WORKFLOW: '',
    COORDINATION:
      'One agent per git worktree + branch; sequential merge onto main gated on green checks. ' +
      'Every task: read plan.md, claim files before touching, work only your claim, ' +
      'verify AcceptanceCheck, release. Cap 2-3 concurrent agents.',
    CHANGE_PROTOCOL:
      '1. State what you are about to do\n' +
      '2. Make the change\n' +
      '3. Run verification command in same turn\n' +
      '4. Show the result\n' +
      '5. If protected component broke → revert immediately',
    SKILL_COUNT: 0,
    SKILLS: '',
    CURRENT_BRANCH: '',
    MAIN_SHA: '',
    ACTIVE_AGENTS: 0,
    CURRENT_WORK: '',
    RECEIVED: '',
    BLOCKED: '',
    NEVER_LIST: [],
    DOCS_TOC: '',
    DECISIONS: '',
    TASK_CLAIMS: '',
  };

  // Read README.md for repo name/tagline/purpose
  try {
    const readme = fs.readFileSync(path.join(repoPath, 'README.md'), 'utf8');
    const firstLine = readme.split('\n')[0] || '';
    if (firstLine.startsWith('#')) {
      metadata.REPO_NAME = firstLine.replace(/^#\s*/, '').trim();
    }
  } catch (e) { /* optional */ }

  // Count skill cards
  try {
    const skillDirs = fs.readdirSync(path.join(repoPath, '.agents', 'skills'));
    metadata.SKILL_COUNT = skillDirs.filter(d =>
      fs.existsSync(path.join(repoPath, '.agents', 'skills', d, 'SKILL.md'))
    ).length;
    metadata.SKILLS = skillDirs
      .filter(d => fs.existsSync(path.join(repoPath, '.agents', 'skills', d, 'SKILL.md')))
      .map(d => `- \`${d}\``)
      .join('\n');
  } catch (e) { /* optional */ }

  // Parse AGENTS.md for directives, never list, workflow
  try {
    const agents = fs.readFileSync(path.join(repoPath, 'AGENTS.md'), 'utf8');

    // Extract "Never" list
    const neverMatch = agents.match(/\*\*The "Never" list.*?\*\*([\s\S]*?)(?:\n##|\n\n\n|\n\*\*)/);
    if (neverMatch) {
      const neverSection = neverMatch[1];
      metadata.NEVER_LIST = neverSection
        .split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.trim())
        .filter(l => l.length > 10)
        .slice(0, 10);
    }

    // Extract workflow
    const workflowMatch = agents.match(/## Change protocol([\s\S]*?)(?:\n##)/);
    if (workflowMatch) {
      metadata.WORKFLOW = workflowMatch[1].trim().split('\n').slice(0, 10).join('\n');
    }
  } catch (e) { /* optional */ }

  // Parse plan.md for current work, decisions, task claims
  try {
    const plan = fs.readFileSync(path.join(repoPath, 'plan.md'), 'utf8');

    // Extract recent decisions (append-only section)
    const decisionMatch = plan.match(/## 3.*Decisions([\s\S]*?)(?:\n## 4|\n### 3\.)/);
    if (decisionMatch) {
      const decisions = decisionMatch[1]
        .split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.trim())
        .slice(-10);
      metadata.DECISIONS = decisions.join('\n');
    }

    // Extract task claims from File Ownership Map
    const claimMatches = plan.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.*?T-[A-Z0-9-]+/g);
    if (claimMatches) {
      metadata.TASK_CLAIMS = claimMatches
        .slice(-5)
        .join('\n');
    }

    // Extract released items
    const releasedMatches = plan.match(/RELEASED:.*?(?=\n\n|\n- )/g);
    if (releasedMatches) {
      metadata.RECEIVED = releasedMatches.slice(-5).join('\n');
    }

    // Extract blocked items
    const blockedMatches = plan.match(/blocked.*?\(([^)]+)\)/gi);
    if (blockedMatches) {
      metadata.BLOCKED = blockedMatches.slice(0, 5).join('\n');
    }

    metadata.CURRENT_WORK = 'See plan.md §2 (File Ownership Map) for active claims';
  } catch (e) { /* optional */ }

  // Get current branch / main SHA via argument-safe git calls.
  try {
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 5000,
    });
    const main = spawnSync('git', ['rev-parse', 'origin/main'], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (branch.status === 0) metadata.CURRENT_BRANCH = branch.stdout.trim();
    if (main.status === 0) metadata.MAIN_SHA = main.stdout.trim().substring(0, 7);
  } catch (e) { /* git not available */ }

  // Docs TOC
  try {
    const docsDir = path.join(repoPath, 'docs', 'agents');
    if (fs.existsSync(docsDir)) {
      const docs = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
      metadata.DOCS_TOC = docs.map(f => `- \`docs/agents/${f}\``).join('\n');
    }
  } catch (e) { /* optional */ }

  // Active agents — count agents in plan.md
  try {
    const plan = fs.readFileSync(path.join(repoPath, 'plan.md'), 'utf8');
    const agentMatches = plan.match(/agent:\s*([a-z0-9-]+-\d{8})/g);
    metadata.ACTIVE_AGENTS = agentMatches ?
      [...new Set(agentMatches)].length : 0;
  } catch (e) { /* optional */ }

  return metadata;
}

/**
 * Fill in a template with metadata values.
 */
function fillTemplate(template, metadata) {
  let result = template;
  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      result = result.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value.join('\n')
      );
    } else {
      result = result.replace(
        new RegExp(`{{${key}}}`, 'g'),
        String(value || '')
      );
    }
  }
  return result;
}

const REPO_PATH_PREFIXES = Object.freeze([
  'tools/',
  'tests/',
  'bin/',
  'docs/',
  'scripts/',
  '.agents/',
  '.github/',
  'hermes-mobile/',
]);
const REPO_ROOT_FILES = new Set(['AGENTS.md', 'README.md', 'SKILLS.md', 'plan.md']);

function extractRepoLocalPaths(content) {
  const paths = new Set();
  const codeSpans = String(content || '').matchAll(/`([^`\n]+)`/g);
  for (const match of codeSpans) {
    for (const rawToken of match[1].split(/\s+/)) {
      const token = rawToken
        .replace(/^["'([{]+/, '')
        .replace(/["')\]},;:]+$/, '')
        .replace(/^\.\//, '');
      if (!token || /[<>{}*]/.test(token)) continue;
      if (REPO_ROOT_FILES.has(token) || REPO_PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) {
        paths.add(token);
      }
    }
  }
  return [...paths].sort();
}

function findUngroundedRepoPaths(content, repoPath = DEFAULT_REPO) {
  return extractRepoLocalPaths(content).filter((candidate) =>
    !fs.existsSync(path.resolve(repoPath, candidate)),
  );
}

/**
 * Generate the full context vault as Markdown.
 */
function generateVault(repoPath, outPath) {
  const metadata = readRepoMetadata(repoPath);
  let output = [];

  // Header
  output.push(`# AI Context Vault`);
  output.push(``);
  output.push(`> 8 copy-paste prompts to make AI actually understand this repository.`);
  output.push(`> Inspired by [Allie K. Miller's AI Context Vault](https://www.alliekmiller.com/resources).`);
  output.push(`> Generated by \`tools/context-vault.js\``);
  output.push(``);
  output.push(`**Repository:** \`${metadata.REPO_NAME}\``);
  output.push(`**Skill catalog:** ${metadata.SKILL_COUNT} skills`);
  output.push(`**Active agents:** ${metadata.ACTIVE_AGENTS}`);
  output.push(`**Last verified:** ${new Date().toISOString()}`);
  output.push(``);
  output.push(`---`);
  output.push(``);

  // Generate each prompt
  for (const prompt of CONTEXT_PROMPTS) {
    output.push(fillTemplate(prompt.template, metadata));
    output.push(``);
    output.push(`---`);
    output.push(``);
  }

  const content = output.join('\n');

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
    return { written: true, outPath, content };
  }

  return { written: false, outPath: null, content };
}

/**
 * Validate a generated vault's content (shared by validateVault and --json).
 */
function validateContent(content, options = {}) {
  const errors = [];

  for (const prompt of CONTEXT_PROMPTS) {
    const hasTitle = content.includes(prompt.title);
    const hasId = content.includes(prompt.id);

    if (!hasTitle && !hasId) {
      errors.push({
        prompt: prompt.id,
        title: prompt.title,
        error: 'Missing prompt section in vault',
      });
    }

    // Check template variables are resolved (no {{VAR}} remaining)
    const unresolved = content.match(/\{\{[A-Z_]+\}\}/g);
    if (unresolved) {
      errors.push({
        prompt: prompt.id,
        error: `Unresolved template variables: ${[...new Set(unresolved)].join(', ')}`,
      });
      break;
    }
  }

  // Check all 8 prompts are present
  const promptCount = (content.match(/^# \d\./gm) || []).length;
  if (promptCount < PROMPT_COUNT) {
    errors.push({
      error: `Expected ${PROMPT_COUNT} prompts, found ${promptCount}`,
    });
  }

  if (options.repoPath) {
    const missingPaths = findUngroundedRepoPaths(content, options.repoPath);
    for (const missingPath of missingPaths) {
      errors.push({
        error: `Ungrounded repo-local path: ${missingPath}`,
        path: missingPath,
      });
    }
  }

  return { ok: errors.length === 0, errors, promptCount };
}

/**
 * Validate that a generated vault file contains all 8 prompts.
 */
function validateVault(vaultPath, repoPath = DEFAULT_REPO) {
  if (!fs.existsSync(vaultPath)) {
    return { ok: false, errors: [`Vault file not found: ${vaultPath}`], promptCount: 0 };
  }

  const content = fs.readFileSync(vaultPath, 'utf8');
  return validateContent(content, { repoPath });
}

/**
 * List all available context prompts.
 */
function listPrompts() {
  return CONTEXT_PROMPTS.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    source_files: p.source_files,
  }));
}

/**
 * CLI entry point.
 */
function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'list';
  const repoPath = args.includes('--repo') ?
    args[args.indexOf('--repo') + 1] : DEFAULT_REPO;
  const outPath = args.includes('--out') ?
    args[args.indexOf('--out') + 1] : DEFAULT_OUT;

  if (cmd === 'generate') {
    const result = generateVault(repoPath, outPath);
    console.log(`Context vault generated: ${result.outPath}`);
    console.log(`Prompts: ${PROMPT_COUNT}`);
    process.exit(0);
  }

  if (cmd === 'validate') {
    const vaultPath = args.includes('--vault') ?
      args[args.indexOf('--vault') + 1] : DEFAULT_OUT;
    const result = validateVault(vaultPath, repoPath);
    if (result.ok) {
      console.log(`✅ Context vault valid: ${result.promptCount}/${PROMPT_COUNT} prompts present`);
      process.exit(0);
    } else {
      console.error(`❌ Context vault invalid:`);
      for (const err of result.errors) {
        console.error(`  - ${JSON.stringify(err)}`);
      }
      process.exit(1);
    }
  }

  if (cmd === 'list') {
    const prompts = listPrompts();
    console.log(`AI Context Vault — ${prompts.length} prompts:\n`);
    for (const p of prompts) {
      console.log(`${p.id}`);
      console.log(`  Title: ${p.title}`);
      console.log(`  Description: ${p.description}`);
      console.log(`  Sources: ${p.source_files.join(', ')}`);
      console.log('');
    }
    process.exit(0);
  }

  if (cmd === '--json') {
    // Machine-readable mode for CI integration
    const result = generateVault(repoPath);
    const validation = validateContent(result.content, { repoPath });
    process.stdout.write(JSON.stringify({
      ok: validation.ok,
      promptCount: validation.promptCount,
      prompts: CONTEXT_PROMPTS.map(p => ({ id: p.id, title: p.title })),
      sources: [...new Set(CONTEXT_PROMPTS.flatMap(p => p.source_files))],
    }));
    process.exit(validation.ok ? 0 : 1);
  }

  console.error(`Unknown command: ${cmd}`);
  console.error('Usage: node tools/context-vault.js <generate|validate|list> [--repo PATH] [--out PATH]');
  process.exit(1);
}

// Export for testing
module.exports = {
  CONTEXT_PROMPTS,
  PROMPT_COUNT,
  readRepoMetadata,
  fillTemplate,
  generateVault,
  validateVault,
  validateContent,
  extractRepoLocalPaths,
  findUngroundedRepoPaths,
  listPrompts,
  DEFAULT_REPO,
  DEFAULT_OUT,
};

// CLI entry (when run directly)
if (require.main === module) {
  main();
}
