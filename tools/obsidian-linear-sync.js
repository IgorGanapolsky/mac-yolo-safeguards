#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { queryLinear } = require('./linear-agent-bridge');

const VAULT_PATH = '/Users/igorganapolsky/Documents/AI-Agent-Sync';
const PROJECT_DIR = path.join(VAULT_PATH, 'Projects/mac-yolo-safeguards');
const ISSUES_DIR = path.join(PROJECT_DIR, 'Issues');

async function syncObsidianWithLinear() {
  console.log('🔄 Running Obsidian ↔ Linear Bidirectional Sync Engine...');

  if (!fs.existsSync(ISSUES_DIR)) {
    fs.mkdirSync(ISSUES_DIR, { recursive: true });
  }

  // 1. Fetch live Linear issues for AGENT team
  const issuesQuery = `
    query {
      issues(filter: { team: { key: { eq: "AGENT" } } }, first: 50) {
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state {
            name
            type
          }
          project {
            name
          }
          updatedAt
        }
      }
    }
  `;

  const response = await queryLinear(issuesQuery);
  const issues = response.data?.issues?.nodes || [];
  console.log(`Fetched ${issues.length} Linear issues from Team AGENT.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const issue of issues) {
    const filename = `${issue.identifier}.md`;
    const filePath = path.join(ISSUES_DIR, filename);

    const frontmatter = [
      '---',
      `linear_id: "${issue.identifier}"`,
      `linear_guid: "${issue.id}"`,
      `title: "${issue.title.replace(/"/g, '\\"')}"`,
      `status: "${issue.state?.name || 'Backlog'}"`,
      `project: "${issue.project?.name || 'mac-yolo-safeguards'}"`,
      `priority: "${issue.priorityLabel || 'Normal'}"`,
      `last_synced: "${new Date().toISOString()}"`,
      '---',
      '',
      `# ${issue.identifier}: ${issue.title}`,
      '',
      `**Status**: \`${issue.state?.name || 'Backlog'}\`  `,
      `**Project**: \`${issue.project?.name || 'mac-yolo-safeguards'}\`  `,
      `**Updated**: \`${issue.updatedAt}\``,
      '',
      '## Description',
      issue.description || 'No description provided.',
      '',
      '## Agent Locks & Worktree Tracking',
      '- **Owner**: `antigravity`',
      '- **Worktree**: `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards`',
      '',
    ].join('\n');

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, frontmatter, 'utf8');
      createdCount++;
    } else {
      fs.writeFileSync(filePath, frontmatter, 'utf8');
      updatedCount++;
    }
  }

  // 2. Update Index File in Obsidian
  const indexPath = path.join(PROJECT_DIR, 'LINEAR-SYNC.md');
  const indexContent = [
    '# Linear ↔ Obsidian Sync Board: mac-yolo-safeguards',
    `*Last Synced: ${new Date().toLocaleString()}*`,
    '',
    '| Issue ID | Title | Status | Priority | Markdown Link |',
    '|---|---|---|---|---|',
    ...issues.map(i => `| **${i.identifier}** | ${i.title} | \`${i.state?.name}\` | ${i.priorityLabel} | [[${i.identifier}]] |`),
    '',
    '## Orchestration Directives',
    '- All agents working this repo sync status bidirectionally via `node tools/obsidian-linear-sync.js`.',
    '- Linear project URL: [mac-yolo-safeguards](https://linear.app/igorganapolsky/project/mac-yolo-safeguards-cd86b890dce1).',
  ].join('\n');

  fs.writeFileSync(indexPath, indexContent, 'utf8');

  console.log(`✅ Obsidian Sync Complete: ${createdCount} notes created, ${updatedCount} notes updated.`);
  console.log(`Updated Obsidian index note: ${indexPath}`);
}

syncObsidianWithLinear().catch(console.error);
