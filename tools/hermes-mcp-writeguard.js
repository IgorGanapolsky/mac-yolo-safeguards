#!/usr/bin/env node
'use strict';

/**
 * hermes-mcp-writeguard.js — Cloudflare WriteGuard free steal for Hermes MCP tools
 *
 * Source: https://blog.cloudflare.com/mcp-portal-writeguard-private-beta/
 *
 * "We could not depend on every employee to configure every agent perfectly…
 * Before expanding write access… we built WriteGuard."
 *
 * Steal (local, no CF portal beta):
 *   - Risk tiers per tool: read_only | minimal | contained_write | critical
 *   - enabled/disabled (critical defaults disabled)
 *   - Agent attribution label for writes
 *   - Scrubbed async audit log
 *   - Block before handler runs
 *
 * Usage:
 *   node tools/hermes-mcp-writeguard.js --check --tool merge_mr --agent grok --json
 *   node tools/hermes-mcp-writeguard.js --matrix --json
 *   node tools/hermes-mcp-writeguard.js --demo --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = os.homedir();
const DEFAULT_AUDIT =
  process.env.HERMES_WRITEGUARD_AUDIT ||
  path.join(HOME, '.hermes', 'writeguard-audit.jsonl');

const RiskLevel = Object.freeze({
  READ_ONLY: 'read_only',
  MINIMAL: 'minimal',
  CONTAINED_WRITE: 'contained_write',
  CRITICAL: 'critical',
});

/**
 * Catalog of tools relevant to hermes-yolo / ThumbGate / Hermes Mobile.
 * Mirrors CF risk model; CRITICAL tools default enabled:false.
 */
const TOOL_CATALOG = Object.freeze({
  // Read
  get_merge_request: { riskLevel: RiskLevel.READ_ONLY, enabled: true, server: 'github' },
  fleet_status: { riskLevel: RiskLevel.READ_ONLY, enabled: true, server: 'hermes' },
  thumbgate_rules: { riskLevel: RiskLevel.READ_ONLY, enabled: true, server: 'thumbgate' },
  gateway_health: { riskLevel: RiskLevel.READ_ONLY, enabled: true, server: 'hermes-mobile' },
  pair_status: { riskLevel: RiskLevel.READ_ONLY, enabled: true, server: 'hermes-mobile' },
  // Minimal
  add_reaction: { riskLevel: RiskLevel.MINIMAL, enabled: true, server: 'github' },
  // Contained write
  create_mr_note: {
    riskLevel: RiskLevel.CONTAINED_WRITE,
    enabled: true,
    server: 'github',
    labeling: { field: 'body', formats: ['plain_text', 'markdown'] },
  },
  pair_mint: {
    riskLevel: RiskLevel.CONTAINED_WRITE,
    enabled: true,
    server: 'hermes-mobile',
    labeling: { field: 'note', formats: ['plain_text'] },
  },
  content_draft: {
    riskLevel: RiskLevel.CONTAINED_WRITE,
    enabled: true,
    server: 'content',
    labeling: { field: 'body', formats: ['markdown'] },
  },
  git_commit: {
    riskLevel: RiskLevel.CONTAINED_WRITE,
    enabled: true,
    server: 'git',
    labeling: { field: 'message', formats: ['plain_text'] },
  },
  // Critical — default disabled (human-in-loop)
  merge_mr: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'github' },
  production_deploy: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'deploy' },
  bulk_delete: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'data' },
  social_publish: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'social' },
  spend_authorize: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'finance', hardDeny: true },
  force_push: { riskLevel: RiskLevel.CRITICAL, enabled: false, server: 'git' },
});

function ensureAuditDir(filePath = DEFAULT_AUDIT) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

