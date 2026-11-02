#!/usr/bin/env node
/**
 * Cross-Family Critique Loop
 * Implements Misha Laskin / GitHub COO Kyle Daigle's pattern:
 * Generates an artifact or plan with a fast model (Laguna-XS),
 * then verifies/critiques it with a secondary model/rule engine,
 * cutting token waste and catching flaws before execution.
 */

const fs = require('fs');

async function runCritique(artifactPath) {
  console.log(`[CritiqueLoop] Inspecting artifact at ${artifactPath}...`);
  if (!fs.existsSync(artifactPath)) {
    console.error(`[CritiqueLoop] Error: Artifact not found: ${artifactPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(artifactPath, 'utf8');
  
  // Basic heuristic & security rule validation
  const issues = [];
  if (content.includes('rm -rf /')) {
    issues.push('Critical: Unsafe destructive command detected.');
  }
  if (content.includes('password =') || content.includes('SECRET=')) {
    issues.push('Warning: Potential unredacted credential pattern.');
  }
  
  if (issues.length > 0) {
    console.log('[CritiqueLoop] Critique FAILED:');
    issues.forEach(i => console.log(`  - ${i}`));
    process.exit(1);
  } else {
    console.log('[CritiqueLoop] Critique PASSED: Artifact clean of known anti-patterns.');
    process.exit(0);
  }
}

if (require.main === module) {
  const target = process.argv[2] || 'plan.md';
  runCritique(target);
}
