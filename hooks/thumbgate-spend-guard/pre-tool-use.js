#!/usr/bin/env node
'use strict';

/**
 * ThumbGate financial mutation guard.
 *
 * Agent-initiated financial mutations are denied. There is intentionally no
 * environment-variable bypass: a human must complete purchases outside the
 * agent runtime. Read-only pricing, usage, search, and analytics stay usable.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DENY_REASON =
  'ThumbGate blocked an agent-initiated financial mutation. A human must complete purchases, upgrades, checkout, credit buys, or billing changes outside the agent runtime.';

const DIRECT_TOOL_RULES = [
  {
    id: 'purchase_tool',
    re: /(?:^|[_-])(?:domain_|email_account_)?purchase(?:[_-]|$)|buy[_-]credits?/i,
  },
  {
    id: 'checkout_tool',
    re: /checkout.*(?:create|submit|complete)|(?:create|submit|complete).*checkout/i,
  },
  {
    id: 'subscription_mutation_tool',
    re: /subscription.*(?:create|update|change|activate|upgrade|cancel)|(?:create|update|change|activate|upgrade|cancel).*subscription/i,
  },
  {
    id: 'payment_mutation_tool',
    re: /payment[_-]?(?:methods?|intents?).*(?:create|attach|capture|confirm|submit)|(?:create|attach|capture|confirm|submit).*payment[_-]?(?:methods?|intents?)/i,
  },
  {
    id: 'money_movement_tool',
    re: /(?:refunds?|charges?).*(?:create|capture|confirm|submit)|(?:create|capture|confirm|submit).*(?:refunds?|charges?)/i,
  },
  {
    id: 'billing_mutation_tool',
    re: /(?:billing|plan|seat|credits?).*(?:buy|purchase|upgrade|activate|change|update)|(?:buy|purchase|upgrade|activate|change|update).*(?:billing|plan|seat|credits?)/i,
  },
  { id: 'cost_confirmation_tool', re: /confirm[_-]?cost|approve[_-]?(?:spend|purchase|payment)/i },
];

const FINANCIAL_OBJECT =
  /\b(?:annual|monthly|paid)\s+(?:plan|seat)|\b(?:billing|checkout\s+(?:page|session)|charges?|invoice|payment\s*(?:intents?|methods?)|refunds?|subscription|credits?|credit\s*pack|paid\s*tier|pricing\s*tier)\b|\b(?:basic|professional|organization)\s+(?:plan|seat|tier)\b|[$€£]\s*\d/i;
const MUTATION_ACTION =
  /\b(?:buy|purchase|upgrade|subscribe|activate|checkout|pay|charge|confirm|submit|create|attach|change|update|switch|cancel|refund|post|put|patch|delete)\b/i;
const DIRECT_CHECKOUT_PATH =
  /(?:https?:\/\/[^\s"']*|(?:^|[\s"']))\/(?:checkout|purchase|upgrade|subscribe)(?:\/|\?|$)|(?:https?:\/\/[^\s"']*|(?:^|[\s"']))\/?billing\/(?:activate|change|checkout|subscribe|upgrade)(?:\/|\?|$)/i;
const PROTECTED_GUARD_PATH =
  /(?:^|[\s"'])(?:~\/|\$(?:HOME|\{HOME\})["']?\/|\/Users\/[^/\s"']+\/)?\.(?:thumbgate\/bin\/thumbgate-spend-guard\.js|claude\/settings\.json)(?:$|[\s"'])/i;

function flatten(value, depth = 0) {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((item) => flatten(item, depth + 1)).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key} ${flatten(item, depth + 1)}`)
      .join(' ');
  }
  return '';
}

function normalizeForMatching(value) {
  return String(value || '').replace(/[_./:-]+/g, ' ');
}

function evaluateSpend(toolName, toolInput) {
  const name = String(toolName || '');
  const text = flatten(toolInput);

  for (const rule of DIRECT_TOOL_RULES) {
    if (rule.re.test(name)) return { decision: 'deny', ruleId: rule.id, reason: DENY_REASON };
  }

  const combined = `${name} ${text}`;
  const semantic = normalizeForMatching(combined);
  const isReadOnlyTool = /^(?:read|read file)$/i.test(normalizeForMatching(name).trim());
  if (PROTECTED_GUARD_PATH.test(text) && !isReadOnlyTool) {
    return { decision: 'deny', ruleId: 'guard_tampering', reason: DENY_REASON };
  }

  const isInteractiveUi = /(?:browser|chrome|computer[_-]?use|playwright)/i.test(name);
  const hasInteractiveAction =
    /\b(?:click|type|press|tap|fill|select|submit|interact|drag)\b/i.test(semantic);
  if (isInteractiveUi && hasInteractiveAction) {
    return { decision: 'deny', ruleId: 'unverifiable_interactive_ui', reason: DENY_REASON };
  }

  if (MUTATION_ACTION.test(semantic) && FINANCIAL_OBJECT.test(semantic)) {
    return { decision: 'deny', ruleId: 'financial_action_and_object', reason: DENY_REASON };
  }

  const isNavigationOrExecution =
    /(?:browser|chrome|playwright|computer|navigate|open_url|click|bash|shell|terminal|exec)/i.test(name);
  if (isNavigationOrExecution && DIRECT_CHECKOUT_PATH.test(text)) {
    return { decision: 'deny', ruleId: 'checkout_path', reason: DENY_REASON };
  }

  return { decision: 'allow' };
}

function safeToolName(toolName) {
  return String(toolName || 'unknown')
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, 120);
}

function writeDenyReceipt(toolName, ruleId) {
  try {
    const directory =
      process.env.THUMBGATE_SPEND_GUARD_RECEIPT_DIR ||
      path.join(process.env.HOME || os.homedir(), '.thumbgate', 'receipts', 'spend-guard');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.appendFileSync(
      path.join(directory, 'denies.jsonl'),
      `${JSON.stringify({
        at: new Date().toISOString(),
        event: 'financial_mutation_denied',
        ruleId,
        toolName: safeToolName(toolName),
      })}\n`,
      { mode: 0o600 },
    );
  } catch {
    // A receipt failure must never turn a deny into an allow.
  }
}

function output(verdict) {
  const payload =
    verdict.decision === 'deny'
      ? {
          decision: 'deny',
          reason: verdict.reason,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.reason,
          },
        }
      : { decision: 'allow' };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function main() {
  let event;
  try {
    event = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    output({ decision: 'allow' });
    return 0;
  }

  const toolName = event.toolName || event.tool_name || '';
  const toolInput = event.toolInput || event.tool_input || {};
  const verdict = evaluateSpend(toolName, toolInput);
  if (verdict.decision === 'deny') {
    writeDenyReceipt(toolName, verdict.ruleId);
    output(verdict);
    process.stderr.write(`${verdict.reason}\n`);
    return 2;
  }

  output(verdict);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DENY_REASON,
  DIRECT_TOOL_RULES,
  evaluateSpend,
  flatten,
  normalizeForMatching,
  safeToolName,
};
