#!/usr/bin/env node
'use strict';

/**
 * confusion-detector-steal.js — Steal IBM's "Test for confusion before production"
 * principle from sarbjeetjohal/x post and Ramesh Chitor's comment:
 *
 *   "Confused agents are bad agents. The fix is to stop treating confusion as a
 *    vibe. Ambiguous context, conflicting data, unclear tool boundaries: each
 *    one shows up as measurable inconsistency before it shows up as a bad
 *    decision. Test for it before production, not after."
 *
 * This tool runs BEFORE an agent takes an action (shell, edit, write, or PR)
 * and scans for confusion signals across 4 dimensions:
 *
 *   1. CONTEXT AMBIGUITY — ambiguous instructions, conflicting constraints
 *   2. DATA CONFLICTS — conflicting sources of truth (plan.md vs Linear vs git vs vault)
 *   3. TOOL BOUNDARIES — unclear tool permissions, deny rules blocking the intended path
 *   4. HISTORICAL INCONSISTENCY — past feedback contradicting current approach
 *
 * Usage:
 *   node tools/confusion-detector-steal.js                    # scan current state
 *   node tools/confusion-detector-steal.js --json            # machine readable
 *   node tools/confusion-detector-steal.js --before-shell "rm -rf /"  # pre-action gate
 *   node tools/confusion-detector-steal.js --before-edit path/to/file.js
 *   node tools/confusion-detector-steal.js --before-pr origin/main  # pre-merge check
 *
 * Exit codes:
 *   0 = no confusion detected (safe to proceed)
 *   1 = confusion detected, suggest abort or ask for clarification
 *   2 = critical confusion, ABORT (e.g. conflicting file ownership claims)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VAULT = process.env.AI_AGENT_SYNC_DIR || path.join(process.env.HOME, 'Documents/AI-Agent-Sync');
const PLAN = path.join(process.env.PWD || process.cwd(), 'plan.md');
const REPO = process.env.PR_THREADS_REPO || (fs.existsSync(path.join(process.env.PWD, 'package.json')) ? require(path.join(process.env.PWD, 'package.json')).name : 'mac-yolo-safeguards');

// ─── Confusion signal types ──────────────────────────────────────────

const SIGNAL = {
  CONTEXT_AMBIGUOUS: 'context_ambiguous',
  DATA_CONFLICT: 'data_conflict',
  TOOL_BOUNDARY: 'tool_boundary',
  HISTORICAL_INCONSISTENT: 'historical_inconsistent',
  CONFLICTING_OWNERSHIP: 'conflicting_ownership',
};

// ─── Check 1: Context ambiguity ──────────────────────────────────────

/**
 * Scan the user's intended action for ambiguity signals.
 * - Generic/vague commands ("fix it", "make it better")
 * - Contradictory requirements ("fast and secure" without tradeoffs specified)
 * - Unclear scope ("update the project" without which project)
 */
function checkContextAmbiguity(action) {
  const signals = [];
  const cmd = (action || '').toLowerCase();

  const ambiguityPatterns = [
    { pattern: /^fix (it|this|the (bug|issue|problem))$/i, label: 'vague scope: "fix it/the bug" without specific target' },
    { pattern: /^fix the \w+/i, label: 'vague scope: "fix the X" without specifying which file or error to fix' },
    { pattern: /^(improve|make better|optimize|enhance) (it|this|the (system|project))$/i, label: 'vague goal: generic improvement without metric' },
    { pattern: /(fast|quick|better|improve).* (and|plus) .* (secure|safe|reliable)/i, label: 'conflicting tradeoff: speed vs safety without tradeoff spec' },
    { pattern: /without.*specification|without.*detail|just (make|do) it/i, label: 'vagueness directive: "just do it" without specifics' },
  ];

  for (const { pattern, label } of ambiguityPatterns) {
    if (pattern.test(cmd)) {
      signals.push({ type: SIGNAL.CONTEXT_AMBIGUOUS, label, severity: 'medium', evidence: cmd.slice(0, 80) });
    }
  }

  return signals;
}

// ─── Check 2: Data conflicts ─────────────────────────────────────────

