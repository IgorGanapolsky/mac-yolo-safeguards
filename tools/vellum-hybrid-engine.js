#!/usr/bin/env node
'use strict';

/**
 * vellum-hybrid-engine.js — Hybrid hosting + 8-tier memory (Hermes rail)
 * ----------------------------------------------------------------------
 * Stolen from Vellum Assistant (August 2026): local vs always-on, memory
 * banks, credential isolation. This is NOT official Vellum Cloud and is
 * NOT ThumbGate.app.
 *
 * Usage:
 *   node tools/vellum-hybrid-engine.js --doctor
 *   node tools/vellum-hybrid-engine.js --mode local
 *   node tools/vellum-hybrid-engine.js --mode cloud
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE =
  process.env.VELLUM_HYBRID_STATE || path.join(os.homedir(), '.hermes', 'vellum-state.json');

const HOSTING_MODES = Object.freeze({
  LOCAL: {
    id: 'local',
    name: 'Local Machine (Apple Silicon)',
    description: 'Runs on this Mac. Data stays on hardware. $0 marginal cost.',
    endpoint: process.env.HERMES_LOCAL_URL || 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen3.5:9b-hermes-64k',
    vendor: 'hermes',
    isAlwaysOn: false,
    isOfficialVellumCloud: false,
    isThumbgate: false,
    requiresInternet: false,
  },
  CLOUD: {
    id: 'cloud',
    name: 'Hermes always-on host (not Vellum Cloud)',
    description:
      'User-owned LaunchAgent or VPS. Official Vellum Cloud is vellum.ai Mighty $30 / Super $100 / Ultra $200. ThumbGate.app is a different product.',
    endpoint: process.env.HERMES_ALWAYS_ON_URL || 'http://127.0.0.1:8642/v1',
    defaultModel: 'hosted-hermes-v1',
    vendor: 'hermes',
    isAlwaysOn: true,
    isOfficialVellumCloud: false,
    isThumbgate: false,
    requiresInternet: true,
  },
});

const MEMORY_TIERS = Object.freeze([
  'episodic',
  'semantic',
  'procedural',
  'invariant',
  'persona',
  'working',
  'user_pref',
  'relational',
]);

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      /* fall through */
    }
  }
  return {
    mode: 'local',
    activeModel: HOSTING_MODES.LOCAL.defaultModel,
    memoryBanks: {
      episodic: [],
      semantic: [],
      procedural: [],
      invariant: [],
    },
    credentialVault: 'sandboxed-macos-keychain',
    lastSyncAt: new Date().toISOString(),
  };
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function setHostingMode(targetMode) {
  const modeKey = String(targetMode).toLowerCase();
  if (modeKey !== 'local' && modeKey !== 'cloud') {
    throw new Error(`Invalid hosting mode: ${targetMode}. Must be 'local' or 'cloud'.`);
  }
  const config = HOSTING_MODES[modeKey.toUpperCase()];
  if (/thumbgate/i.test(config.endpoint) || config.isThumbgate || config.isOfficialVellumCloud) {
    throw new Error('Refusing dishonest cloud branding (ThumbGate or official Vellum Cloud).');
  }
  const state = loadState();
  state.mode = modeKey;
  state.activeModel = config.defaultModel;
  state.lastSyncAt = new Date().toISOString();
  saveState(state);
  return { success: true, activeConfig: config, state };
}

function auditCredentialIsolation(text) {
  if (!text || typeof text !== 'string') return { isSafe: true, leakedKeys: [] };
  const secretPattern =
    /\b(?:ghp_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{33}|xai-[A-Za-z0-9_-]{16,})\b/g;
  const matches = text.match(secretPattern) || [];
  return {
    isSafe: matches.length === 0,
    leakedKeys: matches.map((m) => `${m.substring(0, 6)}...[REDACTED]`),
  };
}

function recordMemory(tier, payload) {
  if (!MEMORY_TIERS.includes(tier)) {
    throw new Error(`Invalid memory tier: ${tier}. Allowed: ${MEMORY_TIERS.join(', ')}`);
  }
  const state = loadState();
  if (!state.memoryBanks[tier]) state.memoryBanks[tier] = [];
  state.memoryBanks[tier].push({ timestamp: Date.now(), data: payload });
  if (state.memoryBanks[tier].length > 50) {
    state.memoryBanks[tier] = state.memoryBanks[tier].slice(-50);
  }
  saveState(state);
}

function runDoctor() {
  const state = loadState();
  const activeModeConfig = HOSTING_MODES[String(state.mode).toUpperCase()] || HOSTING_MODES.LOCAL;
  return {
    harness: 'vellum-hybrid-engine',
    status: 'READY',
    stolenFrom: 'Vellum AI Assistant (August 2026)',
    vendor: 'hermes',
    isOfficialVellumCloud: false,
    isThumbgate: false,
    activeHostingMode: state.mode,
    hostingConfig: activeModeConfig,
    memoryTiersSupported: MEMORY_TIERS,
    totalMemoriesStored: Object.values(state.memoryBanks || {}).reduce(
      (acc, bank) => acc + (bank ? bank.length : 0),
      0,
    ),
    credentialIsolationMode: state.credentialVault,
    stateFilePath: STATE_FILE,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[vellum-hybrid] Status: ${doc.status}`);
    console.log(`[vellum-hybrid] Vendor: ${doc.vendor} (not official Vellum Cloud, not ThumbGate)`);
    console.log(`[vellum-hybrid] Hosting Mode: ${doc.activeHostingMode.toUpperCase()} (${doc.hostingConfig.name})`);
    console.log(`[vellum-hybrid] Endpoint: ${doc.hostingConfig.endpoint}`);
    console.log(`[vellum-hybrid] 24/7 Always-On: ${doc.hostingConfig.isAlwaysOn ? 'YES' : 'NO'}`);
    console.log(`[vellum-hybrid] Credential Isolation: ${doc.credentialIsolationMode}`);
    process.exit(0);
  }
  if (args.includes('--mode')) {
    const target = args[args.indexOf('--mode') + 1];
    try {
      const res = setHostingMode(target);
      console.log(`[vellum-hybrid] Switched hosting to: ${res.activeConfig.name}`);
      console.log(`[vellum-hybrid] Endpoint: ${res.activeConfig.endpoint}`);
      process.exit(0);
    } catch (err) {
      console.error(`[vellum-hybrid] Error: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(JSON.stringify(runDoctor(), null, 2));
}

module.exports = {
  HOSTING_MODES,
  MEMORY_TIERS,
  loadState,
  saveState,
  setHostingMode,
  auditCredentialIsolation,
  recordMemory,
  runDoctor,
};
