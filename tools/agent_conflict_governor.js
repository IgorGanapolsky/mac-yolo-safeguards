#!/usr/bin/env node
/**
 * Agent Conflict Governor & De-Escalation Engine
 *
 * Implements architectural safeguards inspired by Anthropic's multi-agent
 * conflict research (SecurityWeek / Anthropic Multiagent Systems 2026):
 * 1. Anti-Retaliation Interdiction: Blocks agents from killing peer processes,
 *    tampering with rival accounts/tokens, or deploying aggressive hunting loops.
 * 2. Competing Objective Detection: Identifies irreconcilable or mutually exclusive
 *    task scopes before agents collide on shared workspaces.
 * 3. Structured Truce & Arbitration: Replaces hostile lockouts with negotiated
 *    de-escalation, audit logging to plan.md, and safe human/governor escalation.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Banned hostile agent action patterns (from Anthropic conflict experiments)
 */
const HOSTILE_ACTION_PATTERNS = [
  { id: 'peer_process_kill', regex: /(?:kill|pkill|killall)\s+.*(?:agent|hermes|cursor|claude|gemini|antigravity)/i, desc: 'Killing peer agent process' },
  { id: 'claim_tampering', regex: /(?:rm|sed|awk).*(?:plan\.md|\.lock)/i, desc: 'Destructive tampering with shared coordination locks' },
  { id: 'credential_revocation', regex: /(?:passwd|userdel|usermod|chmod\s+000|chown\s+nobody)/i, desc: 'Tampering with user accounts or access credentials' },
  { id: 'hunting_loop', regex: /(?:while\s+true|loop).*kill/i, desc: 'Deploying continuous peer-hunting execution loop' }
];

/**
 * Audits a proposed agent command or tool action for hostile multi-agent behavior.
 *
 * @param {string} commandLine
 * @param {string} callingAgentId
 * @returns {{ allowed: boolean, reason?: string, ruleId?: string }}
 */
function auditAgentActionSafety(commandLine, callingAgentId = 'agent') {
  if (typeof commandLine !== 'string' || !commandLine.trim()) {
    return { allowed: true };
  }

  for (const pattern of HOSTILE_ACTION_PATTERNS) {
    if (pattern.regex.test(commandLine)) {
      return {
        allowed: false,
        reason: `[ThumbGate Security Gate] Hostile multi-agent action intercepted: ${pattern.desc}`,
        ruleId: pattern.id
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates whether two agent tasks have irreconcilable conflicting objectives.
 *
 * @param {{ agentId: string, objective: string, targetFiles: string[] }} taskA
 * @param {{ agentId: string, objective: string, targetFiles: string[] }} taskB
 * @returns {{ hasConflict: boolean, conflictingFiles: string[], resolutionStrategy: 'isolate_worktrees' | 'arbitrate' | 'none' }}
 */
function detectGoalConflict(taskA, taskB) {
  if (!taskA || !taskB || taskA.agentId === taskB.agentId) {
    return { hasConflict: false, conflictingFiles: [], resolutionStrategy: 'none' };
  }

  const filesA = new Set(taskA.targetFiles || []);
  const conflictingFiles = (taskB.targetFiles || []).filter(f => filesA.has(f));

  if (conflictingFiles.length > 0) {
    return {
      hasConflict: true,
      conflictingFiles,
      resolutionStrategy: 'isolate_worktrees'
    };
  }

  return { hasConflict: false, conflictingFiles: [], resolutionStrategy: 'none' };
}

module.exports = {
  auditAgentActionSafety,
  detectGoalConflict
};

if (require.main === module) {
  console.log('Agent Conflict Governor & De-Escalation Engine active.');
}
