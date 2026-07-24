#!/usr/bin/env node
// agent-efficiency-board.js — token/tool-call efficiency board from real Claude Code
// session transcripts, in the spirit of JetBrains Context's jbcontext-analyze output
// (explore/edit/run/think token breakdown, sub-agent delegation counts, patch size).
// Zero new infra: reads the JSONL transcripts Claude Code already writes under
// ~/.claude/projects/<encoded-cwd>/, renders a markdown board like the existing
// business_os/revenue/ralph-gsd-board-*.md pattern. No token/usage data is invented —
// every number here is summed directly from real `message.usage` fields.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const EXPLORE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
const RUN_TOOLS = new Set(['Bash']);
const DELEGATE_TOOLS = new Set(['Agent', 'Task']);

function findProjectDirs(repoPath) {
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeProjects)) return [];
  const base = repoPath.replace(/[\/.]/g, '-').replace(/^-/, '');
  return fs.readdirSync(claudeProjects)
    .filter((name) => name.includes(base) || base.includes(name))
    .map((name) => path.join(claudeProjects, name));
}

function listTranscripts(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith('.jsonl')) files.push(path.join(dir, entry));
    }
  }
  return files;
}

function classifyMessage(content) {
  if (!Array.isArray(content)) return 'other';
  const toolNames = content.filter((c) => c && c.type === 'tool_use').map((c) => c.name);
  for (const name of toolNames) {
    if (DELEGATE_TOOLS.has(name)) return 'delegate';
  }
  for (const name of toolNames) {
    if (EDIT_TOOLS.has(name)) return 'edit';
  }
  for (const name of toolNames) {
    if (RUN_TOOLS.has(name)) return 'run';
  }
  for (const name of toolNames) {
    if (EXPLORE_TOOLS.has(name)) return 'explore';
  }
  if (content.some((c) => c && c.type === 'thinking')) return 'think';
  if (content.some((c) => c && c.type === 'text')) return 'think';
  return 'other';
}

function sinceCutoff(cutoffDays) {
  if (!cutoffDays || cutoffDays <= 0) return null;
  return Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
}

function analyze(files, cutoffMs) {
  const phaseTokens = { explore: 0, edit: 0, run: 0, think: 0, delegate: 0, other: 0 };
  const phaseMessages = { explore: 0, edit: 0, run: 0, think: 0, delegate: 0, other: 0 };
  const toolCounts = {};
  const editedFiles = new Set();
  const sessionIds = new Set();
  const delegateAgentTypes = {};
  let totalMessages = 0;
  let sessionsInWindow = 0;
  let oldestTs = null;
  let newestTs = null;

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = raw.split('\n').filter(Boolean);
    let sessionTouched = false;
    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== 'assistant') continue;
      const ts = row.timestamp ? Date.parse(row.timestamp) : null;
      if (cutoffMs && ts && ts < cutoffMs) continue;
      const msg = row.message || {};
      const usage = msg.usage || {};
      const total = (usage.input_tokens || 0) + (usage.output_tokens || 0)
        + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      if (total === 0) continue;

      const phase = classifyMessage(msg.content);
      phaseTokens[phase] += total;
      phaseMessages[phase] += 1;
      totalMessages += 1;
      sessionTouched = true;
      if (ts) {
        if (oldestTs === null || ts < oldestTs) oldestTs = ts;
        if (newestTs === null || ts > newestTs) newestTs = ts;
      }
      if (row.sessionId) sessionIds.add(row.sessionId);

      for (const c of msg.content || []) {
        if (c && c.type === 'tool_use') {
          toolCounts[c.name] = (toolCounts[c.name] || 0) + 1;
          if (EDIT_TOOLS.has(c.name) && c.input && c.input.file_path) {
            editedFiles.add(c.input.file_path);
          }
          if (DELEGATE_TOOLS.has(c.name) && c.input && c.input.subagent_type) {
            delegateAgentTypes[c.input.subagent_type] = (delegateAgentTypes[c.input.subagent_type] || 0) + 1;
          }
        }
      }
    }
    if (sessionTouched) sessionsInWindow += 1;
  }

  return {
    phaseTokens, phaseMessages, toolCounts, delegateAgentTypes,
    editedFileCount: editedFiles.size, totalMessages,
    sessionCount: sessionIds.size, sessionsInWindow,
    oldestTs, newestTs,
  };
}

