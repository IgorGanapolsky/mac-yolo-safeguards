#!/usr/bin/env node
'use strict';

/**
 * mac-computer-history.js — Computer History & Work Context Engine for macOS / Hermes.
 * Inspired by OpenAI ChatGPT Computer History & Record-and-Replay (Zero-Screenshot / Zero-OCR).
 *
 * Capabilities:
 * 1. Record & timeline interaction events (git commits, file edits, PR updates, tasks, terminal commands).
 * 2. Query work history ("What was I debugging yesterday?", "Where did I leave off on that PR?").
 * 3. Auto-generate reusable agent skills from recorded workflows (Record & Replay -> SKILL.md).
 * 4. Generate automated team standup updates (--standup).
 * 5. Manage local privacy exclusions (~/.hermes/history_exclusions.json).
 *
 * Usage:
 *   node tools/mac-computer-history.js record --type file_edit --detail "apps/hermes-control-plane/lib/device-auth.ts"
 *   node tools/mac-computer-history.js query "PR" --since 24h
 *   node tools/mac-computer-history.js standup --since 24h
 *   node tools/mac-computer-history.js generate-skill --name my-workflow --desc "Auto generated workflow"
 *   node tools/mac-computer-history.js exclusions --add ".env*"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HERMES_DIR = path.join(os.homedir(), '.hermes');
const HISTORY_FILE = path.join(HERMES_DIR, 'computer_history.json');
const EXCLUSIONS_FILE = path.join(HERMES_DIR, 'history_exclusions.json');
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_EXCLUSIONS = [
  '*.env*',
  '*credentials*',
  '*secret*',
  '*.pem',
  '*.key',
  '*token*',
  'node_modules/*',
  '.git/*',
];

function ensureStorageDir() {
  if (!fs.existsSync(HERMES_DIR)) {
    fs.mkdirSync(HERMES_DIR, { recursive: true });
  }
}

function getExclusions() {
  ensureStorageDir();
  if (!fs.existsSync(EXCLUSIONS_FILE)) {
    fs.writeFileSync(EXCLUSIONS_FILE, JSON.stringify(DEFAULT_EXCLUSIONS, null, 2), 'utf8');
    return DEFAULT_EXCLUSIONS;
  }
  try {
    return JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, 'utf8'));
  } catch {
    return DEFAULT_EXCLUSIONS;
  }
}

function isExcluded(targetPath, exclusions = getExclusions()) {
  if (!targetPath) return false;
  const str = String(targetPath).toLowerCase();
  for (const pattern of exclusions) {
    const cleanPattern = pattern.replace(/\*/g, '').toLowerCase();
    if (cleanPattern && str.includes(cleanPattern)) {
      return true;
    }
  }
  return false;
}

function readHistory() {
  ensureStorageDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeHistory(events) {
  ensureStorageDir();
  // Keep max 5000 events
  const trimmed = events.slice(-5000);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
}

function recordEvent(type, detail, metadata = {}) {
  if (isExcluded(detail) || isExcluded(JSON.stringify(metadata))) {
    return { recorded: false, reason: 'excluded' };
  }
  const events = readHistory();
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    type, // 'git_commit', 'file_edit', 'terminal_cmd', 'task_complete', 'pr_update', 'app_focus'
    detail: String(detail || '').slice(0, 1000),
    metadata,
  };
  events.push(event);
  writeHistory(events);
  return { recorded: true, event };
}

