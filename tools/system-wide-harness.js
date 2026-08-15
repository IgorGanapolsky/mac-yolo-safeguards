#!/usr/bin/env node
'use strict';

/**
 * system-wide-harness.js — Master Harness & System-Wide Integration Suite
 * -----------------------------------------------------------------------
 * Unifies all 5 high-ROI engines into one production harness:
 *   1. Real-Time Web Intelligence Gateway (web-intelligence-gateway)
 *   2. GitHub Copilot SDK Bridge (copilot-sdk-bridge)
 *   3. Zero-Cost Real-Time Voice Engine (hermes-voice-engine)
 *   4. Local Work Memory Engine (work-memory-engine)
 *   5. Perplexity Search-as-Code SDK (sac-engine) - Programmable agentic search with token compaction
 *
 * Usage:
 *   node tools/system-wide-harness.js --doctor
 *   node tools/system-wide-harness.js --catch-up
 *   node tools/system-wide-harness.js --json
 *   node tools/system-wide-harness.js --sac-search "query"
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

const webIntel = require('./web-intelligence-gateway');
const copilotBridge = require('./copilot-sdk-bridge');
const voiceEngine = require('./hermes-voice-engine');
const workMemory = require('./work-memory-engine');
const { AgenticSearchSDK, SaCSandboxRunner, ContextCompactor, runDoctor: sacDoctor } = require('./sac-engine');

function runSystemWideDiagnostic() {
  const webDoc = webIntel.runDoctor();
  const copilotDoc = copilotBridge.runDoctor();
  const voiceDoc = voiceEngine.runDoctor();
  const memoryDoc = workMemory.runDoctor();
  const sacDoc = sacDoctor();

  const allReady =
    webDoc.status === 'READY' &&
    copilotDoc.status === 'READY' &&
    voiceDoc.status === 'READY' &&
    memoryDoc.status === 'READY' &&
    sacDoc.status === 'READY';

  return {
    harness: 'system-wide-harness',
    overallStatus: allReady ? 'HEALTHY_SYSTEM_WIDE' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    engines: {
      webIntelligence: webDoc,
      copilotSdkBridge: copilotDoc,
      hermesVoiceEngine: voiceDoc,
      workMemoryEngine: memoryDoc,
      searchAsCode: sacDoc,
    },
  };
}

function parseArgs(argv) {
  const args = {
    doctor: false,
    catchUp: false,
    json: false,
    sacSearch: null,
    sacScript: null,
  };
  for (const arg of argv) {
    if (arg === '--doctor') args.doctor = true;
    if (arg === '--catch-up') args.catchUp = true;
    if (arg === '--json') args.json = true;
  }
  // Parse SaC arguments
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sac-search' && argv[i + 1]) args.sacSearch = argv[++i];
    if (argv[i] === '--sac-script' && argv[i + 1]) args.sacScript = argv[++i];
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
      console.log(`- Search-as-Code SDK: ${diag.engines.searchAsCode.status}`);
    }
    process.exit(diag.overallStatus === 'HEALTHY_SYSTEM_WIDE' ? 0 : 1);
  }

  if (args.catchUp) {
    const cu = workMemory.runCatchUp();
    console.log(`=== ${cu.headline} ===`);
    cu.bullets.forEach((b) => console.log(`  • ${b}`));
    process.exit(0);
  }

  // SaC Search functionality
  if (args.sacSearch) {
    const sdk = new AgenticSearchSDK({ repoRoot: REPO });
    (async () => {
      try {
        console.log(`[system-wide-harness] Running SaC search for: ${args.sacSearch}`);
        const results = await sdk.search(args.sacSearch, { fanout: true, limit: 5 });
        const reranked = sdk.rerank(args.sacSearch, results, { strategy: 'rrf', limit: 3 });
        const table = sdk.synthesize_table(reranked, ['title', 'source', 'snippet']);
        console.log('\n' + table);
        process.exit(0);
      } catch (err) {
        console.error('SaC search failed:', err.message);
        process.exit(1);
      }
    })();
    return;
  }

  if (args.sacScript) {
    const runner = new SaCSandboxRunner();
    (async () => {
      try {
        const script = fs.readFileSync(args.sacScript, 'utf8');
        const result = await runner.runCode(script);
        if (result.success) {
          console.log('Script executed successfully');
          console.log(result.result);
          process.exit(0);
        } else {
          console.error('Script execution failed:', result.error);
          process.exit(1);
        }
      } catch (err) {
        console.error('SaC script error:', err.message);
        process.exit(1);
      }
    })();
    return;
  }

  const diag = runSystemWideDiagnostic();
  console.log(`[system-wide-harness] System-Wide Harness Ready. Status: ${diag.overallStatus}`);
  console.log('Use --doctor, --catch-up, --json, --sac-search "query", or --sac-script path for full diagnostics.');
}

if (require.main === module) main();

module.exports = {
  runSystemWideDiagnostic,
};
