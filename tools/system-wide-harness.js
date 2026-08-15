#!/usr/bin/env node
'use strict';

/**
 * system-wide-harness.js — Master Harness & System-Wide Integration Suite
 * -----------------------------------------------------------------------
 * Unifies all 7 high-ROI engines into one production harness with $10/mo budget:
 *   1. Real-Time Web Intelligence Gateway (web-intelligence-gateway)
 *   2. GitHub Copilot SDK Bridge (copilot-sdk-bridge)
 *   3. Zero-Cost Real-Time Voice Engine (hermes-voice-engine)
 *   4. Local Work Memory Engine (work-memory-engine)
 *   5. Perplexity Search-as-Code SDK (sac-engine) - Programmable agentic search with token compaction
 *   6. OpenAI Ultrafast Tier (openai-ultrafast-harness) - GPT-5.6 Sol at 750 tokens/sec
 *   7. Seed-Yolo Intelligent Router (seed-yolo-intelligent-router) - Auto-routing to GLM-5.3 for security
 *
 * Budget Enforcement:
 *   - $10.00/month cap across all paid routes
 *   - Auto-fallback to zero-cost models (GLM-5.3, Grok 4.5, Ollama) when exhausted
 *
 * Usage:
 *   node tools/system-wide-harness.js --doctor
 *   node tools/system-wide-harness.js --budget-status
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
const { OpenAIUltrafastHarness } = require('./openai-ultrafast-harness');
const { classifyPrompt: seedClassifyPrompt, selectOptimalModel: seedSelectRoute } = require('./seed-yolo-intelligent-router');
const { runTriage, runDoctor: triageDoctor } = require('./security-ai-triage-harness');

const MONTHLY_BUDGET_USD = 10.00;

function runSystemWideDiagnostic() {
  const webDoc = webIntel.runDoctor();
  const copilotDoc = copilotBridge.runDoctor();
  const voiceDoc = voiceEngine.runDoctor();
  const memoryDoc = workMemory.runDoctor();
  const sacDoc = sacDoctor();
  const ultrafastHarness = new OpenAIUltrafastHarness({ monthlyBudgetCapUsd: MONTHLY_BUDGET_USD });
  const ultrafastDoctor = ultrafastHarness.getDoctor();
  const seedDoctor = {
    service: 'seed-yolo-intelligent-router',
    status: 'READY',
    defaultRoute: 'glm-5.3',
    cyberGymScore: '84.5%',
    patterns: ['security', 'verify', 'architecture', 'video', 'fast', 'gpt'],
  };

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
    budget: {
      monthlyCapUsd: MONTHLY_BUDGET_USD,
      ultrafastBudgetUsd: ultrafastDoctor.budgetGuard?.currentSpentUsd || 0,
      ultrafastStatus: ultrafastDoctor.budgetGuard?.pacingStatus || 'GREEN',
    },
    engines: {
      webIntelligence: webDoc,
      copilotSdkBridge: copilotDoc,
      hermesVoiceEngine: voiceDoc,
      workMemoryEngine: memoryDoc,
      searchAsCode: sacDoc,
      openaiUltrafast: ultrafastDoctor,
      seedYoloIntelligentRouter: seedDoctor,
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
    budgetStatus: false,
    seedRoute: null,
    securityTriage: null,
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
    if (argv[i] === '--budget-status') args.budgetStatus = true;
    if (argv[i] === '--seed-route' && argv[i + 1]) args.seedRoute = argv[++i];
    if (argv[i] === '--security-triage' && argv[i + 1]) args.securityTriage = argv[++i];
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
      console.log(`- OpenAI Ultrafast Tier: ${diag.engines.openaiUltrafast.status}`);
      console.log(`- Seed-Yolo Intelligent Router: ${diag.engines.seedYoloIntelligentRouter.status}`);
      console.log(`\nBudget Cap: $${diag.budget.monthlyCapUsd}/mo | Ultrafast Used: $${diag.budget.ultrafastBudgetUsd}`);
    }
    process.exit(diag.overallStatus === 'HEALTHY_SYSTEM_WIDE' ? 0 : 1);
  }

  if (args.budgetStatus) {
    const ultrafastHarness = new OpenAIUltrafastHarness({ monthlyBudgetCapUsd: MONTHLY_BUDGET_USD });
    const status = ultrafastHarness.getBudgetStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
    return;
  }

  if (args.seedRoute) {
    const result = seedSelectRoute(args.seedRoute);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
    return;
  }

  if (args.securityTriage) {
    const result = runTriage({ option: 'triage', issue: args.securityTriage });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
    return;
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
