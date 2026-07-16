#!/usr/bin/env node
'use strict';

/**
 * Grok Build PreToolUse safety hook (fleet-managed).
 * Denies destructive shell ops and secret-path reads. Fail-open only on
 * malformed input; explicit deny always blocks.
 */

const fs = require('fs');
const path = require('path');

const SAFETY_PATTERNS = [
  { id: 'rm_rf', re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)(\s|$)/i, reason: 'Blocked recursive force delete (rm -rf)' },
  { id: 'git_force_push', re: /\bgit\s+push\b[^;&|\n]*--force\b|\bgit\s+push\b[^;&|\n]*\s-f\b/i, reason: 'Blocked git push --force' },
  { id: 'git_reset_hard', re: /\bgit\s+reset\s+--hard\b/i, reason: 'Blocked git reset --hard' },
  { id: 'git_clean_fd', re: /\bgit\s+clean\b[^;&|\n]*-f[^;&|\n]*d|\bgit\s+clean\b[^;&|\n]*-d[^;&|\n]*f/i, reason: 'Blocked git clean -fd' },
  { id: 'security_cmd', re: /\bsecurity\s+(delete|set|add|find|import|export)\b/i, reason: 'Blocked macOS security keychain mutation/export' },
  { id: 'ssh_dir', re: /~\/\.ssh|\$HOME\/\.ssh|\/\.ssh\//i, reason: 'Blocked access to ~/.ssh' },
  { id: 'gnupg_dir', re: /~\/\.gnupg|\$HOME\/\.gnupg|\/\.gnupg\//i, reason: 'Blocked access to ~/.gnupg' },
  { id: 'drop_db', re: /\b(drop\s+(database|table)|truncate\s+table)\b/i, reason: 'Blocked destructive SQL' },
  { id: 'mkfs', re: /\bmkfs\b|\bdd\s+if=/i, reason: 'Blocked disk-destructive command' },
];

function evaluateSafety(toolName, toolInput) {
  const name = String(toolName || '');
  const input = toolInput || {};
  const command = String(input.command || input.cmd || '');
  const filePath = String(input.target_file || input.file_path || input.path || '');

  const isShell = /run_terminal_command|Bash|Shell|terminal/i.test(name) || Boolean(command);
  const isRead = /read_file|Read/i.test(name);

  if (isRead && (/\.env(\.|$)/i.test(filePath) || /auth\.json$/i.test(filePath))) {
    return { decision: 'deny', reason: 'Blocked read of secret-bearing path (.env / auth.json)' };
  }

  if (isShell && command) {
    for (const rule of SAFETY_PATTERNS) {
      if (rule.re.test(command)) {
        return { decision: 'deny', reason: rule.reason };
      }
    }
  }

  return { decision: 'allow' };
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }

  let event = {};
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(`${JSON.stringify({ decision: 'allow' })}\n`);
    return 0;
  }

  const toolName = event.toolName || event.tool_name || '';
  const toolInput = event.toolInput || event.tool_input || {};
  const verdict = evaluateSafety(toolName, toolInput);

  // Optional prompt-free receipt (no command text stored).
  try {
    const home = process.env.HOME || require('os').homedir();
    const dir = path.join(home, '.hermes', 'receipts', 'grok-build-fleet');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (verdict.decision === 'deny') {
      const line = JSON.stringify({
        at: new Date().toISOString(),
        event: 'pre_tool_use_deny',
        toolName,
        reason: verdict.reason,
      });
      fs.appendFileSync(path.join(dir, 'denies.jsonl'), `${line}\n`, { mode: 0o600 });
    }
  } catch {
    // ignore receipt failures
  }

  if (verdict.decision === 'deny') {
    process.stdout.write(`${JSON.stringify({ decision: 'deny', reason: verdict.reason })}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify({ decision: 'allow' })}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { evaluateSafety, SAFETY_PATTERNS };
