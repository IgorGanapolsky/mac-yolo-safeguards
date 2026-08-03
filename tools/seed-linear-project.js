#!/usr/bin/env node
'use strict';

const { queryLinear } = require('./linear-agent-bridge');

const TEAM_ID = '9568bb27-2bd2-4dc8-b834-6575f2299af0'; // Agent Operations (AGENT)

async function seedLinearProject() {
  console.log('Seeding Linear Project mac-yolo-safeguards under Team AGENT...');

  // 1. Create Project
  const createProjectMutation = `
    mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project {
          id
          name
          url
        }
      }
    }
  `;

  const projectRes = await queryLinear(createProjectMutation, {
    input: {
      name: 'mac-yolo-safeguards',
      description: 'Autonomous AI Agent Safety Guardrails, Herdr Integration & Hermes Mobile Control Plane',
      teamIds: [TEAM_ID],
    },
  });

  console.log('Project creation response:', JSON.stringify(projectRes, null, 2));
  const projectId = projectRes.data?.projectCreate?.project?.id;

  // 2. Create Initial Agent Issues
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

  const issuesToCreate = [
    { title: '🛡️ ThumbGate Pre-Action Safety Gates & Financial Interceptors', description: 'Enforce PreToolUse blocks for high-risk terminal commands and paid APIs (apollo, twilio, sendgrid).' },
    { title: '🐮 Herdr Agent Multiplexer Status & Mobile Switcher', description: 'Integrate Herdr TUI status tracking (working, blocked, done, idle) into Hermes Mobile UI.' },
    { title: '⚡ Multi-Agent Linear GraphQL Bridge & Obsidian Sync', description: 'Real-time multi-agent coordination bridge between Linear, Obsidian local markdown notes, and Herdr.' },
    { title: '🚀 TerminalTrove Directory Submission & Product Launch', description: 'Publish Herdr and ThumbGate CLI tools to TerminalTrove and developer directories.' },
  ];

  for (const item of issuesToCreate) {
    const res = await queryLinear(createIssueMutation, {
      input: {
        teamId: TEAM_ID,
        projectId: projectId,
        title: item.title,
        description: item.description,
      },
    });
    console.log(`Created issue: ${item.title} ->`, res.data?.issueCreate?.issue?.identifier);
  }

  // 3. Navigate Chrome to the new project URL
  if (projectRes.data?.projectCreate?.project?.url) {
    const url = projectRes.data.projectCreate.project.url;
    console.log(`\nNavigating Chrome to live Linear dashboard: ${url}`);
    const { execSync } = require('child_process');
    try {
      execSync(`osascript -e 'tell application "Google Chrome" to set URL of active tab of front window to "${url}"'`);
    } catch {
      /* ignore */
    }
  }
}

seedLinearProject().catch(console.error);
