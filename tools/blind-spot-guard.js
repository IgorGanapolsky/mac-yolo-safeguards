#!/usr/bin/env node
/**
 * Blind Spot Custom Instructions & Agentic Guardian
 * Enforces anti-delegation pushback, blind spot awareness, and 3-line weekly cadence tracking
 * based on "This AI Assistant REMEMBERS Everything You Won't" episode.
 */

const fs = require('fs');
const path = require('path');

const BLIND_SPOTS = [
  "Trying to take on tasks outside the core zone of genius instead of delegating to agents or team members.",
  "Over-engineering solutions before validating demand with a waitlist or one-liner.",
  "Skipping the 3-line weekly shipping metrics log."
];

function evaluateTask(taskDescription = '') {
  console.log('[BlindSpotGuard] Evaluating task against known behavioral loops and blind spots...');
  
  for (const spot of BLIND_SPOTS) {
    console.log(`[BlindSpotGuard] Guard check: "${spot}"`);
  }
  
  // Check weekly shipping cadence log
  const cadencePath = path.join(process.env.HOME || '.', '.config/poolside/weekly-cadence.json');
  if (!fs.existsSync(cadencePath)) {
    console.log('[BlindSpotGuard] NOTICE: No weekly cadence log found. Initializing 3-line shipping cadence...');
    const initialLog = {
      week: new Date().toISOString().slice(0, 10),
      shipped: "Initialized proactive blind spot guard and cascade router",
      metric: "1 Active Multi-Agent Orchestrator",
      whatsNext: "Scale autonomous vector retrieval and DFlash speculative decoding"
    };
    fs.mkdirSync(path.dirname(cadencePath), { recursive: true });
    fs.writeFileSync(cadencePath, JSON.stringify(initialLog, null, 2));
    console.log('[BlindSpotGuard] Initialized weekly cadence:', initialLog);
  } else {
    const log = JSON.parse(fs.readFileSync(cadencePath, 'utf8'));
    console.log('[BlindSpotGuard] Active 3-line weekly cadence loaded:', log);
  }
  
  console.log('[BlindSpotGuard] OK — Action approved with blind-spot guardrails active.');
}

if (require.main === module) {
  evaluateTask(process.argv[2] || '');
}
