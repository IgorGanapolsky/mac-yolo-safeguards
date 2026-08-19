#!/usr/bin/env node
'use strict';

/**
 * verified-pipeline-barrier.js
 *
 * Implements the 4-Tier Automated Verification Pipeline Barrier.
 *
 * Addresses The New Stack's core insight:
 * "Human review vs. verified pipelines: Code review wasn't built for this volume.
 * AI agents now write faster than any team can check, PRs up 2x, bugs up 54%."
 *
 * Enforces 4 deterministic stage gates before any code is marked shipped or PR opened:
 *  Tier 1: Syntax, AST & Static Typecheck Gate
 *  Tier 2: Hermetic Unit & Contract Test Gate
 *  Tier 3: Verifiable Proof & Receipt Gate (Diffs, TAP, Exit Codes)
 *  Tier 4: ThumbGate Pre-Action Governance Gate (Secrets, Spend, Hijack Invariants)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function checkTier1Syntax(files, rootDir = process.cwd()) {
  const errors = [];
  for (const relPath of files) {
    const fullPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;

    if (relPath.endsWith('.json')) {
      try {
        JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (err) {
        errors.push(`JSON Syntax Error in ${relPath}: ${err.message}`);
      }
    } else if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
      const res = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
      if (res.status !== 0) {
        errors.push(`JS Syntax Error in ${relPath}:\n${res.stderr || res.stdout}`);
      }
    }
  }
  return { passed: errors.length === 0, tier: 'Tier 1: Syntax & AST', errors };
}

function checkTier2HermeticTests(testCommands, rootDir = process.cwd()) {
  const results = [];
  let allPassed = true;

  for (const cmd of testCommands) {
    const [exec, ...args] = cmd.split(' ');
    const res = spawnSync(exec, args, { encoding: 'utf8', cwd: rootDir, timeout: 30000 });
    const passed = res.status === 0;
    if (!passed) allPassed = false;
    results.push({
      command: cmd,
      status: res.status,
      passed,
      outputSnippet: (res.stdout || res.stderr || '').slice(0, 300),
    });
  }

  return { passed: allPassed, tier: 'Tier 2: Hermetic Tests', results };
}

function checkTier3VerifiableProof(receipt) {
  const errors = [];
  if (!receipt) {
    errors.push('Missing execution receipt');
  } else {
    if (!receipt.taskId) errors.push('Receipt missing taskId');
    if (!receipt.timestamp) errors.push('Receipt missing timestamp');
    if (typeof receipt.exitCode !== 'number') errors.push('Receipt missing numeric exitCode');
    if (receipt.exitCode !== 0) errors.push(`Receipt indicates failed execution (exitCode: ${receipt.exitCode})`);
  }
  return { passed: errors.length === 0, tier: 'Tier 3: Verifiable Proof', errors };
}

function checkTier4Governance(content, files) {
  const errors = [];
  const bannedPatterns = [
    { pattern: /(?:xdotool|cliclick|osascript.*click)/i, name: 'Banned Host Mouse Hijack' },
    { pattern: /(?:ghp_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,})/i, name: 'Exposed Raw Secret/Token' },
    { pattern: /HERMES_ALLOW_INTERACTIVE_CHROME\s*=\s*1/i, name: 'Unauthorized Interactive Chrome Flag' },
  ];

  const fullText = typeof content === 'string' ? content : JSON.stringify(content || '');
  for (const bp of bannedPatterns) {
    if (bp.pattern.test(fullText)) {
      errors.push(`Governance Violation: ${bp.name}`);
    }
  }

  return { passed: errors.length === 0, tier: 'Tier 4: Governance & Safety', errors };
}

function evaluateFullPipelineBarrier({ files = [], testCommands = [], receipt = null, content = '' }) {
  const t1 = checkTier1Syntax(files);
  const t2 = checkTier2HermeticTests(testCommands);
  const t3 = checkTier3VerifiableProof(receipt);
  const t4 = checkTier4Governance(content, files);

  const allPassed = t1.passed && t2.passed && t3.passed && t4.passed;
  return {
    passed: allPassed,
    summary: allPassed ? 'ALL 4 VERIFICATION TIERS PASSED' : 'PIPELINE BARRIER BLOCKED',
    tiers: {
      tier1_syntax: t1,
      tier2_tests: t2,
      tier3_proof: t3,
      tier4_governance: t4,
    },
  };
}

module.exports = {
  checkTier1Syntax,
  checkTier2HermeticTests,
  checkTier3VerifiableProof,
  checkTier4Governance,
  evaluateFullPipelineBarrier,
};

if (require.main === module) {
  const dummyReceipt = { taskId: 'T-101', timestamp: new Date().toISOString(), exitCode: 0 };
  const res = evaluateFullPipelineBarrier({
    files: ['package.json'],
    testCommands: ['node -v'],
    receipt: dummyReceipt,
    content: 'Clean code with no secrets',
  });
  console.log(JSON.stringify(res, null, 2));
}
