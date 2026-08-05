#!/usr/bin/env node
'use strict';

/**
 * hermes-mcp-admin-access.js — WorkOS MCP plugin access-control pattern
 *
 * Newsletter (2026-08-04): "WorkOS Plugin for Claude and ChatGPT … manage
 * environments via MCP … team admins can control their team's access to make
 * changes or access production environments via MCP in team settings."
 *
 * Steal (no WorkOS purchase):
 *   Role-gated tool matrix for Hermes fleet / ThumbGate admin MCP-style tools.
 *   Read-only agents can status; only admin can touch production mutations.
 *
 * Roles:
 *   reader   — status, snapshot, lint (no side effects)
 *   operator — + reap dry-run, pair mint (dev), skill eval
 *   admin    — + production mutations, registry write, force reap
 *
 * Usage:
 *   node tools/hermes-mcp-admin-access.js --check --role reader --tool fleet.status --json
 *   node tools/hermes-mcp-admin-access.js --matrix --json
 */

const ROLES = Object.freeze({
  reader: {
    id: 'reader',
    rank: 10,
    description: 'Read-only fleet / auth / pair status',
  },
  operator: {
    id: 'operator',
    rank: 50,
    description: 'Operate non-prod: dry-run reap, skill eval, pair mint in emulate',
  },
  admin: {
    id: 'admin',
    rank: 100,
    description: 'Production mutations, credential rotate intent, force reap',
  },
});

/** Tool catalog with minimum role rank. */
const TOOLS = Object.freeze({
  'fleet.status': {
    minRole: 'reader',
    sideEffect: false,
    production: false,
    description: 'Fleet registry status (sprawl assess)',
  },
  'fleet.snapshot': {
    minRole: 'reader',
    sideEffect: false,
    production: false,
    description: 'Known-state / sprawl snapshot',
  },
  'skill.lint': {
    minRole: 'reader',
    sideEffect: false,
    production: false,
    description: 'Skill quality lint',
  },
  'skill.eval': {
    minRole: 'operator',
    sideEffect: false,
    production: false,
    description: 'Skill activation eval suite',
  },
  'fleet.reap_dry_run': {
    minRole: 'operator',
    sideEffect: false,
    production: false,
    description: 'Reap idle runs (dry-run only)',
  },
  'pair.emulate_mint': {
    minRole: 'operator',
    sideEffect: true,
    production: false,
    description: 'Mint pair code in known-state emulate (not live pair server)',
  },
  'fleet.reap': {
    minRole: 'admin',
    sideEffect: true,
    production: false,
    description: 'Actually reap dead fleet runs',
  },
  'credential.rotate': {
    minRole: 'admin',
    sideEffect: true,
    production: true,
    description: 'Record managed credential rotation intent',
  },
  'auth.production_guard': {
    minRole: 'reader',
    sideEffect: false,
    production: true,
    description: 'Public WorkOS production auth guard (secret-free)',
  },
  'auth.production_mutate': {
    minRole: 'admin',
    sideEffect: true,
    production: true,
    description: 'Change production AuthKit / WorkOS settings (human-gated)',
  },
  'spend.authorize': {
    minRole: 'admin',
    sideEffect: true,
    production: true,
    description: 'Financial control authorize — HARD DENY for agents (never-spend)',
    hardDeny: true,
  },
});

function roleRank(roleId) {
  const r = ROLES[roleId];
  return r ? r.rank : -1;
}

function resolveRole(roleId, env = process.env) {
  if (roleId && ROLES[roleId]) return ROLES[roleId];
  const fromEnv = String(env.HERMES_MCP_ADMIN_ROLE || env.HERMES_ADMIN_ROLE || 'reader').toLowerCase();
  return ROLES[fromEnv] || ROLES.reader;
}

/**
 * Check whether a role may invoke a tool.
 * Returns { allowed, reason, ... }.
 */
function checkAccess(roleId, toolName, options = {}) {
  const role = resolveRole(roleId, options.env);
  const tool = TOOLS[toolName];
  if (!tool) {
    return {
      allowed: false,
      reason: 'unknown_tool',
      role: role.id,
      tool: toolName,
    };
  }

  if (tool.hardDeny) {
    return {
      allowed: false,
      reason: 'hard_deny_never_spend',
      role: role.id,
      tool: toolName,
      message: 'Agent spend authorization is permanently denied (ERP hard floor)',
    };
  }

  // Production mutation requires explicit allow flag even for admin
  if (tool.production && tool.sideEffect) {
    const allowProd =
      options.allowProduction === true ||
      String((options.env || process.env).HERMES_MCP_ALLOW_PRODUCTION || '') === '1';
    if (!allowProd) {
      return {
        allowed: false,
        reason: 'production_locked',
        role: role.id,
        tool: toolName,
        message: 'Production mutations require HERMES_MCP_ALLOW_PRODUCTION=1 + admin role',
      };
    }
  }

  const need = roleRank(tool.minRole);
  if (role.rank < need) {
    return {
      allowed: false,
      reason: 'role_too_low',
      role: role.id,
      tool: toolName,
      required: tool.minRole,
      message: `Role ${role.id} cannot invoke ${toolName} (needs ${tool.minRole})`,
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    role: role.id,
    tool: toolName,
    sideEffect: tool.sideEffect,
    production: tool.production,
  };
}

function accessMatrix(options = {}) {
  const roles = Object.keys(ROLES);
  const tools = Object.keys(TOOLS);
  const matrix = {};
  for (const tool of tools) {
    matrix[tool] = {};
    for (const role of roles) {
      matrix[tool][role] = checkAccess(role, tool, options).allowed;
    }
  }
  return {
    roles: ROLES,
    tools: TOOLS,
    matrix,
  };
}

function parseArgs(argv) {
  const args = { json: false, check: false, matrix: false, role: 'reader', tool: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--check') args.check = true;
    else if (a === '--matrix') args.matrix = true;
    else if (a === '--role') args.role = argv[++i];
    else if (a === '--tool') args.tool = argv[++i];
    else if (a === '--allow-production') args.allowProduction = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-mcp-admin-access.js --matrix [--json]
  node tools/hermes-mcp-admin-access.js --check --role reader|operator|admin --tool fleet.status [--json]
  node tools/hermes-mcp-admin-access.js --check --role admin --tool auth.production_mutate --allow-production [--json]`);
    process.exit(0);
  }

  let out;
  if (args.check) {
    out = checkAccess(args.role, args.tool, { allowProduction: args.allowProduction });
  } else {
    out = accessMatrix({ allowProduction: args.allowProduction });
  }

  if (args.json || true) console.log(JSON.stringify(out, null, 2));
  const failed = args.check && out && out.allowed === false;
  process.exit(failed ? 2 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  ROLES,
  TOOLS,
  roleRank,
  resolveRole,
  checkAccess,
  accessMatrix,
};
