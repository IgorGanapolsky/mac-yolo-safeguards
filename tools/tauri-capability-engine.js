#!/usr/bin/env node
'use strict';

/**
 * tauri-capability-engine.js — Tauri 2.0 Capability-Based Security & IPC Isolation Engine
 * ---------------------------------------------------------------------------------------
 * Stolen from Tauri 2.0 Architecture (v2.tauri.app - August 2026):
 *   1. Capability-Based Security: Granular least-privilege ACL for agent actions.
 *   2. IPC Isolation Pattern: Untrusted frontend/LLM tool calls validated before system execution.
 *   3. Path & Command Scopes: Explicit allow/deny globs (e.g. deny business_os/**, .git/**).
 *   4. Zero-Trust Default: Deny by default unless capability is explicitly declared.
 *
 * Usage:
 *   node tools/tauri-capability-engine.js --doctor
 *   node tools/tauri-capability-engine.js --check '{"action":"fs:write","path":"tools/test.js"}'
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const TAURI_DIR = path.join(HOME, '.hermes', 'tauri');
const CAPABILITY_FILE = path.join(TAURI_DIR, 'capabilities.json');

const DEFAULT_CAPABILITIES = Object.freeze({
  default_workspace: {
    description: 'Standard coding agent capabilities for safe workspace development',
    permissions: [
      'fs:read',
      'fs:write',
      'shell:execute',
      'search:zoekt',
      'telemetry:otel',
    ],
    allowPaths: [
      'tools/**',
      'tests/**',
      'bin/**',
      'docs/**',
      'scripts/**',
      '.agents/**',
      'package.json',
      'SKILLS.md',
      'AGENTS.md',
      'README.md',
    ],
    denyPaths: [
      'business_os/**',
      '.git/hooks/**',
      '.env',
      '**/*_secret*',
      '**/*id_rsa*',
    ],
    bannedCommands: [
      'rm -rf /',
      'git push --force origin main',
      'chmod -R 777 /',
    ],
  },
});

function loadCapabilities() {
  if (fs.existsSync(CAPABILITY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CAPABILITY_FILE, 'utf8'));
    } catch {}
  }
  return DEFAULT_CAPABILITIES;
}

function saveCapabilities(data) {
  if (!fs.existsSync(TAURI_DIR)) fs.mkdirSync(TAURI_DIR, { recursive: true });
  fs.writeFileSync(CAPABILITY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Checks if a path matches a simple glob pattern.
 * @param {string} targetPath 
 * @param {string} pattern 
 * @returns {boolean}
 */
function matchGlob(targetPath, pattern) {
  const normPath = targetPath.replace(/\\/g, '/');
  if (pattern === '**') return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return normPath.startsWith(prefix) || normPath === prefix.slice(0, -1);
  }
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    return normPath.endsWith(suffix) || normPath.includes(suffix);
  }
  return normPath === pattern || normPath.endsWith(pattern);
}

/**
 * Evaluates an agent action against the active capability set.
 * @param {object} action { action: string, path?: string, command?: string, role?: string }
 * @param {string} [capabilitySet='default_workspace'] 
 * @returns {{ allowed: boolean, reason: string, capability: string, checks: object }}
 */
function evaluateCapability(action, capabilitySet = 'default_workspace') {
  const allCaps = loadCapabilities();
  const cap = allCaps[capabilitySet] || DEFAULT_CAPABILITIES.default_workspace;

  // 1. Permission check
  const hasPermission = cap.permissions.includes(action.action);
  if (!hasPermission) {
    return {
      allowed: false,
      reason: `Permission '${action.action}' is not granted in capability set '${capabilitySet}'`,
      capability: capabilitySet,
      checks: { permission: false, pathAllowed: false, pathDenied: false, commandSafe: true },
    };
  }

  // 2. Deny Path check
  if (action.path) {
    const isDenied = cap.denyPaths.some((p) => matchGlob(action.path, p));
    if (isDenied) {
      return {
        allowed: false,
        reason: `Target path '${action.path}' is explicitly DENIED by capability security policy`,
        capability: capabilitySet,
        checks: { permission: true, pathAllowed: false, pathDenied: true, commandSafe: true },
      };
    }

    // 3. Allow Path check
    const isAllowed = cap.allowPaths.some((p) => matchGlob(action.path, p));
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Target path '${action.path}' is not within authorized allowPaths boundary`,
        capability: capabilitySet,
        checks: { permission: true, pathAllowed: false, pathDenied: false, commandSafe: true },
      };
    }
  }

  // 4. Banned Command check
  if (action.command) {
    const isBanned = cap.bannedCommands.some((c) => action.command.includes(c));
    if (isBanned) {
      return {
        allowed: false,
        reason: `Command contains banned destructive signature`,
        capability: capabilitySet,
        checks: { permission: true, pathAllowed: true, pathDenied: false, commandSafe: false },
      };
    }
  }

  return {
    allowed: true,
    reason: `Action '${action.action}' authorized under '${capabilitySet}' capabilities`,
    capability: capabilitySet,
    checks: { permission: true, pathAllowed: true, pathDenied: false, commandSafe: true },
  };
}

function runDoctor() {
  const caps = loadCapabilities();
  return {
    engine: 'tauri-capability-engine',
    status: 'READY',
    stolenFrom: 'Tauri 2.0 Capability-Based Security Model (August 2026)',
    activeCapabilitySets: Object.keys(caps),
    totalPermissions: caps.default_workspace?.permissions?.length || 0,
    capabilityFile: CAPABILITY_FILE,
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[tauri-capability] Status: ${doc.status}`);
    console.log(`[tauri-capability] Active Sets: ${doc.activeCapabilitySets.join(', ')}`);
    console.log(`[tauri-capability] Total Permissions: ${doc.totalPermissions}`);
    process.exit(0);
  }

  const checkIdx = args.indexOf('--check');
  if (checkIdx !== -1 && args[checkIdx + 1]) {
    try {
      const parsed = JSON.parse(args[checkIdx + 1]);
      const res = evaluateCapability(parsed);
      console.log(`[tauri-capability] Outcome: ${res.allowed ? 'ALLOWED' : 'DENIED'} (${res.reason})`);
      process.exit(res.allowed ? 0 : 2);
    } catch (e) {
      console.error(`[tauri-capability] JSON parse error: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('Usage: tauri-capability [--doctor] [--check \'<json>\']');
}

module.exports = {
  DEFAULT_CAPABILITIES,
  loadCapabilities,
  saveCapabilities,
  evaluateCapability,
  matchGlob,
  runDoctor,
};
