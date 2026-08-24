#!/usr/bin/env node
'use strict';

/**
 * activity-trigger.js — Pattern-triggered agent automation.
 *
 * Stolen from Screenpipe's "connections · use from any scheduled task" and
 * "Can screenpipe turn repeated work into follow-ups or SOPs?":
 *
 * Instead of manually running an agent for recurring events (PR merged, test
 * failed, meeting ended, daily standup), this tool watches the activity timeline
 * for patterns and auto-triggers agent workflows.
 *
 * Triggers are defined as JSON rules:
 *   {
 *     "name": "pr_merged_summary",
 *     "watch": "git_commit",
 *     "match": "merge|pr",
 *     "action": "node tools/hermes-screenpipe-activity.js recall merged --since 24h",
 *     "when": "daily"
 *   }
 *
 * Usage:
 *   node tools/activity-trigger.js register --rule '{"name":"...","watch":"...","match":"...","action":"..."}'
 *   node tools/activity-trigger.js watch     # poll activity timeline for matching events
 *   node tools/activity-trigger.js list      # list all registered triggers
 *   node tools/activity-trigger.js fire     --trigger-id <id>  # manual fire
 *
 * Integrates with:
 *   - tools/hermes-screenpipe-activity.js (activity timeline source)
 *   - tools/agent-action-trace.js (trace the triggered agent run)
 *   - tools/agent-knowledge-handoff.js (capture the result for next agent)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const TRIGGERS_FILE = path.join(STORAGE_DIR, 'activity-triggers.json');
const FIRED_LOG = path.join(STORAGE_DIR, 'activity-triggers-fired.jsonl');
let HISTORY_FILE = path.join(os.homedir(), '.hermes', 'computer_history.json');
const REPO = path.resolve(__dirname, '..');

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readTriggers(opts = {}) {
  const file = opts.triggersFile || TRIGGERS_FILE;
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeTriggers(triggers, opts = {}) {
  const file = opts.triggersFile || TRIGGERS_FILE;
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(triggers, null, 2));
}

function recordFired(entry, opts = {}) {
  const file = opts.firedLog || FIRED_LOG;
  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(entry, null, 0) + '\n');
}

// Allow runtime override of history file path (for tests)
function setHistoryFile(p) { HISTORY_FILE = p; }

function loadHistoryEvents(opts = {}) {
  const file = opts.historyFile || HISTORY_FILE;
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function matchEvent(rule, event) {
  const watch = String(rule.watch || '').toLowerCase();
  const match = String(rule.match || '');
  const haystack = `${String(event.type || '').toLowerCase()} ${String(event.detail || '')}`.toLowerCase();

  // Watch filters the event type
  const watchOk = !watch || watch === '*' || haystack.includes(watch) || (event.type || '').toLowerCase().includes(watch);
  if (!watchOk) return false;

  // Match is a regex/keyword against event content
  if (!match) return true;
  try {
    const re = new RegExp(match, 'i');
    return re.test(haystack);
  } catch {
    return haystack.includes(match.toLowerCase());
  }
}

function findRecentMatches(rule, sinceMs, opts = {}) {
  const events = loadHistoryEvents(opts);
  const cutoff = Date.now() - sinceMs;
  return events.filter((e) => {
    const ts = Date.parse(e.timestamp || e.ts || '') || 0;
    return ts >= cutoff && matchEvent(rule, e);
  });
}

function readFiredLog(opts = {}) {
  const file = opts.firedLog || FIRED_LOG;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function register(args) {
  const ruleStr = args.rule || args.json;
  if (!ruleStr) {
    console.error('register requires --rule JSON or --json JSON');
    process.exit(1);
  }
  let rule;
  try {
    rule = JSON.parse(ruleStr);
  } catch (e) {
    console.error('Invalid JSON rule:', e.message);
    process.exit(1);
  }
  if (!rule.name || !rule.action) {
    console.error('Rule must have "name" and "action" fields');
    process.exit(1);
  }
  rule.watch = rule.watch || '*';
  rule.match = rule.match || '*';
  rule.enabled = rule.enabled !== false;
  rule.registeredAt = new Date().toISOString();
  rule.lastFired = null;
  rule.fireCount = 0;

  const opts = { triggersFile: args.triggersFile, firedLog: args.firedLog };
  const triggers = readTriggers(opts);
  triggers.push(rule);
  writeTriggers(triggers, opts);

  if (args.json) console.log(JSON.stringify(rule, null, 2));
  else console.log(`Registered trigger: ${rule.name} (watch: ${rule.watch}, match: ${rule.match})`);
  return rule;
}

function fire(rule, event = null, opts = {}) {
  const triggerId = `trig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const firedOpts = { firedLog: opts.firedLog, triggersFile: opts.triggersFile };

  const record = {
    triggerId,
    ruleName: rule.name,
    firedAt: new Date().toISOString(),
    event: event || null,
    action: rule.action,
    status: 'pending',
  };

  try {
    const out = execSync(rule.action, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: rule.timeoutMs || 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    record.status = 'completed';
    record.output = out.trim().slice(0, 1000);
  } catch (e) {
    record.status = 'failed';
    record.error = (e.stderr || e.stdout || e.message || '').slice(0, 1000);
  }

  recordFired(record, firedOpts);

  const triggers = readTriggers({ triggersFile: opts.triggersFile });
  const idx = triggers.findIndex((t) => t.name === rule.name);
  if (idx >= 0) {
    triggers[idx].lastFired = record.firedAt;
    triggers[idx].fireCount = (triggers[idx].fireCount || 0) + 1;
    writeTriggers(triggers, { triggersFile: opts.triggersFile });
  }

  return record;
}

function fireManual(args) {
  const triggers = readTriggers();
  const rule = triggers.find((t) => t.name === args.triggerId || t.id === args.triggerId);
  if (!rule) {
    console.error(`Trigger not found: ${args.triggerId}`);
    process.exit(1);
  }
  if (!rule.enabled) {
    console.error(`Trigger ${rule.name} is disabled`);
    process.exit(1);
  }
  const record = fire(rule);
  if (args.json) console.log(JSON.stringify(record, null, 2));
  else console.log(`Fired: ${rule.name} → ${record.status}`);
  return record;
}

function watch(args) {
  const opts = { historyFile: args.historyFile, triggersFile: args.triggersFile, firedLog: args.firedLog };
  const triggers = readTriggers(opts).filter((t) => t.enabled);
  if (triggers.length === 0) {
    if (args.json) console.log(JSON.stringify({ ok: true, triggers: 0, matches: [] }, null, 2));
    else console.log('No active triggers registered. Use: register --rule ...');
    return { ok: true, triggers: 0, matches: [] };
  }

  const sinceMs = (args.since || 3600) * 1000;
  const allMatches = [];

  for (const rule of triggers) {
    const matches = findRecentMatches(rule, sinceMs, opts);
    for (const event of matches) {
      const firedLog = readFiredLog(opts);
      const alreadyFired = firedLog.some(
        (f) => f.ruleName === rule.name &&
        f.event && JSON.stringify(f.event) === JSON.stringify(event) &&
        Date.now() - Date.parse(f.firedAt) < 300000,
      );
      if (alreadyFired) continue;

      const record = fire(rule, event, opts);
      allMatches.push({
        rule: rule.name,
        event: { type: event.type, detail: String(event.detail || '').slice(0, 120) },
        fired: record.triggerId,
        status: record.status,
      });
    }
  }

  if (args.json) console.log(JSON.stringify({ ok: true, triggers: triggers.length, matches: allMatches }, null, 2));
  else {
    console.log(`Watched ${triggers.length} triggers, ${allMatches.length} fired:`);
    for (const m of allMatches) {
      console.log(`  ${m.rule} → ${m.event.type}: ${m.event.detail} → ${m.status}`);
    }
    if (allMatches.length === 0) console.log('  (no new matches)');
  }
  return { ok: true, triggers: triggers.length, matches: allMatches };
}

function readFiredLog() {
  if (!fs.existsSync(FIRED_LOG)) return [];
  return fs.readFileSync(FIRED_LOG, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function list(args) {
  const triggers = readTriggers();
  if (args.json) console.log(JSON.stringify(triggers, null, 2));
  else {
    console.log(`Activity triggers (${triggers.length}):`);
    for (const t of triggers) {
      console.log(`  ${t.enabled ? '✓' : '✗'} ${t.name} | watch:${t.watch} match:${t.match} action:${t.action?.slice(0, 60)} fires:${t.fireCount || 0}`);
    }
  }
  return triggers;
}

function parseArgs(argv) {
  const out = { cmd: 'list', json: false, rule: null, triggerId: null, since: 3600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--rule') out.rule = argv[++i];
    else if (a === '--trigger-id') out.triggerId = argv[++i];
    else if (a === '--since') out.since = parseInt(argv[++i], 10);
    else if (!a.startsWith('-') && !out.cmd) out.cmd = a;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`activity-trigger — pattern-triggered agent automation

Stolen from Screenpipe: "connections · use from any scheduled task" and
"Can screenpipe turn repeated work into follow-ups or SOPs?"

Usage:
  node tools/activity-trigger.js register --rule '{"name":"...","watch":"git_commit","match":"merge","action":"..."}'
  node tools/activity-trigger.js watch [--since 3600] [--json]
  node tools/activity-trigger.js list [--json]
  node tools/activity-trigger.js fire --trigger-id <name or id> [--json]
`);
    return;
  }

  const args = parseArgs(argv);
  switch (args.cmd) {
    case 'register':
      register(args);
      break;
    case 'watch':
      watch(args);
      break;
    case 'list':
      list(args);
      break;
    case 'fire':
      if (!args.triggerId) {
        console.error('fire requires --trigger-id <name>');
        process.exit(1);
      }
      fireManual(args);
      break;
    default:
      console.error(`Unknown command: ${args.cmd}`);
      process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  register,
  fire,
  watch,
  list,
  matchEvent,
  findRecentMatches,
  readTriggers,
  readFiredLog,
  loadHistoryEvents,
  setHistoryFile,
  STORAGE_DIR,
  TRIGGERS_FILE,
  FIRED_LOG,
  HISTORY_FILE,
};
