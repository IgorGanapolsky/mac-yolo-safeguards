#!/usr/bin/env node
'use strict';

/**
 * MCP persona entitlements — TrueFoundry MCP/Agent Gateway *mechanics*, not the product.
 *
 * Email 2026-08-24 (Anuraag / TrueFoundry): N×M MCP mess; junior=read-only GitHub,
 * senior=write; step-level cost, not HTTP-level.
 *
 * This is a local catalog + evaluate + workflow-cost doctor for *this* repo's
 * `.mcp.json`. It is not an OAuth gateway, not Okta/Azure AD, not a Virtual MCP
 * server, and not a new ThumbGate SKU (ECI pause).
 *
 *   node tools/mcp-persona-entitlements.js catalog --json
 *   node tools/mcp-persona-entitlements.js evaluate --persona guest --server github --action write
 *   node tools/mcp-persona-entitlements.js workflow --json --persona operator --steps '[{"server":"grepai","action":"read","costUsd":0}]'
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const MCP_PATH = path.join(REPO, '.mcp.json');

const WRITE_RISK_RANK = Object.freeze({
  'read-only': 0,
  'minimal-impact': 1,
  'contained-write': 2,
  critical: 3,
});

/** TrueFoundry junior ≈ guest; operator ≈ hosted Hermes user; admin = Igor. */
const PERSONAS = Object.freeze({
  guest: { maxWriteRisk: 'read-only', paidApis: false },
  junior: { maxWriteRisk: 'read-only', paidApis: false },
  operator: { maxWriteRisk: 'contained-write', paidApis: true },
  admin: { maxWriteRisk: 'critical', paidApis: true },
});

/**
 * Server-level write risk. Tool overrides (github:push, gmail:send) can raise it.
 * Paid APIs are denied for guest/junior even on read (Semrush burns units).
 */
const SERVER_POLICY = Object.freeze({
  github: { writeRisk: 'contained-write', paid: false, scope: 'Issues/PRs/reviews' },
  context7: { writeRisk: 'read-only', paid: false, scope: 'library docs' },
  grepai: { writeRisk: 'read-only', paid: false, scope: 'local semantic search' },
  semrush: { writeRisk: 'read-only', paid: true, scope: 'SEO API units' },
  gurobi: { writeRisk: 'read-only', paid: false, scope: 'local optimizer' },
  gmail: { writeRisk: 'critical', paid: false, scope: 'mailbox send' },
  playwright: { writeRisk: 'contained-write', paid: false, scope: 'browser automation' },
  thumbgate: { writeRisk: 'contained-write', paid: false, scope: 'recall/capture' },
});

const TOOL_OVERRIDES = Object.freeze({
  'github:push': 'critical',
  'gmail:send': 'critical',
  'gmail:draft': 'contained-write',
});

function loadMcpServers(mcpPath = MCP_PATH) {
  if (!fs.existsSync(mcpPath)) return { ok: false, error: '.mcp.json missing', servers: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    return { ok: true, servers: raw.mcpServers || {}, raw };
  } catch (error) {
    return { ok: false, error: error.message, servers: {} };
  }
}

function catalog(opts = {}) {
  const loaded = loadMcpServers(opts.mcpPath);
  if (!loaded.ok) return { ok: false, error: loaded.error, servers: [] };
  const rows = Object.keys(loaded.servers).map((name) => {
    const policy = SERVER_POLICY[name];
    return {
      name,
      registered: Boolean(policy),
      writeRisk: policy ? policy.writeRisk : 'unknown',
      paid: Boolean(policy?.paid),
      scope: policy?.scope || 'unlisted — add SERVER_POLICY before production use',
      locality: loaded.servers[name].url ? 'remote-http' : loaded.servers[name].command ? 'local-stdio' : 'unknown',
    };
  });
  return { ok: true, product: 'not-truefoundry', servers: rows };
}

function resolvePersona(name) {
  const key = String(name || '').trim().toLowerCase();
  return PERSONAS[key] ? { name: key, ...PERSONAS[key] } : null;
}

function effectiveWriteRisk(server, action, tool) {
  const overrideKey = tool ? `${server}:${tool}` : null;
  if (overrideKey && TOOL_OVERRIDES[overrideKey]) return TOOL_OVERRIDES[overrideKey];
  if (String(action || 'read').toLowerCase() === 'read') return 'read-only';
  const policy = SERVER_POLICY[server];
  if (!policy) return 'unknown';
  return policy.writeRisk;
}

