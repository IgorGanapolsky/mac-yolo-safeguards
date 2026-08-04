#!/usr/bin/env node
'use strict';

/**
 * Obsidian vault mirror for Linear AGENT issues + GitHub product board.
 *
 * Writes under ~/Documents/AI-Agent-Sync/Projects/mac-yolo-safeguards/:
 *   LINEAR-SYNC.md          — active Linear issues (not canceled/completed)
 *   GITHUB-PRODUCT-BOARD.md — open GH issues ↔ Linear 1:1 map (SSOT for product)
 *   Issues/AGENT-*.md       — per-issue notes (active only)
 *
 * Does NOT invent Linear issues (that is tools/github-linear-sync.js).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { queryLinear } = require('./linear-agent-bridge');

const VAULT_PATH =
  process.env.HERMES_AGENT_SYNC_VAULT ||
  path.join(process.env.HOME || '', 'Documents/AI-Agent-Sync');
const PROJECT_DIR = path.join(VAULT_PATH, 'Projects/mac-yolo-safeguards');
const ISSUES_DIR = path.join(PROJECT_DIR, 'Issues');
const GH_REPO = 'IgorGanapolsky/mac-yolo-safeguards';
const GH_TITLE_RE = /^\[GH-#(\d+)\]\s*/i;