/**
 * Cross-check state across the 4 coordination surfaces:
 *   - plan.md (task status)
 *   - Linear (issue status via CLI or vault)
 *   - GitHub PRs (PR state)
 *   - Obsidian Vault (agent-state files)
 *
 * Returns signals for any inconsistent state.
 */
function checkDataConflicts(filePath) {
  const signals = [];

  // Parse plan.md for task status
  const planTasks = parsePlanForConflicts(PLAN);

  // Only check file ownership if a specific file is provided
  if (filePath) {
    // Check if the file is claimed by an agent in plan.md §2
    const ownership = checkFileOwnership(planTasks, filePath);

    // Check if another agent is working on the same file via vault agent-state
    const vaultClaim = checkVaultClaim(filePath);

    if (ownership && vaultClaim) {
      const sameOwner = ownership.agent === vaultClaim.agent;
      if (!sameOwner) {
        signals.push({
          type: SIGNAL.CONFLICTING_OWNERSHIP,
          label: `File ${filePath} is claimed by "${ownership.agent}" in plan.md §2 but "${vaultClaim.agent}" in vault agent-state`,
          severity: 'high',
          evidence: `plan.md:${ownership.line || '?'} vs ${vaultClaim.file || '?'}`,
        });
      }
    }
  }

  // Check if Linear issue and plan.md task disagree (general consistency, no file needed)
  if (planTasks.inProgress.length > 0) {
    // Verify plan.md in_progress tasks actually have associated PRs
    const noPrTasks = planTasks.inProgress.filter((t) => !t.prNumber && !t.isReleased);
    if (noPrTasks.length > 10) {
      signals.push({
        type: SIGNAL.HISTORICAL_INCONSISTENT,
        label: `${noPrTasks.length} in-progress tasks have no associated PR — agents may be working on tasks that Linear/plan.md think are done`,
        severity: 'medium',
        evidence: `${noPrTasks.length} tasks without PRs`,
      });
    }
  }

  return signals;
}

