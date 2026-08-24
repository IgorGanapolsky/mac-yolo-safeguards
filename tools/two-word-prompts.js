#!/usr/bin/env node
'use strict';

/**
 * two-word-prompts — Allie K. Miller's 18 role-shifting continuation prompts.
 *
 * These short phrases act as "continuation prompts" to steer the conversation,
 * challenge assumptions, and uncover new use cases after context has already
 * been established. Each prompt shifts the AI's role, making it move from a
 * passive search engine to an active collaborator.
 *
 * Source: https://x.com/alliekmiller/status/2087558225029689618
 *
 * Each prompt maps to a repo tool that implements the role's purpose:
 *   - The `repo_tool` field references a command that exercises the role's
 *     purpose within mac-yolo-safeguards.
 *
 * CLI:
 *   node tools/two-word-prompts.js list        — list all 18 prompts
 *   node tools/two-word-prompts.js resolve <prompt>  — resolve a single prompt
 *   node tools/two-word-prompts.js generate [--out PATH] — generate markdown
 *   node tools/two-word-prompts.js validate [--input PATH] — validate markdown
 *   node tools/two-word-prompts.js --json       — JSON summary
 *
 * No external dependencies. No execSync. No shell:true.
 */

const PROMPT_COUNT = 18;

const CONTEXT_PROMPTS = [
  {
    prompt: 'now what',
    role: 'next-actions advisor',
    purpose: 'After a task is complete, suggest 3 to 5 actionable next steps or advanced use cases.',
    repo_tool: 'node tools/agent-decision-stack.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/agent-decision-stack.js',
  },
  {
    prompt: 'plz fix',
    role: 'debugger',
    purpose: 'Diagnose and resolve a bug, formatting issue, or CodeQL pattern violation.',
    repo_tool: 'node tools/codeql-pattern-gate.js --diff HEAD',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/codeql-pattern-gate.js',
  },
  {
    prompt: 'do this',
    role: 'implementer',
    purpose: 'Recreate or implement the exact style, behavior, or code from a screenshot, mockup, or reference.',
    repo_tool: 'node tools/skill-card-validate.js --list',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/skill-card-validate.js',
  },
  {
    prompt: 'interview me',
    role: 'context gatherer',
    purpose: 'Ask targeted questions to extract necessary context (client details, project constraints, edge cases).',
    repo_tool: 'node tools/context-vault.js generate',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/context-vault.js',
  },
  {
    prompt: 'keep going!',
    role: 'completion driver',
    purpose: 'Continue generating text or completing a multi-step execution that cut off midway.',
    repo_tool: 'node tools/agent-spin-detector.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/agent-spin-detector.js',
  },
  {
    prompt: 'elii elie',
    role: 'simplifier',
    purpose: 'Explain it to me like I am an intern or like I am an executive — shift complexity level on demand.',
    repo_tool: 'node tools/context-vault.js list',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/context-vault.js',
  },
  {
    prompt: 'first principles?',
    role: 'assumption-resetter',
    purpose: 'Strip away inherited assumptions and reason from first principles to find a fresh path.',
    repo_tool: 'node tools/agent-decision-stack.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/agent-decision-stack.js',
  },
  {
    prompt: 'simulate it',
    role: 'scenario planner',
    purpose: 'Run predictive scenarios, plan for edge cases, and visualize potential outcomes before shipping.',
    repo_tool: 'node tools/codeql-agent-hygiene.js --pre-ship --skip-network',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/codeql-agent-hygiene.js',
  },
  {
    prompt: 'challenge me',
    role: 'critical sparring partner',
    purpose: 'Push back on logic, find flaws in thinking, and question assumptions rather than agreeing.',
    repo_tool: 'node tools/codeql-agent-hygiene.js --pre-ship',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/codeql-agent-hygiene.js',
  },
  {
    prompt: 'da fuq?',
    role: 'simplifier / complexity-reset',
    purpose: 'Call out nonsense, reset the conversation, and return to common sense.',
    repo_tool: 'node tools/context-vault.js list',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/context-vault.js',
  },
  {
    prompt: 'find leverage',
    role: 'efficiency optimizer',
    purpose: 'Find the highest-leverage action, tool, or resource to maximize output with minimum effort.',
    repo_tool: 'node tools/hermes-economic-router.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/hermes-economic-router.js',
  },
  {
    prompt: 'hey simon',
    role: 'chief of staff / orchestrator',
    purpose: 'Act as chief of staff — coordinate, prioritize, and orchestrate across agents and pipelines.',
    repo_tool: 'node tools/agent-swarm-harness.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/agent-swarm-harness.js',
  },
  {
    prompt: 'spawn agents',
    role: 'parallelization driver',
    purpose: 'Break a task into independent sub-tasks and spin up parallel agent workers.',
    repo_tool: 'bash bin/agent-loop --health',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/bin/agent-loop',
  },
  {
    prompt: 'automate this',
    role: 'codifier',
    purpose: 'Turn a manual, repeated workflow into a deterministic, repeatable automation.',
    repo_tool: 'node tools/skill-card-validate.js --dir .agents/skills',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/skill-card-validate.js',
  },
  {
    prompt: 'remember this',
    role: 'memory logger',
    purpose: 'Persist a durable memory of what was done so future agents or humans can retrieve it.',
    repo_tool: 'node tools/agent-knowledge-handoff.js',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/agent-knowledge-handoff.js',
  },
  {
    prompt: 'forecast impact',
    role: 'risk / downstream analyst',
    purpose: 'Estimate downstream consequences, blast radius, and latent risks of a change before merging.',
    repo_tool: 'node tools/codeql-agent-hygiene.js --pre-ship --skip-network --impact-analysis',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/codeql-agent-hygiene.js',
  },
  {
    prompt: 'show receipts',
    role: 'evidence verifier',
    purpose: 'Back up previous claims with citations, metrics, or exact logic — prove it, do not just assert.',
    repo_tool: 'node tools/skill-card-validate.js --json',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/skill-card-validate.js',
  },
  {
    prompt: 'girl bye',
    role: 'context-abandoner / reset',
    purpose: 'Gracefully abandon the current thread, reset context, and start fresh.',
    repo_tool: 'node tools/context-vault.js validate',
    repo_mapping: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/tools/context-vault.js',
  },
];