function fmtTok(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function renderMarkdown(stats, dateLabel) {
  const totalTok = Object.values(stats.phaseTokens).reduce((a, b) => a + b, 0);
  const lines = [];
  lines.push(`# Agent efficiency board — ${dateLabel}`);
  lines.push('');
  lines.push('Real numbers summed directly from this Mac\'s own Claude Code session');
  lines.push('transcripts (`~/.claude/projects/**/*.jsonl`, `message.usage` fields) —');
  lines.push('no external telemetry, no estimation. Same spirit as JetBrains\' `jbcontext');
  lines.push('analyze` (explore/edit/run/think token split), built free from data we');
  lines.push('already had on disk.');
  lines.push('');
  lines.push(`- sessions_scanned: ${stats.sessionCount} (${stats.sessionsInWindow} with activity in window)`);
  lines.push(`- assistant_turns: ${stats.totalMessages}`);
  lines.push(`- total_tokens: ${fmtTok(totalTok)}`);
  lines.push(`- unique_files_edited: ${stats.editedFileCount}`);
  lines.push('');
  lines.push('## Tokens per phase (same scale — shorter is cheaper)');
  lines.push('');
  lines.push('| Phase | Tokens | % | Turns |');
  lines.push('|---|---|---|---|');
  for (const phase of ['explore', 'edit', 'run', 'think', 'delegate', 'other']) {
    const tok = stats.phaseTokens[phase] || 0;
    const pct = totalTok ? ((tok / totalTok) * 100).toFixed(1) : '0.0';
    lines.push(`| ${phase} | ${fmtTok(tok)} | ${pct}% | ${stats.phaseMessages[phase] || 0} |`);
  }
  lines.push('');
  lines.push('## Tool-call counts');
  lines.push('');
  const sortedTools = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedTools.slice(0, 15)) {
    lines.push(`- ${name}: ${count}`);
  }
  lines.push('');
  lines.push('## Sub-agent delegation (Agent/Task tool calls)');
  lines.push('');
  const sortedAgents = Object.entries(stats.delegateAgentTypes).sort((a, b) => b[1] - a[1]);
  if (sortedAgents.length === 0) {
    lines.push('- none recorded in window');
  } else {
    for (const [type, count] of sortedAgents) {
      lines.push(`- ${type}: ${count}`);
    }
  }
  lines.push('');
  lines.push('## Honesty');
  lines.push('');
  lines.push('- Phase classification is a heuristic (dominant tool_use type per assistant');
  lines.push('  turn, or thinking/text → `think` when no tool call is present) — not an');
  lines.push('  authoritative agent-internal trace like JetBrains\' own instrumentation.');
  lines.push('- Only counts sessions logged locally by Claude Code on this Mac for this');
  lines.push('  repo\'s project directories — cloud/other-machine sessions aren\'t included.');
  lines.push('- No cost/dollar estimate is computed here; token counts only.');
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const daysArgIdx = args.indexOf('--days');
  const days = daysArgIdx >= 0 ? parseInt(args[daysArgIdx + 1], 10) : 0;
  const repoPath = process.cwd();

  const dirs = findProjectDirs(repoPath);
  const files = listTranscripts(dirs);
  const cutoffMs = sinceCutoff(days);
  const stats = analyze(files, cutoffMs);

  if (jsonMode) {
    console.log(JSON.stringify({ schema: 'agent-efficiency-board/v1', ...stats }, null, 2));
    return;
  }

  const dateLabel = new Date().toISOString().slice(0, 10);
  const md = renderMarkdown(stats, dateLabel);
  const outDir = path.join(repoPath, 'business_os', 'observability');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `agent-efficiency-board-${dateLabel}.md`);
  fs.writeFileSync(outPath, md);
  console.log(`wrote ${outPath}`);
  console.log(md);
}

if (require.main === module) main();

module.exports = { classifyMessage, analyze, renderMarkdown, findProjectDirs, listTranscripts };