function parsePlanForConflicts(planPath) {
  if (!fs.existsSync(planPath)) return { inProgress: [], all: [] };

  const content = fs.readFileSync(planPath, 'utf8');
  const boardStart = content.indexOf('## 1. Task Board');
  const nextHeader = content.indexOf('\n## ', boardStart + 1);
  const board = content.slice(boardStart, nextHeader === -1 ? content.length : nextHeader);

  const tasks = [];
  for (const line of board.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const parts = line.trim().slice(1, -1).split('|').map((c) => c.trim());
    if (parts.length < 6) continue;
    const [id, title, status, agent, files, evidence] = parts;
    const prMatch = (evidence || '').match(/PR\s*#(\d+)/i);
    const isReleased = status.toLowerCase().includes('released') || status.toLowerCase().includes('done');
    tasks.push({ id, title, status, agent, files, evidence, prNumber: prMatch ? parseInt(prMatch[1], 10) : null, isReleased });
  }

  return {
    inProgress: tasks.filter((t) => !t.isReleased),
    all: tasks,
  };
}

function checkFileOwnership(tasks, filePath) {
  const targetFile = filePath || '';
  for (const t of tasks.all || []) {
    if (t.files && t.files.includes(targetFile)) {
      return { agent: t.agent, task: t.id };
    }
  }
  return null;
}

function checkVaultClaim(filePath) {
  if (!fs.existsSync(VAULT)) return null;

  // Check Agent-State files for claims on this file
  const stateDir = path.join(VAULT, 'Agent-State');
  if (!fs.existsSync(stateDir)) return null;

  for (const f of fs.readdirSync(stateDir, { withFileTypes: true })) {
    if (!f.isFile() || !f.name.endsWith('.md')) continue;
    try {
      const content = fs.readFileSync(path.join(stateDir, f.name), 'utf8');
      if (content.includes(filePath) || content.includes('claim')) {
        const agentMatch = content.match(/agent[:\s]+([^\s\n]+)/i);
        if (agentMatch) {
          return { agent: agentMatch[1], file: f.name };
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  return null;
}

// ─── Check 3: Tool boundary clarity ─────────────────────────────────

/**
 * Check if the agent's tool configuration has confusing or contradictory rules.
 * Reads ~/.config/poolside/settings.yaml for deny/allow rules.
 */
function checkToolBoundaries(toolName, cmd) {
  const signals = [];
  const settingsPath = path.join(process.env.HOME, '.config/poolside/settings.yaml');

  if (!fs.existsSync(settingsPath)) return signals;

  const yaml = fs.readFileSync(settingsPath, 'utf8');

  // Check if the command being run is in the deny list
  if (cmd && yaml.includes('deny:')) {
    const denySection = yaml.split('deny:')[1];
    const denyLines = denySection.split('\n').filter((l) => l.trim().startsWith('-'));
    for (const line of denyLines) {
      const pattern = line.trim().replace(/^- /, '').replace(/['"]/g, '');
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\.\*\*/g, '.*')
        .replace(/\\\*/g, '.*');
      const regex = new RegExp(regexPattern.replace(/\//g, '[\\/]'));
      if (regex.test(cmd)) {
        signals.push({
          type: SIGNAL.TOOL_BOUNDARY,
          label: `Command "${cmd.slice(0, 60)}" matches deny rule "${pattern}" — execution will be blocked`,
          severity: 'high',
          evidence: `settings.yaml deny: ${pattern}`,
        });
      }
    }
  }

  // Check for conflicting allow/deny on the same path
  if (yaml.includes('allow:') && yaml.includes('deny:')) {
    const allowSection = yaml.split('allow:')[1].split('deny:')[0];
    const denySection = yaml.split('deny:')[1];
    signals.push({
      type: SIGNAL.TOOL_BOUNDARY,
      label: 'Settings.yaml has both allow(**) and deny(rules) — check if deny rules conflict with allow',
      severity: 'low',
      evidence: 'allow: /** vs deny: [' + (denySection.match(/- path:.*$/gm) || []).length + ' rules]',
    });
  }

  // Check if tool is MCP-based but not in the allow list
  if (toolName && toolName.startsWith('mcp__') && !yaml.includes(toolName)) {
    signals.push({
      type: SIGNAL.TOOL_BOUNDARY,
      label: `Tool "${toolName}" is not explicitly listed in settings.yaml — may have restricted access`,
      severity: 'medium',
      evidence: `tool: ${toolName}`,
    });
  }

  return signals;
}

// ─── Check 4: Historical inconsistency ───────────────────────────────

/**
 * Check past feedback and decisions for patterns that contradict current approach.
 * Uses ThumbGate feedback log + plan.md decisions log.
 */
function checkHistoricalInconsistency(action) {
  const signals = [];

  // Read feedback from ThumbGate log
  const feedbackPath = path.join(process.env.HOME, '.thumbgate', 'feedback.jsonl');
  if (fs.existsSync(feedbackPath)) {
    const feedback = fs.readFileSync(feedbackPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    // Check for recent down-votes on similar tasks
    const recentDownvotes = feedback.filter((f) =>
      f.signal === 'down' &&
      f.tags && f.tags.some((t) => ['shell', 'git', 'path', 'tool'].includes(t))
    );

    if (recentDownvotes.length > 3) {
      const contexts = recentDownvotes.slice(0, 3).map((f) => f.context).join('; ');
      signals.push({
        type: SIGNAL.HISTORICAL_INCONSISTENT,
        label: `${recentDownvotes.length} recent down-votes on shell/git/path/tool actions — agent may repeat same mistakes`,
        severity: 'high',
        evidence: contexts.slice(0, 200),
      });
    }
  }

  // Check plan.md decisions log for reverted decisions
  if (fs.existsSync(PLAN)) {
    const content = fs.readFileSync(PLAN, 'utf8');
    const decisions = content.split('\n').filter((l) => l.includes('DECISION') || l.includes(' Reverted'));
    const reverted = decisions.filter((d) => d.toLowerCase().includes('revert'));
    if (reverted.length > 0) {
      signals.push({
        type: SIGNAL.HISTORICAL_INCONSISTENT,
        label: `${reverted.length} reverted decisions found in plan.md — verify current direction matches accepted decisions`,
        severity: 'medium',
        evidence: reverted.slice(0, 2).join(' | '),
      });
    }
  }

  return signals;
}

// ─── Main confusion scan ─────────────────────────────────────────────

function scan(options) {
  const signals = [];

  // 1. Context ambiguity
  if (options.action) {
    signals.push(...checkContextAmbiguity(options.action));
  }

  // 2. Data conflicts (file ownership + coordination surface consistency)
  if (options.filePath) {
    signals.push(...checkDataConflicts(options.filePath));
  } else {
    // No specific file — check general data consistency
    signals.push(...checkDataConflicts(null));
  }

  // 3. Tool boundary clarity
  if (options.cmd) {
    signals.push(...checkToolBoundaries(options.toolName, options.cmd));
  }
  // Always check if tool boundaries are generally confusing
  signals.push(...checkToolBoundaries(options.toolName, null));

  // 4. Historical inconsistency
  signals.push(...checkHistoricalInconsistency(options.action));

  // Classify severity
  let maxSeverity = 'none';
  const severityRank = { none: 0, low: 1, medium: 2, high: 3 };
  for (const s of signals) {
    if (severityRank[s.severity] > severityRank[maxSeverity]) {
      maxSeverity = s.severity;
    }
  }

  return {
    confusing: signals.filter((s) => s.severity === 'high').length > 0,
    signals,
    maxSeverity,
    totalSignals: signals.length,
    timestamp: new Date().toISOString(),
  };
}

function printHuman(result) {
  const { confusing, signals, maxSeverity, totalSignals } = result;

  const emoji = { none: '✅', low: '⚠️', medium: '🔶', high: '🛑' };
  console.log('═'.repeat(72));
  console.log(`  CONFUSION DETECTOR — ${confusing ? 'CONFUSION DETECTED' : 'All clear'}`);
  console.log(`  Stolen from IBM's "Test for confusion before production" (sarbjeetjohal)`);
  console.log('═'.repeat(72));
  console.log(`  Timestamp: ${result.timestamp}`);
  console.log(`  Max severity: ${emoji[maxSeverity]} ${maxSeverity}`);
  console.log(`  Total signals: ${totalSignals}`);
  console.log('═'.repeat(72));

  if (totalSignals === 0) {
    console.log('  No confusion signals detected. Safe to proceed.');
    console.log('═'.repeat(72));
    return;
  }

  for (const s of signals) {
    console.log(`\n  ${emoji[s.severity]} [${s.type}] ${s.label}`);
    console.log(`    Evidence: ${s.evidence}`);
  }

  console.log('\n' + '═'.repeat(72));
  if (confusing) {
    console.log('  🛑 CONFUSION DETECTED — recommend: ABORT or ask for clarification');
  } else {
    console.log('  ⚠️  Low/medium signals — proceed with caution');
  }
  console.log('═'.repeat(72));
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(argv) {
  const options = {
    json: false,
    action: null,
    filePath: null,
    cmd: null,
    toolName: null,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--json': options.json = true; break;
      case '--before-shell': options.cmd = argv[++i]; options.toolName = 'shell'; break;
      case '--before-edit': options.filePath = argv[++i]; options.toolName = 'edit'; break;
      case '--before-write': options.filePath = argv[++i]; options.toolName = 'write'; break;
      case '--before-pr': options.cmd = `gh pr merge ${argv[++i]}`; options.toolName = 'pr'; break;
      case '--action': options.action = argv[++i]; break;
      case '--file': options.filePath = argv[++i]; break;
      case '--help':
      case '-h':
        console.log(`Usage: node tools/confusion-detector-steal.js [--json] [--before-shell CMD] [--before-edit FILE] [--action "text"]`);
        process.exit(0);
    }
  }

  const result = scan(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  // Exit 2 if critical confusion (high severity), 1 if medium, 0 if none
  process.exit(result.maxSeverity === 'none' ? 0 : result.maxSeverity === 'high' ? 2 : 1);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  checkContextAmbiguity,
  checkDataConflicts,
  checkToolBoundaries,
  checkHistoricalInconsistency,
  scan,
  SIGNAL,
};
