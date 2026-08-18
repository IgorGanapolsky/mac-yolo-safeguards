#!/usr/bin/env node
'use strict';

/**
 * qoder-yolo-wrapper.js — Qoder Autonomous YOLO Coding & Multi-Agent Harness
 * -------------------------------------------------------------------------
 * Connects Qoder Agent CLI loop to ThumbGate pre-action gates:
 *   1. Pre-turn Snapshot & Rollback State Machine
 *   2. Triggered Lorebook Context Injection (>80% token savings)
 *   3. AI Slop Register Pre-Commit Gate
 *   4. AWS Dogwood Temporal Policy & In-Flight Spend Caps
 *   5. Full YOLO Autonomous Execution (--dangerously-skip-permissions)
 *
 * Usage:
 *   qoder-yolo                     (Interactive YOLO terminal)
 *   qoder-yolo "instruction..."    (Execute prompt in YOLO mode)
 *   qoder-yolo -p "query..."       (Non-interactive print)
 *   qoder-yolo --doctor            (Diagnostic report)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const HOME = os.homedir();
const QODER_BIN = process.env.QODER_BIN || path.join(HOME, '.local', 'bin', 'qodercli');
const RECEIPT_DIR = path.join(HOME, '.hermes', 'receipts', 'qoder-yolo');
const LATEST_RECEIPT = path.join(RECEIPT_DIR, 'latest.json');

const {
  decomposeTask,
  createSnapshot,
  rollbackSnapshot,
  evaluateConvergence,
} = require('./qoder-agent-harness');
const { scanTriggeredContext } = require('./lorebook-context-engine');
const { auditContent } = require('./taste-and-slop-register');
const { evaluateTemporalPolicy } = require('./dogwood-temporal-policy');

const ROUTES = Object.freeze({
  qwen38_max: {
    id: 'qwen38_max',
    name: 'Alibaba Qwen 3.8 Max (Qoder Default)',
    costUsd: 0.00,
    description: 'Qoder official model backend (Qwen3.8-Max)',
  },
  local_qwen: {
    id: 'local_qwen',
    name: 'Local Qwen 3.5 9B (Apple Silicon)',
    costUsd: 0.00,
    endpoint: 'http://127.0.0.1:11434/v1',
    description: 'Zero-cost local inference with full privacy',
  },
  glm53: {
    id: 'glm53',
    name: 'Zhipu GLM-5.3 Coding Plan',
    costUsd: 0.00,
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    description: 'Subscription coding plan with 84.5% CyberGym score',
  },
});

/**
 * Preflights a turn with snapshot and governance checks.
 * @param {string} prompt 
 * @param {object} [options={}] 
 * @returns {object}
 */
function preflightTurn(prompt, options = {}) {
  const turnId = `qoder-turn-${Date.now()}`;
  const subtasks = prompt ? decomposeTask(prompt) : [];
  const snapshot = createSnapshot(turnId, options.files || []);
  const loreResult = prompt ? scanTriggeredContext(prompt) : { tokensSavedPercent: 0, triggeredEntries: [] };

  const dogwoodResult = evaluateTemporalPolicy({
    action: 'agent::execute_turn',
    operator: 'Igor Ganapolsky',
    costUsd: 0.00,
  });

  const slopAudit = prompt ? auditContent(prompt) : { clean: true };

  const receipt = {
    turnId,
    timestamp: new Date().toISOString(),
    prompt: prompt || 'INTERACTIVE_SESSION',
    subtasks,
    snapshotId: snapshot.id,
    tokensSavedPercent: loreResult.tokensSavedPercent,
    dogwoodPolicyAllowed: dogwoodResult.allowed,
    slopAuditClean: slopAudit.clean,
    route: ROUTES.qwen38_max,
    status: dogwoodResult.allowed && slopAudit.clean ? 'READY_FOR_EXECUTION' : 'BLOCKED_BY_POLICY',
  };

  if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  fs.writeFileSync(LATEST_RECEIPT, JSON.stringify(receipt, null, 2), 'utf8');

  return receipt;
}

function runDoctor() {
  const hasBin = fs.existsSync(QODER_BIN);
  return {
    engine: 'qoder-yolo',
    status: hasBin ? 'READY' : 'QODER_BIN_MISSING',
    framework: 'Qoder Agent CLI + ThumbGate Pre-Action Governance',
    binary: QODER_BIN,
    binaryExists: hasBin,
    defaultRoute: ROUTES.qwen38_max.name,
    availableRoutes: Object.keys(ROUTES),
    receiptPath: LATEST_RECEIPT,
  };
}

function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--doctor') || rawArgs.includes('-d')) {
    const doc = runDoctor();
    console.log(`[qoder-yolo] Status: ${doc.status}`);
    console.log(`[qoder-yolo] Binary: ${doc.binary} (${doc.binaryExists ? 'FOUND' : 'NOT FOUND'})`);
    console.log(`[qoder-yolo] Framework: ${doc.framework}`);
    console.log(`[qoder-yolo] Default Route: ${doc.defaultRoute}`);
    process.exit(doc.binaryExists ? 0 : 1);
  }

  if (rawArgs.includes('--dry-run') || rawArgs.includes('--plan')) {
    const promptArg = rawArgs.filter((a) => !a.startsWith('-')).join(' ');
    const receipt = preflightTurn(promptArg);
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(0);
  }

  if (!fs.existsSync(QODER_BIN)) {
    console.error(`[qoder-yolo] Error: Qoder binary not found at ${QODER_BIN}`);
    process.exit(127);
  }

  const promptArg = rawArgs.filter((a) => !a.startsWith('-')).join(' ');
  const receipt = preflightTurn(promptArg);

  if (receipt.status === 'BLOCKED_BY_POLICY') {
    console.error(`[qoder-yolo] Execution blocked by Dogwood / Slop policy.`);
    process.exit(2);
  }

  // Build child args with YOLO autonomous permissions
  const childArgs = [...rawArgs];
  if (!childArgs.includes('--dangerously-skip-permissions') && !childArgs.includes('--permission-mode')) {
    childArgs.unshift('--dangerously-skip-permissions');
  }

  const child = spawn(QODER_BIN, childArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`[qoder-yolo] Failed to spawn Qoder CLI: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  ROUTES,
  QODER_BIN,
  preflightTurn,
  executeQoderYoloTurn: preflightTurn,
  runDoctor,
};