function escapeMdCell(s) {
  return String(s || '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

async function fetchActiveAgentIssues() {
  const all = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const res = await queryLinear(
      `
      query($after: String) {
        issues(
          first: 100
          after: $after
          filter: {
            team: { key: { eq: "AGENT" } }
            state: { type: { nin: ["completed", "canceled"] } }
          }
          orderBy: updatedAt
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            priorityLabel
            state { name type }
            project { name }
            assignee { name }
            labels { nodes { name } }
            updatedAt
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
      { after },
    );
    if (res.error) {
      throw new Error(`Linear list failed: ${res.message || JSON.stringify(res)}`);
    }
    const conn = res.data?.issues;
    all.push(...(conn?.nodes || []));
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return all;
}

function fetchOpenGitHubIssues() {
  try {
    const out = execFileSync(
      'gh',
      [
        'issue',
        'list',
        '--repo',
        GH_REPO,
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'number,title,labels,state,url,updatedAt',
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(out || '[]');
  } catch (err) {
    console.warn(
      `⚠️ GitHub issue list failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function parseGhNumber(title) {
  const m = String(title || '').match(GH_TITLE_RE);
  return m ? Number(m[1]) : null;
}

function writeIssueNote(issue) {
  const filename = `${issue.identifier}.md`;
  const filePath = path.join(ISSUES_DIR, filename);
  const labels = (issue.labels?.nodes || []).map((l) => l.name).join(', ') || '—';
  const assignee = issue.assignee?.name || 'unassigned';
  const body = [
    '---',
    `linear_id: "${issue.identifier}"`,
    `linear_guid: "${issue.id}"`,
    `title: "${String(issue.title || '').replace(/"/g, '\\"')}"`,
    `status: "${issue.state?.name || 'Backlog'}"`,
    `project: "${issue.project?.name || 'mac-yolo-safeguards'}"`,
    `priority: "${issue.priorityLabel || 'Normal'}"`,
    `assignee: "${assignee}"`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${issue.identifier}: ${issue.title}`,
    '',
    `**Status**: \`${issue.state?.name || 'Backlog'}\`  `,
    `**Project**: \`${issue.project?.name || 'mac-yolo-safeguards'}\`  `,
    `**Assignee**: \`${assignee}\`  `,
    `**Labels**: \`${labels}\`  `,
    `**Updated**: \`${issue.updatedAt}\``,
    '',
    '## Description',
    issue.description || '_No description provided._',
    '',
    '## Sync',
    `- Mirrored by \`node tools/obsidian-linear-sync.js\``,
    `- GH product board: [[GITHUB-PRODUCT-BOARD]]`,
    '',
  ].join('\n');
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, body, 'utf8');
  return !existed;
}

async function syncObsidianWithLinear() {
  console.log('🔄 Running Obsidian ↔ Linear + GitHub product board sync…');

  if (!fs.existsSync(ISSUES_DIR)) {
    fs.mkdirSync(ISSUES_DIR, { recursive: true });
  }

  const issues = await fetchActiveAgentIssues();
  console.log(`Fetched ${issues.length} active (non-canceled) AGENT Linear issues.`);

  let createdCount = 0;
  let updatedCount = 0;
  for (const issue of issues) {
    if (writeIssueNote(issue)) createdCount++;
    else updatedCount++;
  }

  // GH product SSOT
  const ghOpen = fetchOpenGitHubIssues();
  const ghMirrors = issues.filter((i) => parseGhNumber(i.title) != null);
  const byGh = new Map();
  for (const i of ghMirrors) {
    const n = parseGhNumber(i.title);
    if (!byGh.has(n)) byGh.set(n, []);
    byGh.get(n).push(i);
  }

  const productRows = [];
  const syncGaps = [];
  if (Array.isArray(ghOpen)) {
    for (const gh of ghOpen.sort((a, b) => a.number - b.number)) {
      const mirrors = byGh.get(gh.number) || [];
      const labels = (gh.labels || []).map((l) => l.name).join(', ') || '—';
      if (mirrors.length === 0) {
        productRows.push(
          `| **#${gh.number}** | ${escapeMdCell(gh.title)} | \`${labels}\` | **MISSING Linear** | — | [GH](${gh.url}) |`,
        );
        syncGaps.push(`GH-#${gh.number} has no active Linear [GH-#${gh.number}] mirror`);
      } else if (mirrors.length > 1) {
        productRows.push(
          `| **#${gh.number}** | ${escapeMdCell(gh.title)} | \`${labels}\` | **MULTI** ${mirrors.map((m) => m.identifier).join(', ')} | ${mirrors[0].state?.name} | [GH](${gh.url}) |`,
        );
        syncGaps.push(`GH-#${gh.number} has ${mirrors.length} Linear clones (want 1)`);
      } else {
        const m = mirrors[0];
        productRows.push(
          `| **#${gh.number}** | ${escapeMdCell(gh.title)} | \`${labels}\` | **${m.identifier}** | \`${m.state?.name}\` | [GH](${gh.url}) · [[${m.identifier}]] |`,
        );
      }
    }
    // Linear GH mirrors with no open GH issue
    for (const [n, list] of byGh) {
      if (!ghOpen.some((g) => g.number === n)) {
        syncGaps.push(
          `Linear ${list.map((i) => i.identifier).join(',')} mirrors closed/missing GH-#${n}`,
        );
      }
    }
  } else {
    syncGaps.push('GitHub issue list unavailable — product board partial');
  }

  const productBoardPath = path.join(PROJECT_DIR, 'GITHUB-PRODUCT-BOARD.md');
  const productBoard = [
    '# GitHub product board ↔ Linear (mac-yolo-safeguards)',
    '',
    `*Last synced: ${new Date().toISOString()}*`,
    '',
    '**SSOT for product issues** is GitHub Issues. Linear holds agent locks; this table is the 1:1 map.',
    '',
    '| GH | Title | GH labels | Linear | Linear status | Links |',
    '|---|---|---|---|---|---|',
    ...(productRows.length ? productRows : ['| — | _no open GH issues or GH list failed_ | — | — | — | — |']),
    '',
    '## Sync health',
    '',
    syncGaps.length === 0
      ? '- **OK** — every open GH issue has exactly one active Linear `[GH-#N]` mirror.'
      : syncGaps.map((g) => `- ⚠️ ${g}`).join('\n'),
    '',
    '## Repair',
    '',
    '```bash',
    'cd /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
    'node tools/github-linear-sync.js   # idempotent GH→Linear + this vault refresh',
    '```',
    '',
    '## Orchestration',
    '',
    '- Claim work: `node tools/linear-agent-bridge.js --claim AGENT-XXX --agent <you>`',
    '- Board workflow: `/mac-yolo-issues-board` in Grok Build',
    '- Continuous: LaunchAgent `com.igor.linear-obsidian-sync` → `tools/linear-obsidian-continuous-sync.sh`',
    '',
  ].join('\n');
  fs.writeFileSync(productBoardPath, productBoard, 'utf8');
  console.log(`Updated product board: ${productBoardPath}`);

  // Active Linear index (no canceled spam)
  const ghSection = productRows.length
    ? [
        '## GitHub product issues (open)',
        '',
        '| GH | Linear | Status |',
        '|---|---|---|',
        ...((Array.isArray(ghOpen) ? ghOpen : []).map((gh) => {
          const m = (byGh.get(gh.number) || [])[0];
          return `| #${gh.number} | ${m ? m.identifier : '**MISSING**'} | ${m ? '`' + m.state?.name + '`' : '—'} |`;
        })),
        '',
      ]
    : [];

  const activeTable = issues.map(
    (i) =>
      `| **${i.identifier}** | ${escapeMdCell(i.title)} | \`${i.state?.name}\` | ${i.priorityLabel || '—'} | ${i.assignee?.name || '—'} | [[${i.identifier}]] |`,
  );

  const indexPath = path.join(PROJECT_DIR, 'LINEAR-SYNC.md');
  const indexContent = [
    '# Linear ↔ Obsidian Sync Board: mac-yolo-safeguards',
    `*Last synced: ${new Date().toLocaleString()}* · **active only** (canceled clones excluded)`,
    '',
    'Product issue map: **[[GITHUB-PRODUCT-BOARD]]**',
    '',
    ...ghSection,
    '## Active Linear issues (AGENT team)',
    '',
    '| Issue ID | Title | Status | Priority | Assignee | Note |',
    '|---|---|---|---|---|---|',
    ...(activeTable.length ? activeTable : ['| — | _none active_ | — | — | — | — |']),
    '',
    '## Sync commands',
    '',
    '```bash',
    'node tools/github-linear-sync.js      # GH open → Linear 1:1 + vault',
    'node tools/obsidian-linear-sync.js    # vault only from live Linear+GH',
    '```',
    '',
    '## Directives',
    '',
    '- GitHub Issues = public **product** board for this repo.',
    '- Linear = agent claim/lock bus (`[GH-#N]` titles for product mirrors).',
    '- Vault = human/agent readable mirror — must match open GH 1:1 for product rows.',
    '',
  ].join('\n');
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log(`Updated Obsidian index: ${indexPath}`);

  const ok = syncGaps.length === 0 && Array.isArray(ghOpen);
  console.log(
    `✅ Obsidian Sync Complete: ${createdCount} notes created, ${updatedCount} updated, product gaps=${syncGaps.length}`,
  );
  if (!ok) {
    process.exitCode = 1;
    console.log('⚠️ Product board not fully 1:1 — see GITHUB-PRODUCT-BOARD.md');
  }
}

if (require.main === module) {
  syncObsidianWithLinear().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { syncObsidianWithLinear, parseGhNumber };
