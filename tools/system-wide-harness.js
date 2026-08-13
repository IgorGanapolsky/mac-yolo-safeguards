#!/usr/bin/env node
'use strict';

/**
 * system-wide-harness.js — Master Harness & System-Wide Integration Suite
 * -----------------------------------------------------------------------
 * Unifies all 4 high-ROI engines into one production harness:
 *   1. Real-Time Web Intelligence Gateway (web-intelligence-gateway)
 *   2. GitHub Copilot SDK Bridge (copilot-sdk-bridge)
 *   3. Zero-Cost Real-Time Voice Engine (hermes-voice-engine)
 *   4. Local Work Memory Engine (work-memory-engine)
 *
 * Usage:
 *   node tools/system-wide-harness.js --doctor
 *   node tools/system-wide-harness.js --catch-up
 *   node tools/system-wide-harness.js --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const webIntel = require('./web-intelligence-gateway');
const copilotBridge = require('./copilot-sdk-bridge');
const voiceEngine = require('./hermes-voice-engine');
const workMemory = require('./work-memory-engine');

function runSystemWideDiagnostic() {
  const webDoc = webIntel.runDoctor();
  const copilotDoc = copilotBridge.runDoctor();
  const voiceDoc = voiceEngine.runDoctor();
  const memoryDoc = workMemory.runDoctor();

  const allReady =
    webDoc.status === 'READY' &&
    copilotDoc.status === 'READY' &&
    voiceDoc.status === 'READY' &&
    memoryDoc.status === 'READY';

  return {
    harness: 'system-wide-harness',
    overallStatus: allReady ? 'HEALTHY_SYSTEM_WIDE' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    engines: {
      webIntelligence: webDoc,
      copilotSdkBridge: copilotDoc,
      hermesVoiceEngine: voiceDoc,
      workMemoryEngine: memoryDoc,
    },
  };
}

function parseArgs(argv) {
  const args = {
    doctor: false,
    catchUp: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--doctor') args.doctor = true;
    if (arg === '--catch-up') args.catchUp = true;
    if (arg === '--json') args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.doctor || args.json) {
    const diag = runSystemWideDiagnostic();
    if (args.json) {
      console.log(JSON.stringify(diag, null, 2));
    } else {
      console.log(`=== System-Wide High-ROI Harness Status: ${diag.overallStatus} ===`);
      console.log(`- Web Intelligence Gateway: ${diag.engines.webIntelligence.status}`);
      console.log(`- Copilot SDK v1.0.9 Bridge: ${diag.engines.copilotSdkBridge.status}`);
      console.log(`- Hermes Voice Engine: ${diag.engines.hermesVoiceEngine.status}`);
      console.log(`- Work Memory Engine: ${diag.engines.workMemoryEngine.status}`);
    }
    process.exit(diag.overallStatus === 'HEALTHY_SYSTEM_WIDE' ? 0 : 1);
  }

  if (args.catchUp) {
    const cu = workMemory.runCatchUp();
    console.log(`=== ${cu.headline} ===`);
    cu.bullets.forEach((b) => console.log(`  • ${b}`));
    process.exit(0);
  }

  const diag = runSystemWideDiagnostic();
  console.log(`[system-wide-harness] System-Wide Harness Ready. Status: ${diag.overallStatus}`);
  console.log('Use --doctor, --catch-up, or --json for full diagnostics.');
}

if (require.main === module) main();

module.exports = {
  runSystemWideDiagnostic,
};