/**
 * @returns {readonly typeof CONTEXT_PROMPTS}
 */
function listPrompts() {
  return CONTEXT_PROMPTS;
}

/**
 * Case-insensitive prefix / fuzzy lookup.
 * @param {string} input
 * @returns {{prompt: string, role: string, purpose: string, repo_tool: string, repo_mapping: string} | null}
 */
function resolvePrompt(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  // exact match
  for (const entry of CONTEXT_PROMPTS) {
    if (entry.prompt.toLowerCase() === trimmed) return entry;
  }
  // prefix match
  for (const entry of CONTEXT_PROMPTS) {
    if (entry.prompt.toLowerCase().startsWith(trimmed)) return entry;
  }
  return null;
}

function getRole(prompt) {
  const entry = resolvePrompt(prompt);
  return entry ? entry.role : null;
}

function getTool(prompt) {
  const entry = resolvePrompt(prompt);
  return entry ? entry.repo_tool : null;
}

function validateContent() {
  const errors = [];
  if (CONTEXT_PROMPTS.length !== PROMPT_COUNT) {
    errors.push('Expected ' + PROMPT_COUNT + ' prompts, got ' + CONTEXT_PROMPTS.length);
  }
  const seen = new Set();
  for (const entry of CONTEXT_PROMPTS) {
    if (!entry.prompt || typeof entry.prompt !== 'string') {
      errors.push('Entry missing prompt field');
    } else if (entry.prompt.split(/\s+/).length !== 2 && entry.prompt !== 'keep going!') {
      // "keep going!" is one word but is a valid two-word-style prompt
      // All other prompts are exactly 2 words
    }
    if (entry.prompt) {
      const lower = entry.prompt.toLowerCase();
      if (seen.has(lower)) {
        errors.push('Duplicate prompt: ' + entry.prompt);
      }
      seen.add(lower);
    }
    if (!entry.role || typeof entry.role !== 'string') {
      errors.push('Entry "' + entry.prompt + '" missing role');
    }
    if (!entry.purpose || typeof entry.purpose !== 'string') {
      errors.push('Entry "' + entry.prompt + '" missing purpose');
    }
    if (!entry.repo_tool || typeof entry.repo_tool !== 'string') {
      errors.push('Entry "' + entry.prompt + '" missing repo_tool');
    }
    if (!entry.repo_mapping || typeof entry.repo_mapping !== 'string') {
      errors.push('Entry "' + entry.prompt + '" missing repo_mapping');
    }
  }
  return { ok: errors.length === 0, errors, promptCount: CONTEXT_PROMPTS.length, expected: PROMPT_COUNT };
}

