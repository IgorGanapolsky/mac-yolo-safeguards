#!/usr/bin/env node
'use strict';

/**
 * Obsidian ↔ Linear display sync (human dashboard, NOT a lock).
 * Writes vault notes under Projects/mac-yolo-safeguards/Issues/.
 * Agent locks remain Linear labels + Handoffs/linear-claims + Agent-State.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { queryLinear } = require('./linear-agent-bridge');

const VAULT_PATH =
  process.env.AI_AGENT_SYNC_VAULT ||
  path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');
const PROJECT_DIR = path.join(VAULT_PATH, 'Projects', 'mac-yolo-safeguards');
const ISSUES_DIR = path.join(PROJECT_DIR, 'Issues');

function esc(s) {
  return String(s || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

async function syncObsidianWithLinear() {
  console.log('Running Obsidian ↔ Linear display sync (not a lock)...');

  if (!fs.existsSync(ISSUES_DIR)) {
    fs.mkdirSync(ISSUES_DIR, { recursive: true });
  }

  const issuesQuery = `
    query {
      issues(
        filter: { team: { key: { in: ["AGENT", "IGO"] } } }
        first: 80
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          url
          state { name type }
          project { name }
          assignee { name email }
          labels { nodes { name } }
          updatedAt
        }
      }
    }
  `;

  const response = await queryLinear(issuesQuery);
  if (response.error) {
    console.error('Linear query failed:', response.message || response.code || response);
    process.exitCode = 1;
    return;
  }
  const issues = response.data?.issues?.nodes || [];
  console.log(`Fetched ${issues.length} Linear issues (AGENT+IGO).`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const issue of issues) {
    const filename = `${issue.identifier}.md`;
    const filePath = path.join(ISSUES_DIR, filename);
    const labels = (issue.labels?.nodes || []).map((l) => l.name);
    const agentLabels = labels.filter((n) => n === 'agent-lock' || n.startsWith('agent-'));
    const owner =
      agentLabels.find((n) => n.startsWith('agent-') && n !== 'agent-lock')?.replace(/^agent-/, '') ||
      issue.assignee?.name ||
      'unassigned';

    const frontmatter = [
      '---',
      `linear_id: "${issue.identifier}"`,
      `linear_guid: "${issue.id}"`,
      `title: "${esc(issue.title)}"`,
      `status: "${esc(issue.state?.name || 'Backlog')}"`,
      `project: "${esc(issue.project?.name || 'mac-yolo-safeguards')}"`,
      `priority: "${esc(issue.priorityLabel || 'Normal')}"`,
      `owner: "${esc(owner)}"`,
      `labels: [${labels.map((l) => JSON.stringify(l)).join(', ')}]`,
      `url: "${esc(issue.url || '')}"`,
      `last_synced: "${new Date().toISOString()}"`,
      '---',
      '',
      `# ${issue.identifier}: ${issue.title}`,
      '',
      `**Status**: \`${issue.state?.name || 'Backlog'}\`  `,
      `**Owner (display)**: \`${owner}\`  `,
      `**Labels**: ${(labels.length ? labels.map((l) => `\`${l}\``).join(', ') : '_none_')}  `,
      `**Project**: \`${issue.project?.name || 'mac-yolo-safeguards'}\`  `,
      `**Updated**: \`${issue.updatedAt}\``,
      issue.url ? `**Linear**: ${issue.url}` : '',
      '',
      '## Description',
      issue.description || 'No description provided.',
      '',
      '## Locks (read-only mirror)',
      '',
      '- **Locks are not this note.** Claim via `node tools/linear-agent-bridge.js --claim …`',
      '- File/WIP claims live in `Agent-State/<agent>.md` + `Handoffs/linear-claims/`',
      '- Obsidian Linear community plugin = human display only',
      '',
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    const existed = fs.existsSync(filePath);
    fs.writeFileSync(filePath, frontmatter, 'utf8');
    if (existed) updatedCount++;
    else createdCount++;
  }

  const indexPath = path.join(PROJECT_DIR, 'LINEAR-SYNC.md');
  const indexContent = [
    '# Linear ↔ Obsidian Sync Board: mac-yolo-safeguards',
    `*Last Synced: ${new Date().toISOString()}*`,
    '',
    '> Display only. Locks: `linear-agent-bridge.js --coord-status`.',
    '',
    '| Issue ID | Title | Status | Owner | Labels |',
    '|---|---|---|---|---|',
    ...issues.map((i) => {
      const labs = (i.labels?.nodes || []).map((l) => l.name).join(', ');
      const owner =
        (i.labels?.nodes || [])
          .map((l) => l.name)
          .find((n) => n.startsWith('agent-') && n !== 'agent-lock')
          ?.replace(/^agent-/, '') ||
        i.assignee?.name ||
        '—';
      return `| **${i.identifier}** | ${i.title.replace(/\|/g, '/')} | \`${i.state?.name}\` | ${owner} | ${labs || '—'} |`;
    }),
    '',
    '## Orchestration',
    '',
    '```bash',
    'node tools/linear-agent-bridge.js --coord-status',
    'node tools/linear-agent-bridge.js --claim AGENT-N --agent <you> --files a,b',
    'node tools/linear-agent-bridge.js --done AGENT-N --agent <you> --comment "sha/proof"',
    'node tools/linear-agent-bridge.js --scrub-stale   # dry-run',
    'node tools/obsidian-linear-sync.js',
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(indexPath, indexContent, 'utf8');

  console.log(`Obsidian display sync: ${createdCount} created, ${updatedCount} updated.`);
  console.log(`Index: ${indexPath}`);
}

if (require.main === module) {
  syncObsidianWithLinear().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { syncObsidianWithLinear };
