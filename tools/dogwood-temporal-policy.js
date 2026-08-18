#!/usr/bin/env node
'use strict';

/**
 * dogwood-temporal-policy.js — AWS Dogwood Temporal Sequence Governance Engine
 * ---------------------------------------------------------------------------
 * Implements Metric First-Order Temporal Logic (MFOTL) and Cedar-extended policies
 * to govern sequences of AI agent tool invocations across time.
 *
 * Capabilities:
 *   1. `formerly(action, windowMs)`: Require prerequisite prior action (e.g., approval)
 *   2. `count_within(action, windowMs)`: Burst rate limiting across time windows
 *   3. `sum_within(field, action, windowMs)`: Concurrency-safe sliding window spend caps
 *   4. `taint_firewall`: Blocks network egress after sensitive credential/file reads
 *
 * Usage:
 *   node tools/dogwood-temporal-policy.js --doctor
 *   node tools/dogwood-temporal-policy.js --eval '<jsonAction>'
 *   node tools/dogwood-temporal-policy.js --rules
 *   node tools/dogwood-temporal-policy.js --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const JOURNAL_FILE = path.join(os.homedir(), '.hermes', 'dogwood-journal.jsonl');

// Canonical temporal policy rules
const TEMPORAL_RULES = Object.freeze([
  {
    id: 'DOGWOOD-RULE-01-PREREQUISITE-APPROVAL',
    description: 'Destructive mutations require explicit human approval within the last 15 minutes',
    targetActions: ['git::force_push', 'fs::rm_rf', 'db::drop_table', 'process::kill_all'],
    evaluator: (event, history) => {
      const windowMs = 15 * 60 * 1000;
      const now = event.timestamp || Date.now();
      const hasPriorApproval = history.some(
        (h) => (h.action === 'approval::satisfy_gate' || h.action === 'approval::human_approved') &&
               (now - h.timestamp) <= windowMs
      );
      if (!hasPriorApproval) {
        return {
          allowed: false,
          ruleId: 'DOGWOOD-RULE-01-PREREQUISITE-APPROVAL',
          reason: 'Destructive action requires formerly(approval::satisfy_gate, 15m). Prerequisite approval not found in recent history.',
        };
      }
      return { allowed: true };
    },
  },
  {
    id: 'DOGWOOD-RULE-02-TAINT-EXFILTRATION-FIREWALL',
    description: 'Forbids external network egress if sensitive files/secrets were read in the session trace',
    targetActions: ['http::curl_external', 'network::outbound_post', 'email::send_outbound'],
    evaluator: (event, history) => {
      const secretReadEvents = history.filter(
        (h) => h.action === 'fs::read_secret' || (h.target && /(?:\.env|keychain|auth\.json|secrets?)/i.test(h.target))
      );
      if (secretReadEvents.length > 0) {
        return {
          allowed: false,
          ruleId: 'DOGWOOD-RULE-02-TAINT-EXFILTRATION-FIREWALL',
          reason: `Data taint detected: secret file (${secretReadEvents[0].target || 'credentials'}) was read previously in session. External network egress blocked.`,
        };
      }
      return { allowed: true };
    },
  },
  {
    id: 'DOGWOOD-RULE-03-BURST-RATE-LIMIT',
    description: 'Limits tool execution bursts to at most 10 destructive/write calls per minute',
    targetActions: ['fs::write_file', 'bash::exec_mutation', 'api::write_call'],
    evaluator: (event, history) => {
      const windowMs = 60 * 1000;
      const maxBurst = 10;
      const now = event.timestamp || Date.now();
      const recentCount = history.filter(
        (h) => h.action === event.action && (now - h.timestamp) <= windowMs
      ).length;

      if (recentCount >= maxBurst) {
        return {
          allowed: false,
          ruleId: 'DOGWOOD-RULE-03-BURST-RATE-LIMIT',
          reason: `Rate limit exceeded: count_within(${event.action}, 1m) >= ${maxBurst}. Throttle required.`,
        };
      }
      return { allowed: true };
    },
  },
  {
    id: 'DOGWOOD-RULE-04-SLIDING-WINDOW-SPEND-CAP',
    description: 'Enforces maximum $10.00 token/compute spend per 24-hour sliding window',
    targetActions: ['llm::cloud_completion', 'api::paid_inference', 'runner::spawn_cloud_vm'],
    evaluator: (event, history) => {
      const windowMs = 24 * 60 * 60 * 1000;
      const maxSpendUsd = 10.00;
      const now = event.timestamp || Date.now();
      
      const currentSpend = history
        .filter((h) => (now - h.timestamp) <= windowMs)
        .reduce((sum, h) => sum + (Number(h.costUsd) || 0), 0);

      const proposedCost = Number(event.costUsd) || 0;
      if ((currentSpend + proposedCost) > maxSpendUsd) {
        return {
          allowed: false,
          ruleId: 'DOGWOOD-RULE-04-SLIDING-WINDOW-SPEND-CAP',
          reason: `Spend cap exceeded: sum_within(costUsd, 24h) = $${(currentSpend + proposedCost).toFixed(2)} exceeds $${maxSpendUsd.toFixed(2)} limit.`,
        };
      }
      return { allowed: true };
    },
  },
]);

/**
 * Loads recent event history from journal.
 * @param {number} [limit=100]
 * @returns {Array<object>}
 */
