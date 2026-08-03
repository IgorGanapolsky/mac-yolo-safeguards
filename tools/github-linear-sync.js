#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const { queryLinear } = require('./linear-agent-bridge');

const TEAM_ID = '9568bb27-2bd2-4dc8-b834-6575f2299af0'; // Agent Operations (AGENT)
const PROJECT_ID = '1b4424cd-981c-4187-88d0-97b56124f49c'; // mac-yolo-safeguards

async function syncGitHubIssuesToLinear() {
  console.log('🔄 Fetching open GitHub issues for mac-yolo-safeguards...');
  
  const token = execSync('security find-generic-password -s "GITHUB_TOKEN" -w 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
  const env = { ...process.env, GH_TOKEN: token || process.env.GH_TOKEN };

  const ghOutput = execSync('gh issue list --repo IgorGanapolsky/mac-yolo-safeguards --limit 50 --json number,title,body,state,url', {
    env,
    encoding: 'utf8',
  });

  const ghIssues = JSON.parse(ghOutput || '[]');
  console.log(`Found ${ghIssues.length} open GitHub issues.`);

  const createIssueMutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  let syncedCount = 0;

  for (const ghIssue of ghIssues) {
    const title = `[GH-#${ghIssue.number}] ${ghIssue.title}`;
    const description = `**GitHub Issue**: [#${ghIssue.number}](${ghIssue.url})\n\n${ghIssue.body || 'No description provided.'}`;

    const res = await queryLinear(createIssueMutation, {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        title: title,
        description: description,
      },
    });

    if (res.data?.issueCreate?.issue) {
      console.log(`✅ Synced GH-#${ghIssue.number} to Linear: ${res.data.issueCreate.issue.identifier}`);
      syncedCount++;
    } else {
      console.log(`⚠️ Failed to sync GH-#${ghIssue.number}:`, JSON.stringify(res));
    }
  }

  console.log(`\n🎉 Sync Complete! ${syncedCount} GitHub issues synced to Linear project mac-yolo-safeguards.`);

  // Update Obsidian notes
  try {
    execSync('node tools/obsidian-linear-sync.js', { encoding: 'utf8' });
  } catch (err) {
    console.error('Error updating Obsidian notes:', err.message);
  }
}

syncGitHubIssuesToLinear().catch(console.error);
