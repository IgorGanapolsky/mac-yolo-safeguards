#!/usr/bin/env node
'use strict';

/**
 * unified-alert-manager.js
 *
 * Implements OpenSearch PPL (Piped Processing Language) style cross-signal alerting
 * for the multi-agent fleet.
 *
 * Replaces per-tool alert sprawl and notification fatigue with:
 *  1. PPL Pipeline processing: source | where ... | stats ... | eval ... | where ...
 *  2. Alert deduplication & suppression windows (cool-downs)
 *  3. Centralized alert state ledger (coordination/alerts/alert-state.json)
 *  4. High-signal routing (P0 critical vs P1 warning vs P2 info)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ALERT_STATE_DIR = path.join(ROOT, 'coordination', 'alerts');
const ALERT_STATE_FILE = path.join(ALERT_STATE_DIR, 'alert-state.json');

// Ensure coordination/alerts directory exists
function ensureDir() {
  if (!fs.existsSync(ALERT_STATE_DIR)) {
    fs.mkdirSync(ALERT_STATE_DIR, { recursive: true });
  }
}

/**
 * Executes a PPL-style query against an array of telemetry events.
 * Supported pipeline commands:
 *  - where: filter events by predicate
 *  - stats: group by field and compute count(), sum(), avg()
 *  - eval: compute new fields
 *  - sort: order by field
 *  - limit: take top N
 */
function executePPL(events, pipeline) {
  let data = [...events];

  for (const stage of pipeline) {
    const type = stage.op.toLowerCase();

    if (type === 'where') {
      data = data.filter(stage.fn);
    } else if (type === 'eval') {
      data = data.map(item => ({ ...item, ...stage.fn(item) }));
    } else if (type === 'stats') {
      const byField = stage.by;
      const groups = {};
      for (const item of data) {
        const key = item[byField] || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
      data = Object.keys(groups).map(key => {
        const groupItems = groups[key];
        const res = { [byField]: key, count: groupItems.length };
        if (stage.metrics) {
          for (const [metricName, metricFn] of Object.entries(stage.metrics)) {
            res[metricName] = metricFn(groupItems);
          }
        }
        return res;
      });
    } else if (type === 'sort') {
      const field = stage.field;
      const desc = stage.order === 'desc';
      data.sort((a, b) => {
        if (a[field] < b[field]) return desc ? 1 : -1;
        if (a[field] > b[field]) return desc ? -1 : 1;
        return 0;
      });
    } else if (type === 'limit') {
      data = data.slice(0, stage.count);
    }
  }

  return data;
}

/**
 * Evaluates fleet alert rules against incoming telemetry events.
 */
function evaluateAlertRules(events, rules, state = {}) {
  const now = Date.now();
  const alerts = [];
  const updatedState = { ...state };

  for (const rule of rules) {
    const triggered = executePPL(events, rule.pipeline);

    for (const match of triggered) {
      const alertKey = `${rule.id}:${match[rule.groupBy || 'service'] || 'global'}`;
      const lastFired = updatedState[alertKey] ? updatedState[alertKey].lastFired : 0;
      const cooldownMs = (rule.cooldownMinutes || 15) * 60 * 1000;

      const isSuppressed = now - lastFired < cooldownMs;

      if (!isSuppressed) {
        const alert = {
          id: alertKey,
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity || 'P1',
          target: match[rule.groupBy || 'service'] || 'global',
          matchData: match,
          triggeredAt: new Date(now).toISOString(),
          cooldownMinutes: rule.cooldownMinutes || 15,
        };
        alerts.push(alert);
        updatedState[alertKey] = {
          lastFired: now,
          fireCount: (updatedState[alertKey]?.fireCount || 0) + 1,
          lastAlert: alert,
        };
      }
    }
  }

  return { alerts, state: updatedState };
}

/**
 * Standard fleet alert rules.
 */
function getStandardFleetRules() {
  return [
    {
      id: 'rule_service_crash_storm',
      name: 'LaunchAgent Repeated Crash Storm',
      severity: 'P0',
      groupBy: 'service',
      cooldownMinutes: 15,
      pipeline: [
        { op: 'where', fn: e => e.exitCode !== 0 && e.type === 'launchagent' },
        { op: 'stats', by: 'service' },
        { op: 'where', fn: g => g.count >= 3 },
      ],
    },
    {
      id: 'rule_high_latency_stacking',
      name: 'Agent Retrieval Latency Stacking (>5000ms)',
      severity: 'P1',
      groupBy: 'agent',
      cooldownMinutes: 10,
      pipeline: [
        { op: 'where', fn: e => e.type === 'retrieval' && e.latencyMs > 5000 },
        { op: 'stats', by: 'agent', metrics: { maxLatency: items => Math.max(...items.map(i => i.latencyMs)) } },
        { op: 'where', fn: g => g.count >= 2 },
      ],
    },
    {
      id: 'rule_unauthorized_financial_mutation',
      name: 'Pre-Tool Financial Mutation Intercepted',
      severity: 'P0',
      groupBy: 'tool',
      cooldownMinutes: 5,
      pipeline: [
        { op: 'where', fn: e => e.type === 'spend_guard' && e.blocked === true },
        { op: 'stats', by: 'tool' },
        { op: 'where', fn: g => g.count >= 1 },
      ],
    },
  ];
}

function loadAlertState() {
  ensureDir();
  if (fs.existsSync(ALERT_STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ALERT_STATE_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveAlertState(state) {
  ensureDir();
  fs.writeFileSync(ALERT_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function processFleetAlerts(events) {
  const currentState = loadAlertState();
  const rules = getStandardFleetRules();
  const result = evaluateAlertRules(events, rules, currentState);
  saveAlertState(result.state);
  return result;
}

module.exports = {
  executePPL,
  evaluateAlertRules,
  getStandardFleetRules,
  processFleetAlerts,
  loadAlertState,
  saveAlertState,
  ALERT_STATE_FILE,
};

if (require.main === module) {
  const sampleEvents = [
    { type: 'launchagent', service: 'com.igor.smart-ops', exitCode: 1, timestamp: Date.now() },
    { type: 'launchagent', service: 'com.igor.smart-ops', exitCode: 1, timestamp: Date.now() },
    { type: 'launchagent', service: 'com.igor.smart-ops', exitCode: 1, timestamp: Date.now() },
    { type: 'spend_guard', tool: 'stripe_charge', blocked: true, amount: 588, timestamp: Date.now() },
  ];
  const res = processFleetAlerts(sampleEvents);
  console.log('Processed Fleet Alerts:', JSON.stringify(res.alerts, null, 2));
}
