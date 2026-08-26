#!/usr/bin/env node
'use strict';

/**
 * linear-agent-skill-exporter.js — Export Custom Linear Agent Skills for Linear Agent UI.
 *
 * Generates copy-pasteable skill definitions for Linear Agent. The catalog is
 * intentionally limited to native Linear operations and repository commands
 * that exist. It never grants merge, archive, or delete authority.
 *
 * Usage:
 *   node tools/linear-agent-skill-exporter.js --export
 *   node tools/linear-agent-skill-exporter.js --json
 */

const fs = require('fs');
const path = require('path');

const LINEAR_SKILLS = [
  {
    name: 'Claim Task with Evidence and Agent Attribution',
    description: 'Claims one issue, preserves the human owner, records the agent and file scope, and verifies provider readback.',
    prompt: `When a coding agent takes ownership of a Linear issue:
1. Confirm the issue includes the matching GitHub issue URL and concrete acceptance checks.
2. In a repository coding session, run: node tools/linear-agent-bridge.js --claim <ISSUE_ID> --agent <AGENT_NAME> --files <COMMA_SEPARATED_FILES> --comment "<GITHUB_ISSUE_URL>" --json
3. Verify the returned issue is In Progress, has an agent attribution label, and has a canonical Obsidian claim path.
4. Keep the human as Linear assignee. Do not claim files already owned in plan.md or the vault.
5. If repository tools or provider readback are unavailable, report the exact blocker and do not claim ownership.`,
  },
  {
    name: 'Basic Workspace Hygiene Preview',
    description: 'Inventories Basic-plan projects, labels, cycles, statuses, agents, and locks without mutating provider state.',
    prompt: `When reviewing workspace hygiene:
1. In a repository coding session, run: node tools/linear-workspace-hygiene.js --dry-run --stale-days 90 --json
2. Report provider counts, the deterministic fingerprint, and review-only candidates with every blocker.
3. Treat active issues, current/future cycles, GitHub-linked history, Obsidian claims, and agent-lock/agent attribution labels as protected.
4. Never delete or archive a project, label, cycle, user, agent, or lock from this skill. A separate explicitly authorized operator must re-read the provider immediately before any mutation.
5. If the provider read fails, fail closed; never substitute cached or invented inventory.`,
  },
  {
    name: 'Evidence-Based Project and Cycle Update',
    description: 'Drafts a concise project or cycle update from current Linear issues without inventing health or progress.',
    prompt: `When asked for a project or cycle update:
1. Read the current project, current cycle, issue statuses, blockers, owners, latest project update, and linked GitHub work.
2. Separate progress, risks, decisions, and next actions. Cite the Linear issue identifiers and provider links behind each claim.
3. Mark health on track, at risk, or off track only when the cited issue evidence supports it; otherwise say health is unmeasured.
4. Publish the update only when the user explicitly asked to publish. Otherwise return a draft.
5. Do not use Loops on the Basic plan; scheduled Loops are a Business-plan capability.`,
  },
  {
    name: 'Verified Closeout Evidence',
    description: 'Closes an issue only after live GitHub evidence exists, then verifies the resulting Linear and Obsidian state.',
    prompt: `When a repository issue is ready to close:
1. Verify the PR is merged and record its commit SHA and exact-head CI URL; a green open PR is not completion.
2. Close only after that proof exists: node tools/linear-agent-bridge.js --done <ISSUE_ID> --agent <AGENT_NAME> --comment "<PR_URL> <MERGE_SHA> <CI_URL>" --json
3. Re-read Linear and verify Done state, the agent attribution label, the evidence comment, and the Obsidian receipt.
4. Record the observed bottleneck and one testable next improvement in the evidence comment; do not invent cycle-time telemetry that the current bridge does not compute.
5. Never merge a PR, bypass required checks, or infer a duration from prose.`,
  },
  {
    name: 'GitHub Linear Obsidian Handoff',
    description: 'Keeps the task, code, and file-claim buses linked with evidence and explicit unknowns.',
    prompt: `When handing work to another agent:
1. Add the GitHub issue or PR URL, commit SHA, CI status URL, changed-file scope, and remaining blockers to the Linear issue.
2. Verify the matching Obsidian claim path under Handoffs/linear-claims/ exists before citing it.
3. Keep provider state, git state, and vault state separate; do not call one proof of another.
4. Do not claim a deployment, device result, external action, or revenue without its independent provider receipt.
5. The receiving agent must re-read Linear, plan.md, and the vault before editing.`,
  },
];

function parseArgs(argv) {
  const args = { export: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--export') args.export = true;
    else if (arg === '--json') args.json = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.json) {
    console.log(JSON.stringify({ ok: true, count: LINEAR_SKILLS.length, skills: LINEAR_SKILLS }, null, 2));
    return;
  }

  console.log('=== Custom Linear Agent Skills Exporter ===');
  console.log(`Exporting ${LINEAR_SKILLS.length} Linear Agent Skills for https://linear.app/igorganapolsky/agent:\n`);

  LINEAR_SKILLS.forEach((skill, idx) => {
    console.log(`--- SKILL ${idx + 1}: ${skill.name} ---`);
    console.log(`Description: ${skill.description}`);
    console.log(`Prompt / Instructions:\n${skill.prompt}\n`);
  });

  console.log('--------------------------------------------------');
  console.log('Linear Agent skills exported for review. No provider mutation was performed.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { LINEAR_SKILLS, parseArgs };
