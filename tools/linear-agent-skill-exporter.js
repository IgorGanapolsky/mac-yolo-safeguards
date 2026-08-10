#!/usr/bin/env node
'use strict';

/**
 * linear-agent-skill-exporter.js — Export Custom Linear Agent Skills for Linear Agent UI.
 *
 * Generates copy-pasteable custom skill definitions for the Linear Agent interface
 * (https://linear.app/igorganapolsky/agent -> "+ Create skill").
 *
 * Usage:
 *   node tools/linear-agent-skill-exporter.js --export
 *   node tools/linear-agent-skill-exporter.js --json
 */

const fs = require('fs');
const path = require('path');

const LINEAR_SKILLS = [
  {
    name: 'Claim Task & Apply Agent Attribution Tag',
    description: 'Claims an open Linear ticket, sets state to In Progress, and tags issue with agent:<agent-name> label.',
    prompt: `When an issue is claimed or assigned to an AI agent:
1. Update state to "In Progress".
2. Add label "agent:<agent-name>" (e.g. agent:antigravity, agent:claude-code, agent:cursor, agent:codex).
3. Execute: node tools/linear-agent-telemetry-engine.js --track <ISSUE_ID> --agent <AGENT_NAME>`,
  },
  {
    name: 'Cycle-Time Telemetry & Velocity Post-Mortem',
    description: 'Calculates resolution duration from claim to merge and posts velocity post-mortem comment on Linear issue.',
    prompt: `When completing a Linear issue or merging a PR:
1. Calculate total duration from start timestamp to merge timestamp.
2. Execute: node tools/linear-agent-telemetry-engine.js --complete <ISSUE_ID> --pr-number <PR_NUM> --bottleneck "<BOTTLENECK>" --recommendation "<OPTIMIZATION>"
3. Append formatted post-mortem breakdown comment to the issue on Linear.`,
  },
  {
    name: 'Hermes-YOLO Self-Healing Context Reset',
    description: 'Auto-resets high-compression sessions (>=15 compressions) and recalibrates line-shift anchors.',
    prompt: `When hermes-yolo experiences high compression warnings (Session compressed >= 15 times):
1. Execute checkAndHealSelfHealingHarness() in hermes-yolo-wrapper.js.
2. Save task checkpoint to .ai/hermes-yolo-task-state.json.
3. Refresh session context (/new) to maintain 100% precision & zero line anchor degradation.`,
  },
  {
    name: 'GSD Green PR Auto-Merger',
    description: 'Scans green PRs, updates branch with main, and enables squash auto-merge to close Linear issue.',
    prompt: `When a PR passes all CI checks:
1. Verify 100% CI pass rate in scripts/verify.sh.
2. Enable squash auto-merge: gh pr merge <PR_NUM> --squash --auto.
3. Automatically transition corresponding Linear issue to Done.`,
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
  console.log('✅ Linear Agent Skills Ready for UI Import (+ Create skill)!');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { LINEAR_SKILLS, parseArgs };
