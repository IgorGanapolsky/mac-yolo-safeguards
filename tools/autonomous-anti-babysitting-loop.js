#!/usr/bin/env node
'use strict';

/**
 * Autonomous Anti-Babysitting Loop Engine
 *
 * Enforces Igor's Anti-Babysitting Mandate:
 * 1. Never stops to ask for manual approvals on pre-authorized tasks.
 * 2. Continuously audits open PRs, code health, and product contracts.
 * 3. Scans agent communication for babysitting markers ("let me know", "should I", etc.) and flags/replaces them.
 * 4. Automatically executes next steps without waiting for human handoffs.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FORBIDDEN_BABYSITTING_PATTERNS = [
  /\blet\s+me\s+know\b/i,
  /\b(should\s+I|if\s+I\s+should)\b/i,
  /\b(want\s+me\s+to|if\s+you\s+want\s+me\s+to)\b/i,
  /\bneeds?\s+your\s+approval\b/i,
  /\bjust\s+click\b/i,
  /\bone\s+click\s+away\b/i,
  /\bplease\s+(run|approve|merge|check|test)\b/i,
  /\bcan\s+you\s+(run|approve|merge|check|test)\b/i
];

class AntiBabysittingEngine {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  }

  /**
   * Scan text for forbidden babysitting patterns
   */
  auditTextForBabysitting(text) {
    if (!text || typeof text !== 'string') return { clean: true, violations: [] };

    const violations = [];
    for (const pattern of FORBIDDEN_BABYSITTING_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          pattern: pattern.toString(),
          matched: match[0],
          remediation: 'Execute action autonomously instead of asking the user.'
        });
      }
    }

    return {
      clean: violations.length === 0,
      violations
    };
  }

  /**
   * Determine autonomous next actions based on repository status
   */
  planAutonomousActions(context = {}) {
    const actions = [];

    if (context.hasUnmergedCleanPrs) {
      actions.push({
        id: 'ACTION_ARM_AUTO_MERGE',
        description: 'Arm squash auto-merge on all green pull requests without asking.',
        priority: 'HIGH'
      });
    }

    if (context.hasUntrackedFeatures) {
      actions.push({
        id: 'ACTION_SYNC_TIELINE_CONTRACTS',
        description: 'Sync modified components with Tieline Product Contracts and run blast-radius tests.',
        priority: 'HIGH'
      });
    }

    if (context.hasStaleWorktrees) {
      actions.push({
        id: 'ACTION_PRUNE_MERGED_WORKTREES',
        description: 'Prune merged worktrees and delete deleted remote tracking branches.',
        priority: 'MEDIUM'
      });
    }

    return actions;
  }

  /**
   * Run self-diagnostic and contract verification
   */
  runHealthAudit() {
    const results = {
      timestamp: new Date().toISOString(),
      contractsValid: false,
      unitTestsPassed: false,
      babysittingViolations: 0
    };

    try {
      const { TielineProductContractEngine } = require('./tieline-product-contract');
      const tieline = new TielineProductContractEngine();
      const contractCheck = tieline.verifyContractIntegrity(this.repoRoot);
      results.contractsValid = contractCheck.valid;
    } catch (e) {
      results.contractsValid = false;
      results.contractError = e.message;
    }

    return results;
  }
}

module.exports = {
  AntiBabysittingEngine,
  FORBIDDEN_BABYSITTING_PATTERNS
};

if (require.main === module) {
  const engine = new AntiBabysittingEngine();
  console.log('=== ANTI-BABYSITTING AUTONOMOUS ENGINE ===');
  const health = engine.runHealthAudit();
  console.log('Health Audit:', JSON.stringify(health, null, 2));

  // Test scan on a sample response
  const sample = "I have finished the tests. Let me know if you want me to merge PR #1800.";
  const audit = engine.auditTextForBabysitting(sample);
  console.log('\nAudit on sample text:', sample);
  console.log('Violations found:', JSON.stringify(audit.violations, null, 2));
}