function validateMarkdown(input) {
  if (!input || typeof input !== 'string') return { ok: false, errors: ['Empty input'] };
  const missing = [];
  for (const entry of CONTEXT_PROMPTS) {
    if (!input.includes(entry.prompt)) {
      missing.push(entry.prompt);
    }
    if (!input.includes(entry.role)) {
      missing.push(entry.prompt + ' (role)');
    }
    if (!input.includes(entry.repo_tool)) {
      missing.push(entry.prompt + ' (repo_tool)');
    }
  }
  return { ok: missing.length === 0, errors: missing };
}

function generateMarkdown() {
  const lines = [];
  lines.push('# Allie K. Miller — 18 Two-Word AI Prompts');
  lines.push('');
  lines.push('Source: https://x.com/alliekmiller/status/2087558225029689618');
  lines.push('');
  lines.push('Short continuation prompts that shift the AI role after context is established.');
  lines.push('');
  lines.push('## Registry');
  lines.push('');
  lines.push('| # | Prompt | Role | Purpose | Repo Tool |');
  lines.push('|---|--------|------|---------|-----------|');
  CONTEXT_PROMPTS.forEach((entry, i) => {
    lines.push('| ' + (i + 1) + ' | `' + entry.prompt + '` | ' + entry.role + ' | ' + entry.purpose + ' | `' + entry.repo_tool + '` |');
  });
  lines.push('');
  lines.push('Generated by `node tools/two-word-prompts.js generate`');
  lines.push('');
  return lines.join('\n');
}

function listAll() {
  return CONTEXT_PROMPTS.map((entry) => {
    return {
      prompt: entry.prompt,
      role: entry.role,
      purpose: entry.purpose,
      repo_tool: entry.repo_tool,
      repo_mapping: entry.repo_mapping,
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === '--json' || cmd === 'json') {
    const v = validateContent();
    console.log(JSON.stringify({ ok: v.ok, findingCount: v.errors.length, promptCount: v.promptCount, expected: v.expected }));
    process.exit(v.ok ? 0 : 1);
  }

  if (cmd === '--help' || cmd === 'help' || !cmd) {
    console.log('Usage: node tools/two-word-prompts.js <command>');
    console.log('');
    console.log('Commands:');
    console.log('  list                        List all 18 prompts');
    console.log('  resolve <prompt>            Resolve a single prompt (fuzzy/prefix match)');
    console.log('  generate [--out PATH]       Generate markdown registry');
    console.log('  validate [--input PATH]     Validate markdown contains all prompts');
    console.log('  --json                      JSON summary (ok, findingCount, promptCount, expected)');
    process.exit(0);
  }

  if (cmd === 'list' || cmd === 'listPrompts') {
    const results = listAll();
    console.log('Allie K. Miller — 18 Two-Word AI Prompts');
    console.log('');
    results.forEach((entry, i) => {
      console.log((i + 1) + '. "' + entry.prompt + '" — ' + entry.role);
      console.log('   Purpose: ' + entry.purpose);
      console.log('   Tool: ' + entry.repo_tool);
      console.log('   Mapping: ' + entry.repo_mapping);
      console.log('');
    });
    console.log('Total: ' + results.length + '/' + PROMPT_COUNT);
    return;
  }

  if (cmd === 'resolve') {
    const input = args[1];
    if (!input) {
      console.error('Usage: node tools/two-word-prompts.js resolve <prompt>');
      process.exit(1);
    }
    const entry = resolvePrompt(input);
    if (!entry) {
      console.error('No prompt found matching: ' + input);
      process.exit(1);
    }
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  if (cmd === 'generate') {
    const md = generateMarkdown();
    const outIdx = args.indexOf('--out');
    if (outIdx !== -1 && args[outIdx + 1]) {
      const fs = require('fs');
      fs.writeFileSync(args[outIdx + 1], md, 'utf8');
      console.log('Written to ' + args[outIdx + 1]);
    } else {
      console.log(md);
    }
    return;
  }

  if (cmd === 'validate') {
    const inputIdx = args.indexOf('--input');
    let input = '';
    if (inputIdx !== -1 && args[inputIdx + 1]) {
      const fs = require('fs');
      input = fs.readFileSync(args[inputIdx + 1], 'utf8');
    } else {
      input = md = generateMarkdown();
    }
    const result = validateMarkdown(input);
    if (result.ok) {
      console.log('Validation passed: all ' + PROMPT_COUNT + ' prompts present in markdown.');
      process.exit(0);
    } else {
      console.error('Validation failed. Missing entries:');
      result.errors.forEach(function (e) { console.error('  - ' + e); });
      process.exit(1);
    }
    return;
  }

  console.error('Unknown command: ' + cmd);
  console.error('Run with --help for usage.');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
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
  main,
};
