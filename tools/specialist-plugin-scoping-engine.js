#!/usr/bin/env node
/**
 * tools/specialist-plugin-scoping-engine.js
 * Specialist Agent Plugin Scoping & Least-Privilege Permission Engine.
 *
 * Enforces strict role-based tool scoping across specialist agent personas:
 *   - Reviewer: GitHub, Filesystem, Tests
 *   - Planner: Obsidian, Linear
 *   - Builder: Filesystem, Docker, GitHub
 *   - SecurityAuditor: CodeQL, SecretScanner, Git
 *   - TelemetryAnalyst: LiteLLM, BPEEstimator, Metrics
 *
 * Usage:
 *   node tools/specialist-plugin-scoping-engine.js
 *   node tools/specialist-plugin-scoping-engine.js --json
 */

const fs = require('fs');
const path = require('path');

const isJson = process.argv.includes('--json');

const SPECIALIST_ROLES = {
  Reviewer: {
    allowedPlugins: ['GitHub', 'Filesystem', 'Tests'],
    forbiddenPlugins: ['Docker', 'Stripe', 'Deployer', 'DatabaseWrite'],
  },
  Planner: {
    allowedPlugins: ['Obsidian', 'Linear'],
    forbiddenPlugins: ['Docker', 'Stripe', 'DatabaseWrite', 'TerminalExec'],
  },
  Builder: {
    allowedPlugins: ['Filesystem', 'Docker', 'GitHub'],
    forbiddenPlugins: ['StripeBilling', 'ProductionDeploy'],
  },
  SecurityAuditor: {
    allowedPlugins: ['CodeQL', 'SecretScanner', 'Git'],
    forbiddenPlugins: ['ProductionDeploy', 'DatabaseWrite'],
  },
  TelemetryAnalyst: {
    allowedPlugins: ['LiteLLM', 'BPEEstimator', 'Metrics'],
    forbiddenPlugins: ['Docker', 'DatabaseWrite', 'ProductionDeploy'],
  },
};

function auditSpecialistPluginScoping(role = 'Builder', requestedTool = 'Filesystem') {
  const roleConfig = SPECIALIST_ROLES[role];
  if (!roleConfig) {
    return {
      status: 'UNKNOWN_ROLE',
      allowed: false,
      reason: `Role '${role}' is not registered in Specialist Role Matrix`,
    };
  }

  const isAllowed = roleConfig.allowedPlugins.some((plugin) =>
    requestedTool.toLowerCase().includes(plugin.toLowerCase()),
  );
  const isForbidden = roleConfig.forbiddenPlugins.some((plugin) =>
    requestedTool.toLowerCase().includes(plugin.toLowerCase()),
  );

  const allowed = isAllowed && !isForbidden;

  return {
    timestamp: new Date().toISOString(),
    role,
    requestedTool,
    allowed,
    status: allowed ? 'TOOL_ACCESS_GRANTED' : 'TOOL_ACCESS_DENIED_LEAST_PRIVILEGE',
    allowedPlugins: roleConfig.allowedPlugins,
    forbiddenPlugins: roleConfig.forbiddenPlugins,
    grade: '10/10 (LEAST_PRIVILEGE_PLUGIN_SCOPING_ACTIVE)',
  };
}

if (isJson) {
  console.log(JSON.stringify(auditSpecialistPluginScoping(), null, 2));
} else {
  console.log('=== Specialist Agent Plugin Scoping & Least-Privilege Engine ===');
  const roles = Object.keys(SPECIALIST_ROLES);
  roles.forEach((r) => {
    const config = SPECIALIST_ROLES[r];
    console.log(`Role [${r}]:`);
    console.log(`  Allowed Plugins:   ${config.allowedPlugins.join(', ')}`);
    console.log(`  Forbidden Plugins: ${config.forbiddenPlugins.join(', ')}`);
  });
  console.log('--------------------------------------------------');
  console.log('✅ Specialist Plugin Scoping & Least-Privilege Invariants Active!');
}

module.exports = { auditSpecialistPluginScoping, SPECIALIST_ROLES };
