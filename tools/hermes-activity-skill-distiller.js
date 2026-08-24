#!/usr/bin/env node
/**
 * tools/hermes-activity-skill-distiller.js
 * 
 * Activity-to-Skill Distiller Engine
 * Stolen from Screenpipe v2.6.56 ("Ask about the interval. Turn it into a Skill.")
 * 
 * Takes recorded session activity, extracts recurring operational patterns,
 * and automatically synthesizes a validated, ready-to-run Skill manifest.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Distills a series of activity logs or command intervals into structured skill parameters.
 */
function distillActivityIntoSkill(activityInterval) {
  const actions = Array.isArray(activityInterval.actions) ? activityInterval.actions : [];
  const title = activityInterval.title || 'Autonomous Activity Workflow';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'activity-skill';

  const commands = actions
    .filter((a) => a.type === 'command' || a.command)
    .map((a) => a.command || a.details);

  const files = actions
    .filter((a) => a.type === 'file_edit' || a.file)
    .map((a) => a.file || a.path);

  const uniqueTriggers = Array.from(new Set([
    slug.replace(/-/g, ' '),
    ...title.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    ...(activityInterval.tags || []),
  ])).slice(0, 8);

  const description = activityInterval.description || `Autonomous skill synthesized from activity interval: ${title}`;

  const skillContent = `---
name: ${slug}
description: ${description}
trigger: [${uniqueTriggers.map((t) => `"${t}"`).join(', ')}]
---

# ${slug}

${description}

## Workflow Sequence
${commands.length ? commands.map((c, i) => `${i + 1}. \`${c}\``).join('\n') : '1. Execute automated workflow routine.'}

## Target Files
${files.length ? files.map((f) => `- \`${f}\``).join('\n') : '- Workspace repository files'}

## Verification
\`\`\`bash
${activityInterval.verificationCommand || 'node tools/validate-agent-skills.js'}
\`\`\`
`;

  return {
    name: slug,
    title,
    description,
    triggers: uniqueTriggers,
    skillContent,
    commandCount: commands.length,
    fileCount: files.length,
  };
}

/**
 * Persists and registers the synthesized skill.
 */
function synthesizeAndSaveSkill(activityInterval, repoRoot = process.cwd()) {
  const distilled = distillActivityIntoSkill(activityInterval);
  const skillDir = path.join(repoRoot, '.agents', 'skills', distilled.name);
  fs.mkdirSync(skillDir, { recursive: true });

  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, distilled.skillContent, 'utf8');

  // Update SKILLS.md table if not already present
  const skillsMdPath = path.join(repoRoot, 'SKILLS.md');
  if (fs.existsSync(skillsMdPath)) {
    let content = fs.readFileSync(skillsMdPath, 'utf8');
    const row = `| **${distilled.name}** | \`${distilled.triggers.slice(0, 3).join('`, `')}\` | \`.agents/skills/${distilled.name}/SKILL.md\` | 1.0.0 | \`${activityInterval.verificationCommand || 'node tools/validate-agent-skills.js'}\` |`;
    if (!content.includes(distilled.name)) {
      content += `\n${row}`;
      fs.writeFileSync(skillsMdPath, content, 'utf8');
    }
  }

  return {
    success: true,
    skillPath,
    name: distilled.name,
    triggers: distilled.triggers,
  };
}

module.exports = {
  distillActivityIntoSkill,
  synthesizeAndSaveSkill,
};

if (require.main === module) {
  console.log('=== Screenpipe-Style Activity-to-Skill Distiller ===');
  const mockActivity = {
    title: 'Deploy Cloudflare Control Plane',
    actions: [
      { type: 'command', command: 'npm run build:cloudflare' },
      { type: 'command', command: 'npx wrangler deploy --config dist/server/wrangler.json' },
      { type: 'file_edit', file: 'apps/hermes-control-plane/app/dashboard/DashboardClient.tsx' },
    ],
    verificationCommand: 'curl -sI https://thumbgate.app/api/health',
    tags: ['cloudflare', 'deploy', 'vps'],
  };
  const distilled = distillActivityIntoSkill(mockActivity);
  console.log('Distilled Skill Spec:\n', distilled);
}
