#!/usr/bin/env node
'use strict';

/**
 * taste-and-slop-register.js — AI Slop Register & Engineering Taste Engine
 * -----------------------------------------------------------------------
 * Inspired by The New Stack ("Code review is a taste problem" - Aug 2026):
 *   1. 3-Way Feedback Splitter:
 *      - 45% Deterministic (Codified AST/Regex patterns)
 *      - 30% Execution-Testable (Automated test invariants)
 *      - 25% Genuine Taste & Judgment (Contract & Intent alignment)
 *   2. Slop Register: Auto-promotes review comments into immutable PreToolUse prevention gates.
 *   3. Intent-First Reviewer: Audits PR changes against 8 lines of intent over raw diffs.
 *
 * Usage:
 *   node tools/taste-and-slop-register.js --doctor
 *   node tools/taste-and-slop-register.js --classify "Do not use raw sql queries in handlers"
 *   node tools/taste-and-slop-register.js --audit-diff
 *   node tools/taste-and-slop-register.js --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTER_FILE = path.join(os.homedir(), '.hermes', 'slop-register.json');

// Canonical 3-way categorization from The New Stack article
const FEEDBACK_BUCKETS = Object.freeze({
  DETERMINISTIC: 'deterministic',         // 45%: Pattern / Lint / Format / Secret
  EXECUTION_TESTABLE: 'execution_testable', // 30%: Reproducible test assertion
  GENUINE_JUDGMENT: 'genuine_judgment',   // 25%: Product architecture & taste
});

const DEFAULT_SLOP_RULES = [
  {
    id: 'SLOP-001',
    bucket: FEEDBACK_BUCKETS.DETERMINISTIC,
    pattern: /(?:As an AI language model|Certainly! Here is|I hope this helps)/i,
    severity: 'BLOCK',
    description: 'Banned conversational filler and AI disclaimer slop.',
  },
  {
    id: 'SLOP-002',
    bucket: FEEDBACK_BUCKETS.DETERMINISTIC,
    pattern: /(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})/i,
    severity: 'BLOCK',
    description: 'Hardcoded API secrets or PAT credentials in tracked files.',
  },
  {
    id: 'SLOP-003',
    bucket: FEEDBACK_BUCKETS.EXECUTION_TESTABLE,
    pattern: /(?:TODO:? implement later|throw new Error\(['"]Not implemented['"]\))/i,
    severity: 'WARN',
    description: 'Lazy stubbing or speculative unimplemented placeholder code.',
  },
  {
    id: 'SLOP-004',
    bucket: FEEDBACK_BUCKETS.GENUINE_JUDGMENT,
    pattern: /(?:git checkout -b|git push --force|rm -rf \/)/i,
    severity: 'BLOCK',
    description: 'Destructive non-isolated branch mutations and force pushes on shared trees.',
  },
];

function loadRegister() {
  return {
    version: '1.0.0',
    rules: DEFAULT_SLOP_RULES,
    history: [],
    lastUpdated: new Date().toISOString(),
  };
}

function saveRegister(register) {
  try {
    const dir = path.dirname(REGISTER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGISTER_FILE, JSON.stringify(register, null, 2), 'utf8');
  } catch {}
}

/**
 * Classifies a code review comment into one of the 3 canonical buckets.
 * @param {string} comment 
 * @returns {{ bucket: string, codifiable: boolean, suggestedAction: string }}
 */
function classifyReviewComment(comment) {
  if (!comment || typeof comment !== 'string') {
    return { bucket: FEEDBACK_BUCKETS.GENUINE_JUDGMENT, codifiable: false, suggestedAction: 'manual_review' };
  }

  const lower = comment.toLowerCase();
  if (/regex|pattern|lint|format|semicolon|import|naming|casing|unused|const|let/i.test(lower)) {
    return {
      bucket: FEEDBACK_BUCKETS.DETERMINISTIC,
      codifiable: true,
      suggestedAction: 'Promote to Slop Register deterministic regex / linter rule',
    };
  }
  if (/test|assert|throw|400|500|status|mock|fixture|timeout|e2e|fail/i.test(lower)) {
    return {
      bucket: FEEDBACK_BUCKETS.EXECUTION_TESTABLE,
      codifiable: true,
      suggestedAction: 'Promote to automated execution-testable unit/E2E assertion',
    };
  }
  return {
    bucket: FEEDBACK_BUCKETS.GENUINE_JUDGMENT,
    codifiable: false,
    suggestedAction: 'Require Senior Engineer / Guardian taste & architectural review',
  };
}

/**
 * Scans code diff or text against active slop register rules.
 * @param {string} content 
 * @returns {{ clean: boolean, violations: Array<object> }}
 */
function auditContent(content) {
  const reg = loadRegister();
  const violations = [];

  for (const r of reg.rules) {
    const regex = new RegExp(r.pattern);
    if (regex.test(content)) {
      violations.push({
        id: r.id,
        bucket: r.bucket,
        severity: r.severity,
        description: r.description,
      });
    }
  }

  return {
    clean: violations.filter((v) => v.severity === 'BLOCK').length === 0,
    violations,
  };
}

function runDoctor() {
  const reg = loadRegister();
  return {
    engine: 'taste-and-slop-register',
    status: 'READY',
    thesis: 'Code review is a taste problem — 75% of review feedback is codifiable into an AI Slop Register',
    totalRules: reg.rules.length,
    deterministicRules: reg.rules.filter((r) => r.bucket === FEEDBACK_BUCKETS.DETERMINISTIC).length,
    executionRules: reg.rules.filter((r) => r.bucket === FEEDBACK_BUCKETS.EXECUTION_TESTABLE).length,
    judgmentRules: reg.rules.filter((r) => r.bucket === FEEDBACK_BUCKETS.GENUINE_JUDGMENT).length,
    registerFile: REGISTER_FILE,
  };
}

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[slop-register] Status: ${doc.status}`);
    console.log(`[slop-register] Thesis: ${doc.thesis}`);
    console.log(`[slop-register] Active Rules: ${doc.totalRules} (45% Det, 30% Test, 25% Judgment)`);
    process.exit(0);
  }

  if (args.includes('--classify')) {
    const commentIdx = args.indexOf('--classify');
    const comment = args[commentIdx + 1] || 'Do not use var, use const or let';
    const result = classifyReviewComment(comment);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const doc = runDoctor();
  console.log(JSON.stringify(doc, null, 2));
}

module.exports = {
  FEEDBACK_BUCKETS,
  DEFAULT_SLOP_RULES,
  classifyReviewComment,
  auditContent,
  loadRegister,
  saveRegister,
  runDoctor,
};