function parseTimeWindow(sinceStr) {
  if (!sinceStr) return 24 * 60 * 60 * 1000; // default 24h
  const match = sinceStr.match(/^(\d+)([smhd])$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function getGitCommits(sinceMs) {
  try {
    const sinceSeconds = Math.floor((Date.now() - sinceMs) / 1000);
    const out = execFileSync('git', ['log', `--since=${sinceSeconds}`, '--pretty=format:%h - %an, %ar : %s', '-n', '20'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function getOpenPRs() {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--limit', '10', '--json', 'number,title,headRefName,url,isDraft'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out) || [];
  } catch {
    return [];
  }
}

function queryWorkHistory(query = '', sinceStr = '24h') {
  const windowMs = parseTimeWindow(sinceStr);
  const cutoff = Date.now() - windowMs;
  const events = readHistory().filter((e) => e.timestamp >= cutoff);
  const gitCommits = getGitCommits(windowMs);
  const prs = getOpenPRs();

  let filteredEvents = events;
  if (query && query.trim()) {
    const q = query.toLowerCase();
    filteredEvents = events.filter(
      (e) =>
        e.type.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        JSON.stringify(e.metadata).toLowerCase().includes(q)
    );
  }

  // Deduplicate files edited
  const editedFiles = [
    ...new Set(
      events
        .filter((e) => e.type === 'file_edit')
        .map((e) => e.detail)
    ),
  ];

  return {
    timeWindow: sinceStr,
    cutoffIso: new Date(cutoff).toISOString(),
    queryFilter: query || null,
    summary: {
      totalRecordedEvents: events.length,
      matchingEventsCount: filteredEvents.length,
      filesEditedCount: editedFiles.length,
      recentCommitsCount: gitCommits.length,
      activePRsCount: prs.length,
    },
    recentCommits: gitCommits,
    activePRs: prs,
    filesEdited: editedFiles,
    events: filteredEvents,
  };
}

function generateStandupDigest(sinceStr = '24h') {
  const history = queryWorkHistory('', sinceStr);
  const lines = [];

  lines.push(`# Daily Work & Activity Digest (${history.timeWindow})`);
  lines.push(`*Generated on ${new Date().toLocaleString()}*\n`);

  lines.push(`## 🚀 Key Achievements & Merged/Open PRs`);
  if (history.activePRs.length === 0) {
    lines.push(`- No open PRs currently in flight.`);
  } else {
    history.activePRs.forEach((pr) => {
      lines.push(`- **PR #${pr.number}**: ${pr.title} (\`${pr.headRefName}\`${pr.isDraft ? ', Draft' : ''})`);
    });
  }

  lines.push(`\n## 📝 Recent Commits (${history.recentCommits.length})`);
  if (history.recentCommits.length === 0) {
    lines.push(`- No git commits in this window.`);
  } else {
    history.recentCommits.forEach((commit) => {
      lines.push(`- ${commit}`);
    });
  }

  lines.push(`\n## 📂 Files Touched & Modified (${history.filesEdited.length})`);
  if (history.filesEdited.length === 0) {
    lines.push(`- No recorded file modifications.`);
  } else {
    history.filesEdited.slice(0, 15).forEach((file) => {
      lines.push(`- \`${file}\``);
    });
  }

  lines.push(`\n## ⏱ Activity Timeline (${history.summary.matchingEventsCount} events)`);
  history.events.slice(-10).forEach((evt) => {
    lines.push(`- **[${evt.type}]** ${evt.detail} (${new Date(evt.timestamp).toLocaleTimeString()})`);
  });

  return lines.join('\n');
}

function generateSkillFromHistory(skillName, description, lookbackMinutes = 60) {
  const history = queryWorkHistory('', `${lookbackMinutes}m`);

  const sanitizedName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const targetDir = path.join(REPO_ROOT, '.agents/skills', sanitizedName);
  const targetFile = path.join(targetDir, 'SKILL.md');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const steps = history.events.map((e, idx) => `${idx + 1}. **[${e.type}]** ${e.detail}`);
  if (steps.length === 0) {
    steps.push('1. Execute captured activity sequence');
  }

  const skillContent = `---
name: ${sanitizedName}
description: ${description || 'Auto-generated skill created from Mac Computer History workflow recording'}
version: 1.0.0
---

# ${sanitizedName}

${description || 'Workflow recorded via Mac Computer History.'}

## Execution Steps

${steps.join('\n')}

## Verification Commands

\`\`\`bash
# Verify execution output
npm test
\`\`\`
`;

  fs.writeFileSync(targetFile, skillContent, 'utf8');
  return { skillName: sanitizedName, path: targetFile, stepsCount: steps.length };
}

// CLI Execution Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'query';

  if (cmd === 'record') {
    const typeIdx = args.indexOf('--type');
    const type = typeIdx !== -1 ? args[typeIdx + 1] : 'interaction';
    const detailIdx = args.indexOf('--detail');
    const detail = detailIdx !== -1 ? args[detailIdx + 1] : args[1] || 'action';
    const res = recordEvent(type, detail);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'query') {
    const sinceIdx = args.indexOf('--since');
    const since = sinceIdx !== -1 ? args[sinceIdx + 1] : '24h';
    const query = args.find((a) => !a.startsWith('--') && a !== 'query') || '';
    const res = queryWorkHistory(query, since);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'standup') {
    const sinceIdx = args.indexOf('--since');
    const since = sinceIdx !== -1 ? args[sinceIdx + 1] : '24h';
    console.log(generateStandupDigest(since));
  } else if (cmd === 'generate-skill') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx !== -1 ? args[nameIdx + 1] : 'recorded-workflow';
    const descIdx = args.indexOf('--desc');
    const desc = descIdx !== -1 ? args[descIdx + 1] : 'Recorded workflow skill';
    const res = generateSkillFromHistory(name, desc);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'exclusions') {
    const addIdx = args.indexOf('--add');
    if (addIdx !== -1 && args[addIdx + 1]) {
      const ex = getExclusions();
      ex.push(args[addIdx + 1]);
      fs.writeFileSync(EXCLUSIONS_FILE, JSON.stringify([...new Set(ex)], null, 2), 'utf8');
      console.log(`Added exclusion pattern: ${args[addIdx + 1]}`);
    } else {
      console.log(JSON.stringify(getExclusions(), null, 2));
    }
  } else {
    console.log(`Usage: mac-computer-history.js [record|query|standup|generate-skill|exclusions]`);
  }
}

module.exports = {
  recordEvent,
  queryWorkHistory,
  generateStandupDigest,
  generateSkillFromHistory,
  getExclusions,
  isExcluded,
};