function scrubArgs(args) {
  if (!args || typeof args !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (/secret|password|token|api[_-]?key|authorization/i.test(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function agentAttribution(agentId, principal) {
  const a = String(agentId || 'agent').slice(0, 48);
  const p = String(principal || 'user').slice(0, 48);
  return `\n\n— via agent \`${a}\` on behalf of ${p}`;
}

/**
 * Authorize a tool call. Blocks before handler when disabled/critical/hardDeny.
 * @returns {{ allowed, outcome, riskLevel, attribution?, audit }}
 */
function authorizeToolCall(toolName, options = {}) {
  const name = String(toolName || '').trim();
  const agentId = options.agentId || options.agent || 'hermes-yolo';
  const principal = options.principal || options.user || 'igor';
  const sessionId = options.sessionId || `sess_${crypto.randomBytes(4).toString('hex')}`;
  const args = options.args || {};
  const overrides = options.catalog || {};
  const catalog = { ...TOOL_CATALOG, ...overrides };
  const conf = catalog[name];

  const baseAudit = {
    schema: 'hermes-writeguard/v1',
    at: new Date().toISOString(),
    tool: name,
    agentId,
    principal,
    sessionId,
    server: conf?.server || 'unknown',
    args: scrubArgs(args),
  };

  if (!conf) {
    const audit = {
      ...baseAudit,
      outcome: 'blocked',
      reason: 'unknown_tool',
      riskLevel: RiskLevel.CRITICAL,
    };
    return { allowed: false, outcome: 'blocked', reason: 'unknown_tool', riskLevel: RiskLevel.CRITICAL, audit };
  }

  if (conf.hardDeny) {
    const audit = {
      ...baseAudit,
      outcome: 'blocked',
      reason: 'hard_deny_never_spend',
      riskLevel: conf.riskLevel,
    };
    return {
      allowed: false,
      outcome: 'blocked',
      reason: 'hard_deny_never_spend',
      riskLevel: conf.riskLevel,
      audit,
    };
  }

  if (conf.enabled === false) {
    const audit = {
      ...baseAudit,
      outcome: 'blocked',
      reason: 'tool_disabled',
      riskLevel: conf.riskLevel,
      message: `${name} is ${conf.riskLevel} and disabled — human must enable or perform manually`,
    };
    return {
      allowed: false,
      outcome: 'blocked',
      reason: 'tool_disabled',
      riskLevel: conf.riskLevel,
      audit,
    };
  }

  // Contained writes get attribution enrichment (CF: keep the person, add the agent)
  let attribution = null;
  let enrichedArgs = { ...args };
  if (
    conf.riskLevel === RiskLevel.CONTAINED_WRITE ||
    conf.riskLevel === RiskLevel.MINIMAL
  ) {
    attribution = agentAttribution(agentId, principal);
    if (conf.labeling && conf.labeling.field) {
      const field = conf.labeling.field;
      const prev = String(enrichedArgs[field] || '');
      if (!prev.includes('via agent')) {
        enrichedArgs[field] = prev + attribution;
      }
    }
  }

  const audit = {
    ...baseAudit,
    outcome: 'allowed',
    reason: 'ok',
    riskLevel: conf.riskLevel,
    labeled: Boolean(attribution),
  };

  return {
    allowed: true,
    outcome: 'allowed',
    riskLevel: conf.riskLevel,
    attribution,
    args: enrichedArgs,
    audit,
  };
}

function recordAudit(audit, filePath = DEFAULT_AUDIT) {
  ensureAuditDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(audit)}\n`, 'utf8');
  return { ok: true, path: filePath };
}

/**
 * Guard + invoke pattern: authorize, optionally record, call handler only if allowed.
 */
function guardedInvoke(toolName, handler, options = {}) {
  const decision = authorizeToolCall(toolName, options);
  if (options.record !== false) {
    recordAudit(decision.audit, options.auditPath);
  }
  if (!decision.allowed) {
    return { ok: false, blocked: true, decision };
  }
  let result;
  try {
    result = typeof handler === 'function' ? handler(decision.args || options.args || {}) : null;
  } catch (err) {
    const failAudit = {
      ...decision.audit,
      outcome: 'failed',
      reason: err.message,
    };
    if (options.record !== false) recordAudit(failAudit, options.auditPath);
    return { ok: false, blocked: false, error: err.message, decision };
  }
  return { ok: true, blocked: false, result, decision };
}

function riskMatrix() {
  const byRisk = {};
  for (const [name, conf] of Object.entries(TOOL_CATALOG)) {
    const r = conf.riskLevel;
    if (!byRisk[r]) byRisk[r] = [];
    byRisk[r].push({
      tool: name,
      enabled: conf.enabled !== false,
      hardDeny: Boolean(conf.hardDeny),
      server: conf.server,
    });
  }
  return { ok: true, RiskLevel, byRisk, tools: TOOL_CATALOG };
}

function runDemo() {
  const steps = [];
  // Read passes
  const read = authorizeToolCall('get_merge_request', { agent: 'reviewer', principal: 'joe' });
  steps.push({ tool: 'get_merge_request', allowed: read.allowed, risk: read.riskLevel });

  // Contained write + label
  const note = authorizeToolCall('create_mr_note', {
    agent: 'reviewer',
    principal: 'joe',
    args: { body: 'LGTM with nits' },
  });
  steps.push({
    tool: 'create_mr_note',
    allowed: note.allowed,
    labeled: Boolean(note.attribution),
    bodyHasAgent: String(note.args?.body || '').includes('via agent'),
  });

  // Critical merge blocked
  const merge = authorizeToolCall('merge_mr', { agent: 'reviewer', principal: 'joe' });
  steps.push({
    tool: 'merge_mr',
    allowed: merge.allowed,
    reason: merge.reason,
  });

  // Never-spend
  const spend = authorizeToolCall('spend_authorize', { agent: 'rogue', principal: 'joe' });
  steps.push({
    tool: 'spend_authorize',
    allowed: spend.allowed,
    reason: spend.reason,
  });

  // Joe's agent closing tickets at machine speed → attribution still names agent
  const ok =
    read.allowed &&
    note.allowed &&
    note.args.body.includes('via agent') &&
    !merge.allowed &&
    !spend.allowed;

  return { ok, steps };
}

function parseArgs(argv) {
  const args = { json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--matrix') args.matrix = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--tool') args.tool = argv[++i];
    else if (a === '--agent') args.agent = argv[++i];
    else if (a === '--principal') args.principal = argv[++i];
    else if (a === '--record') args.record = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-mcp-writeguard.js --matrix [--json]
  node tools/hermes-mcp-writeguard.js --check --tool merge_mr --agent grok [--json]
  node tools/hermes-mcp-writeguard.js --demo [--json]`);
    process.exit(0);
  }

  let out;
  if (args.matrix) out = riskMatrix();
  else if (args.demo) out = runDemo();
  else if (args.check) {
    out = authorizeToolCall(args.tool, {
      agent: args.agent,
      principal: args.principal,
    });
    if (args.record) recordAudit(out.audit);
  } else {
    out = riskMatrix();
  }

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  const fail = out && (out.ok === false || (args.check && out.allowed === false));
  process.exit(fail ? 2 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  RiskLevel,
  TOOL_CATALOG,
  DEFAULT_AUDIT,
  authorizeToolCall,
  recordAudit,
  guardedInvoke,
  riskMatrix,
  runDemo,
  agentAttribution,
  scrubArgs,
};