function evaluateCall(input = {}) {
  const persona = resolvePersona(input.persona);
  const server = String(input.server || '').trim();
  const action = String(input.action || 'read').trim().toLowerCase();
  const tool = input.tool ? String(input.tool).trim() : null;
  const costUsd = Number(input.costUsd);
  const audit = {
    at: input.now || new Date().toISOString(),
    persona: input.persona || null,
    server: server || null,
    tool,
    action,
    allow: false,
    reason: null,
    writeRisk: null,
    costUsd: Number.isFinite(costUsd) ? costUsd : 0,
  };

  if (!persona) {
    audit.reason = 'unknown_persona';
    return audit;
  }
  if (!server) {
    audit.reason = 'missing_server';
    return audit;
  }
  if (!SERVER_POLICY[server]) {
    audit.writeRisk = 'unknown';
    audit.reason = 'unknown_server';
    return audit;
  }
  if (action !== 'read' && action !== 'write') {
    audit.reason = 'unknown_action';
    return audit;
  }

  const writeRisk = effectiveWriteRisk(server, action, tool);
  audit.writeRisk = writeRisk;
  if (writeRisk === 'unknown' || WRITE_RISK_RANK[writeRisk] == null) {
    audit.reason = 'unknown_write_risk';
    return audit;
  }
  if (SERVER_POLICY[server].paid && !persona.paidApis) {
    audit.reason = 'paid_api_denied';
    return audit;
  }
  if (WRITE_RISK_RANK[writeRisk] > WRITE_RISK_RANK[persona.maxWriteRisk]) {
    audit.reason = 'write_risk_denied';
    return audit;
  }
  audit.allow = true;
  audit.reason = 'ok';
  return audit;
}

function attributeWorkflow(steps, opts = {}) {
  const persona = opts.persona || 'guest';
  const evaluated = (Array.isArray(steps) ? steps : []).map((step) =>
    evaluateCall({ ...step, persona }),
  );
  const allowed = evaluated.filter((s) => s.allow);
  const denied = evaluated.filter((s) => !s.allow);
  const totalUsd = allowed.reduce((sum, s) => sum + (Number(s.costUsd) || 0), 0);
  const byServer = {};
  for (const s of allowed) {
    byServer[s.server] = (byServer[s.server] || 0) + (Number(s.costUsd) || 0);
  }
  return {
    persona,
    stepCount: evaluated.length,
    allowedCount: allowed.length,
    deniedCount: denied.length,
    totalUsd,
    byServer,
    steps: evaluated,
  };
}

function parseArgs(argv) {
  const out = { cmd: argv[0] || 'catalog', json: false, persona: 'guest', server: '', action: 'read', tool: '', steps: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--persona') out.persona = argv[++i];
    else if (a === '--server') out.server = argv[++i];
    else if (a === '--action') out.action = argv[++i];
    else if (a === '--tool') out.tool = argv[++i];
    else if (a === '--steps') out.steps = JSON.parse(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('--') && i === 0) continue;
    else if (!a.startsWith('--')) continue;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/mcp-persona-entitlements.js catalog|evaluate|workflow [--json] [--persona guest|junior|operator|admin]\n',
    );
    return 0;
  }
  const cmd = args.cmd;
  let payload;
  if (cmd === 'catalog') payload = catalog();
  else if (cmd === 'evaluate') {
    payload = evaluateCall({
      persona: args.persona,
      server: args.server,
      action: args.action,
      tool: args.tool || null,
    });
  } else if (cmd === 'workflow') {
    payload = attributeWorkflow(args.steps || [], { persona: args.persona });
  } else {
    throw new Error(`Unknown command: ${cmd}`);
  }
  if (args.json || cmd !== 'catalog') process.stdout.write(`${JSON.stringify(payload)}\n`);
  else {
    const rows = payload.servers || [];
    for (const row of rows) {
      process.stdout.write(`${row.name}\t${row.writeRisk}\t${row.paid ? 'paid' : 'free'}\t${row.locality}\n`);
    }
  }
  if (cmd === 'evaluate' && payload && payload.allow === false) return 2;
  if (cmd === 'catalog' && payload && payload.ok === false) return 1;
  return 0;
}

module.exports = {
  WRITE_RISK_RANK,
  PERSONAS,
  SERVER_POLICY,
  TOOL_OVERRIDES,
  loadMcpServers,
  catalog,
  evaluateCall,
  attributeWorkflow,
  parseArgs,
  main,
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
