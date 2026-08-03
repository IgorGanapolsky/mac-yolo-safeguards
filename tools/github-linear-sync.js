#!/usr/bin/env node
'use strict';

/**
 * Optional GitHub → Linear issue mirror.
 * Default: --dry-run (list what would create).
 * Pass --apply to create, with title-prefix dedup against existing Linear issues.
 *
 * NOT wired into the 15m fleet loop (too easy to spam without dedup).
 */

const { execSync } = require('child_process');
const { queryLinear } = require('./linear-agent-bridge');

const TEAM_ID = '9568bb27-2bd2-4dc8-b834-6575f2299af0'; // AGENT
const PROJECT_ID = '1b4424cd-981c-4187-88d0-97b56124f49c'; // mac-yolo-safeguards

async function existingGhMirrors() {
  const res = await queryLinear(`
    query {
      issues(filter: { team: { id: { eq: "${TEAM_ID}" } } }, first: 100) {
        nodes { id identifier title }
      }
    }
  `);
  const nodes = res.data?.issues?.nodes || [];
  const byGh = new Map();
  for (const n of nodes) {
    const m = String(n.title || '').match(/^\[GH-#(\d+)\]/);
    if (m) byGh.set(Number(m[1]), n);
  }
  return byGh;
}

async function syncGitHubIssuesToLinear({ apply = false } = {}) {
  console.log(`GitHub → Linear mirror (${apply ? 'APPLY' : 'dry-run'})...`);

  const token = execSync(
    'security find-generic-password -s "GITHUB_TOKEN" -w 2>/dev/null || echo ""',
    { encoding: 'utf8' },
  ).trim();
  const env = { ...process.env, GH_TOKEN: token || process.env.GH_TOKEN };

  const ghOutput = execSync(
    'gh issue list --repo IgorGanapolsky/mac-yolo-safeguards --limit 50 --json number,title,body,state,url',
    { env, encoding: 'utf8' },
  );
  const ghIssues = JSON.parse(ghOutput || '[]');
  const existing = await existingGhMirrors();
  console.log(`Open GH issues: ${ghIssues.length} · already mirrored: ${existing.size}`);

  let would = 0;
  let created = 0;
  for (const ghIssue of ghIssues) {
    if (existing.has(ghIssue.number)) {
      console.log(`skip GH-#${ghIssue.number} → ${existing.get(ghIssue.number).identifier}`);
      continue;
    }
    const title = `[GH-#${ghIssue.number}] ${ghIssue.title}`;
    would++;
    if (!apply) {
      console.log(`would create: ${title}`);
      continue;
    }
    const description = `**GitHub Issue**: [#${ghIssue.number}](${ghIssue.url})\n\n${ghIssue.body || 'No description provided.'}`;
    const res = await queryLinear(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier title url }
        }
      }`,
      {
        input: {
          teamId: TEAM_ID,
          projectId: PROJECT_ID,
          title,
          description,
        },
      },
    );
    if (res.data?.issueCreate?.issue) {
      console.log(`created ${res.data.issueCreate.issue.identifier}: ${title}`);
      created++;
    } else {
      console.log(`failed GH-#${ghIssue.number}:`, JSON.stringify(res).slice(0, 200));
    }
  }
  console.log(apply ? `created=${created}` : `would_create=${would} (pass --apply)`);
}

const apply = process.argv.includes('--apply');
syncGitHubIssuesToLinear({ apply }).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
