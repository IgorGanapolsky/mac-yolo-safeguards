#!/usr/bin/env node
'use strict';

/**
 * hermes-agent-identity-analytics.js — Identity-aware agent baselines (CF free steal)
 *
 * Source: https://blog.cloudflare.com/identity-aware-ai-gateway/ (Agents Week)
 * "User Insights turns traffic into a behavioral baseline for every person and
 * agent, and flags insider risk the moment it appears."
 *
 * Local only: baselines from WriteGuard + AAM activity logs — no CF AI Gateway spend.
 *
 * Usage:
 *   node tools/hermes-agent-identity-analytics.js --ingest --json
 *   node tools/hermes-agent-identity-analytics.js --baseline --agent grok --json
 *   node tools/hermes-agent-identity-analytics.js --demo --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const AAM_LOG =
  process.env.HERMES_AAM_STATE_DIR
    ? path.join(process.env.HERMES_AAM_STATE_DIR, 'activity.jsonl')
    : path.join(HOME, '.hermes', 'aam', 'activity.jsonl');
const WG_LOG =
  process.env.HERMES_WRITEGUARD_AUDIT ||
  path.join(HOME, '.hermes', 'writeguard-audit.jsonl');

function readJsonl(filePath, limit = 2000) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Build per-agent and per-principal baselines from local audit streams.
 */
function buildBaselines(options = {}) {
  const aam = readJsonl(options.aamLog || AAM_LOG, options.limit);
  const wg = readJsonl(options.wgLog || WG_LOG, options.limit);

  const byAgent = {};
  const byPrincipal = {};

  const touch = (map, key) => {
    if (!map[key]) {
      map[key] = {
        id: key,
        events: 0,
        allows: 0,
        denials: 0,
        blocked: 0,
        criticalAttempts: 0,
        writes: 0,
        tools: {},
      };
    }
    return map[key];
  };

  for (const row of aam) {
    const agent = row.agentId || 'unknown';
    const principal = row.principal || 'unknown';
    const a = touch(byAgent, agent);
    const p = touch(byPrincipal, principal);
    for (const bucket of [a, p]) {
      bucket.events += 1;
      if (row.result === 'allow') bucket.allows += 1;
      if (row.result === 'deny') bucket.denials += 1;
      if (row.tool) bucket.tools[row.tool] = (bucket.tools[row.tool] || 0) + 1;
    }
  }

  for (const row of wg) {
    const agent = row.agentId || 'unknown';
    const principal = row.principal || 'unknown';
    const a = touch(byAgent, agent);
    const p = touch(byPrincipal, principal);
    for (const bucket of [a, p]) {
      bucket.events += 1;
      if (row.outcome === 'allowed') {
        bucket.allows += 1;
        if (row.riskLevel === 'contained_write' || row.riskLevel === 'minimal') {
          bucket.writes += 1;
        }
      }
      if (row.outcome === 'blocked') {
        bucket.blocked += 1;
        bucket.denials += 1;
        if (row.riskLevel === 'critical') bucket.criticalAttempts += 1;
      }
      if (row.tool) bucket.tools[row.tool] = (bucket.tools[row.tool] || 0) + 1;
    }
  }

  return {
    ok: true,
    schema: 'hermes-identity-analytics/v1',
    sources: { aam: AAM_LOG, writeguard: WG_LOG },
    byAgent,
    byPrincipal,
    totals: {
      agents: Object.keys(byAgent).length,
      principals: Object.keys(byPrincipal).length,
      aamEvents: aam.length,
      wgEvents: wg.length,
    },
  };
}

/**
 * Flag rogue / insider-risk-ish behavior vs simple thresholds.
 * CF: machine-speed bursts, critical tools, agent impersonating human volume.
 */
function flagAnomalies(baselines, options = {}) {
  const flags = [];
  const writeBurst = options.writeBurst || 20;
  const criticalMin = options.criticalMin || 1;
  const denialRate = options.denialRate || 0.5;

  for (const [id, b] of Object.entries(baselines.byAgent || {})) {
    if (b.writes >= writeBurst) {
      flags.push({
        severity: 'high',
        kind: 'write_burst',
        agent: id,
        writes: b.writes,
        message: `Agent ${id} performed ${b.writes} writes in window (Joe ticket storm pattern)`,
      });
    }
    if (b.criticalAttempts >= criticalMin) {
      flags.push({
        severity: 'critical',
        kind: 'critical_tool_attempt',
        agent: id,
        criticalAttempts: b.criticalAttempts,
        message: `Agent ${id} attempted critical tools ${b.criticalAttempts}× (merge/deploy/spend)`,
      });
    }
    if (b.events >= 10 && b.denials / b.events >= denialRate) {
      flags.push({
        severity: 'medium',
        kind: 'high_denial_rate',
        agent: id,
        denialShare: Math.round((b.denials / b.events) * 1000) / 1000,
        message: `Agent ${id} denial rate high — possible prompt injection or over-broad task`,
      });
    }
  }

  return {
    ok: true,
    flags,
    alert: flags.some((f) => f.severity === 'critical' || f.severity === 'high'),
  };
}

function runDemo() {
  const { authorizeToolCall, recordAudit } = require('./hermes-mcp-writeguard');
  const tmp = path.join(os.tmpdir(), `wg-demo-${Date.now()}.jsonl`);
  // Simulate Joe's rogue cleanup agent closing tickets (contained writes) + merge attempts
  for (let i = 0; i < 25; i += 1) {
    const d = authorizeToolCall('create_mr_note', {
      agent: 'cleanup-agent',
      principal: 'joe',
      args: { body: `close ticket ${i}` },
    });
    recordAudit(d.audit, tmp);
  }
  for (let i = 0; i < 3; i += 1) {
    const d = authorizeToolCall('merge_mr', {
      agent: 'cleanup-agent',
      principal: 'joe',
    });
    recordAudit(d.audit, tmp);
  }
  // Quiet agent
  const quiet = authorizeToolCall('get_merge_request', {
    agent: 'quiet-agent',
    principal: 'alice',
  });
  recordAudit(quiet.audit, tmp);

  const baselines = buildBaselines({ wgLog: tmp, aamLog: '/nonexistent' });
  const anomalies = flagAnomalies(baselines, { writeBurst: 20, criticalMin: 1 });

  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  return {
    ok: anomalies.flags.length >= 2 && anomalies.alert === true,
    baselines: baselines.byAgent,
    anomalies,
  };
}

function parseArgs(argv) {
  const args = { json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--baseline' || a === '--ingest') args.baseline = true;
    else if (a === '--flag') args.flag = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--agent') args.agent = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-agent-identity-analytics.js --baseline [--json]
  node tools/hermes-agent-identity-analytics.js --demo [--json]`);
    process.exit(0);
  }

  let out;
  if (args.demo) out = runDemo();
  else {
    const baselines = buildBaselines();
    const anomalies = flagAnomalies(baselines);
    out = { ...baselines, anomalies };
    if (args.agent && baselines.byAgent[args.agent]) {
      out.focus = baselines.byAgent[args.agent];
    }
  }

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBaselines,
  flagAnomalies,
  runDemo,
  readJsonl,
  AAM_LOG,
  WG_LOG,
};
