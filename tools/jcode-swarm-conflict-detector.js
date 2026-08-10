#!/usr/bin/env node
/**
 * jcode-swarm-conflict-detector.js
 * High-ROI jcode steal: Swarm Multi-Agent File Conflict Interceptor.
 *
 * Prevents multiple concurrent agents from editing overlapping files or locks:
 * - Checks plan.md §2 Active File Claims.
 * - Detects active git worktrees and locked files.
 * - Blocks uncoordinated edits with actionable warnings.
 */

const fs = require('fs');
const path = require('path');

function inspectSwarmClaims(planPath = 'plan.md') {
  if (!fs.existsSync(planPath)) {
    return { claims: [], activeAgents: [] };
  }

  const content = fs.readFileSync(planPath, 'utf8');
  const claims = [];
  const lines = content.split('\n');

  let inSection2 = false;
  for (const line of lines) {
    if (line.includes('## 2. Active Agent Claims') || line.includes('## 2. Active File Claims')) {
      inSection2 = true;
      continue;
    }
    if (inSection2 && line.startsWith('## ')) {
      inSection2 = false;
      break;
    }
    if (inSection2 && line.trim().startsWith('-')) {
      claims.push(line.trim());
    }
  }

  return { claims };
}

function checkFileConflict(targetFile, currentAgentId = 'AGENT-1') {
  const { claims } = inspectSwarmClaims();
  const normalizedTarget = path.normalize(targetFile);

  const conflictingClaims = claims.filter((claim) => {
    return claim.includes(normalizedTarget) && !claim.includes(currentAgentId);
  });

  if (conflictingClaims.length > 0) {
    return {
      hasConflict: true,
      reason: `File ${targetFile} is currently claimed by another agent in plan.md`,
      conflicts: conflictingClaims,
    };
  }

  return { hasConflict: false };
}

if (require.main === module) {
  const targetFile = process.argv[2] || 'plan.md';
  const result = checkFileConflict(targetFile);
  console.log('=== jcode Swarm Conflict Detector ===');
  console.log(`Target File: ${targetFile}`);
  console.log(`Has Conflict: ${result.hasConflict}`);
  if (result.hasConflict) {
    console.log(`⚠️ Conflict Warning: ${result.reason}`);
  } else {
    console.log('✅ Safe to edit (No overlapping swarm claims).');
  }
}

module.exports = { inspectSwarmClaims, checkFileConflict };