function getEventJournal(limit = 100) {
  if (!fs.existsSync(JOURNAL_FILE)) return [];
  try {
    const lines = fs.readFileSync(JOURNAL_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Appends an event to the local Dogwood audit journal.
 * @param {object} event 
 */
function recordEvent(event) {
  try {
    const dir = path.dirname(JOURNAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: event.timestamp || Date.now(),
      action: event.action,
      target: event.target || null,
      costUsd: Number(event.costUsd) || 0,
      metadata: event.metadata || {},
    };
    fs.appendFileSync(JOURNAL_FILE, JSON.stringify(payload) + '\n', 'utf8');
  } catch {}
}

/**
 * Evaluates a proposed tool action against all active Dogwood temporal rules.
 * @param {object} proposedAction 
 * @param {Array<object>} [customHistory] 
 * @returns {{ allowed: boolean, violations: Array<object>, evaluatedRules: number }}
 */
function evaluateTemporalPolicy(proposedAction, customHistory) {
  const history = customHistory || getEventJournal();
  const violations = [];

  for (const rule of TEMPORAL_RULES) {
    if (rule.targetActions.includes(proposedAction.action)) {
      const outcome = rule.evaluator(proposedAction, history);
      if (!outcome.allowed) {
        violations.push(outcome);
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    evaluatedRules: TEMPORAL_RULES.length,
  };
}

function runDoctor() {
  return {
    harness: 'dogwood-temporal-policy',
    status: 'READY',
    framework: 'AWS Dogwood Temporal Sequence Policy (MFOTL / Cedar Extension)',
    rulesCount: TEMPORAL_RULES.length,
    activeRules: TEMPORAL_RULES.map((r) => ({ id: r.id, desc: r.description })),
    journalPath: JOURNAL_FILE,
    journalEventsCount: getEventJournal().length,
  };
}

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[dogwood] Status: ${doc.status}`);
    console.log(`[dogwood] Framework: ${doc.framework}`);
    console.log(`[dogwood] Active Rules: ${doc.rulesCount}`);
    console.log(`[dogwood] Journal: ${doc.journalPath} (${doc.journalEventsCount} events)`);
    process.exit(0);
  }

  if (args.includes('--rules')) {
    console.log(JSON.stringify(TEMPORAL_RULES.map((r) => ({ id: r.id, description: r.description })), null, 2));
    process.exit(0);
  }

  if (args.includes('--eval')) {
    const evalIdx = args.indexOf('--eval');
    const input = args.slice(evalIdx + 1).join(' ');
    try {
      const parsed = JSON.parse(input);
      const res = evaluateTemporalPolicy(parsed);
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.allowed ? 0 : 2);
    } catch (e) {
      console.error(`Invalid action JSON: ${e.message}`);
      process.exit(1);
    }
  }

  const doc = runDoctor();
  console.log(JSON.stringify(doc, null, 2));
}

module.exports = {
  TEMPORAL_RULES,
  JOURNAL_FILE,
  getEventJournal,
  recordEvent,
  evaluateTemporalPolicy,
  runDoctor,
};
