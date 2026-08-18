#!/usr/bin/env node
'use strict';

/**
 * Tieline Product Contract & Blast Radius Engine
 *
 * Implements:
 * 1. Reviewed Source of Truth for Product Behavior (Feature Contracts)
 * 2. Product-Level Blast Radius Computation for Code Changes
 * 3. Contract-to-Code-to-Test Traceability Matrix
 * 4. Pre-PR Invariant Validation Gates
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONTRACTS = [
  {
    featureId: 'FEATURE_HOSTING_MODE',
    name: 'ThumbGate Hosting Selector (Cloud vs Local)',
    description: 'Allows users to choose between 24/7 ThumbGate Cloud VPS and private $0.00 local execution.',
    acceptanceCriteria: [
      'Cloud option highlights 24/7 continuous autonomous PR governance and telemetry',
      'Local option guarantees code and secrets never leave the user machine ($0.00 local LLM spend)',
      'Provides a "Need help deciding?" helper and accessible keyboard/click controls'
    ],
    codeFiles: [
      'apps/hermes-control-plane/app/components/HostingSelector.tsx',
      'apps/hermes-control-plane/app/page.tsx'
    ],
    testFiles: [
      'apps/hermes-control-plane/tests/hosting-selector.test.mjs',
      'apps/hermes-control-plane/tests/rendered-html.test.mjs'
    ]
  },
  {
    featureId: 'FEATURE_BILLING_GATE',
    name: 'Stripe SaaS & Retainer Billing Gates',
    description: 'Enforces strictly authenticated checkout, pricing tiers, and webhook interdiction.',
    acceptanceCriteria: [
      '$10/mo hosted trial and $2,500/mo managed retainer checkout links must remain valid',
      'Zero unauthenticated access to paid workspace telemetry',
      'Stripe webhook signatures verified before state mutation'
    ],
    codeFiles: [
      'apps/hermes-control-plane/app/BillingPlan.tsx',
      'apps/hermes-control-plane/app/api/billing/checkout/route.ts',
      'apps/hermes-control-plane/app/api/billing/webhook/route.ts',
      'tools/skool-ai-profit-lab-engine.js'
    ],
    testFiles: [
      'apps/hermes-control-plane/tests/frictionless-onboarding.test.mjs',
      'tests/test-skool-ai-profit-lab.js'
    ]
  },
  {
    featureId: 'FEATURE_ECONOMIC_ROUTER',
    name: 'Hermes Economic Model Router & Budget Guard',
    description: 'Routes tasks to local zero-cost models first, enforcing a strict $10/mo API cap.',
    acceptanceCriteria: [
      'Defaults to local Ollama / GLM-5.3 coding plan before paid cloud endpoints',
      'Fails closed immediately if monthly metered spend exceeds $10.00 limit',
      'Never silently fall back to degraded models when high-intelligence model is locked'
    ],
    codeFiles: [
      'tools/hermes-economic-router.js',
      'tools/glm53-coding-plan-harness.js',
      'tools/vellum-ai-engine.js'
    ],
    testFiles: [
      'tests/test-glm53-coding-plan.js',
      'tests/test-vellum-ai-engine.js'
    ]
  },
  {
    featureId: 'FEATURE_DIGITAL_EMPLOYEE',
    name: 'AI Digital Employee Profile & Mobile Control Center',
    description: 'Presents always-on agents as digital workers with live triggers, metrics, and mobile approvals.',
    acceptanceCriteria: [
      'Displays worker ID, role, uptime days, trigger count, and task count',
      'Action Required banner highlights pending human-in-the-loop gates',
      'Download center links directly to App Store, Google Play, and one-click Linux daemon installer'
    ],
    codeFiles: [
      'apps/hermes-control-plane/app/components/AiEmployeeCard.tsx',
      'apps/hermes-control-plane/app/components/DownloadCenter.tsx'
    ],
    testFiles: [
      'apps/hermes-control-plane/tests/qoder-improvements.test.mjs'
    ]
  }
];

class TielineProductContractEngine {
  constructor(options = {}) {
    this.contracts = options.contracts || DEFAULT_CONTRACTS;
  }

  /**
   * List all registered product contracts
   */
  getContracts() {
    return this.contracts;
  }

  /**
   * Calculate the product-level blast radius for a list of changed files
   */
  computeBlastRadius(changedFiles = []) {
    const normalizedChanged = changedFiles.map(f => f.replace(/^\.\//, ''));
    const affectedContracts = [];
    const requiredTests = new Set();

    for (const contract of this.contracts) {
      const matchedFiles = contract.codeFiles.filter(cf =>
        normalizedChanged.some(changed => changed.includes(cf) || cf.includes(changed))
      );

      if (matchedFiles.length > 0) {
        affectedContracts.push({
          featureId: contract.featureId,
          name: contract.name,
          description: contract.description,
          acceptanceCriteria: contract.acceptanceCriteria,
          matchedFiles
        });

        contract.testFiles.forEach(t => requiredTests.add(t));
      }
    }

    return {
      changedFilesCount: changedFiles.length,
      impactedFeaturesCount: affectedContracts.length,
      affectedContracts,
      requiredTests: Array.from(requiredTests)
    };
  }

  /**
   * Validate that all required verification test files exist on disk
   */
  verifyContractIntegrity(baseDir = path.join(__dirname, '..')) {
    const issues = [];

    for (const contract of this.contracts) {
      for (const f of contract.codeFiles) {
        const full = path.join(baseDir, f);
        if (!fs.existsSync(full)) {
          issues.push(`Contract ${contract.featureId}: Missing code file ${f}`);
        }
      }
      for (const t of contract.testFiles) {
        const full = path.join(baseDir, t);
        if (!fs.existsSync(full)) {
          issues.push(`Contract ${contract.featureId}: Missing test file ${t}`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      totalContracts: this.contracts.length,
      issues
    };
  }
}

module.exports = {
  TielineProductContractEngine,
  DEFAULT_CONTRACTS
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const engine = new TielineProductContractEngine();

  if (args.includes('--list-contracts')) {
    console.log('=== TIELINE PRODUCT CONTRACTS ===');
    console.log(JSON.stringify(engine.getContracts(), null, 2));
  } else if (args.includes('--verify')) {
    console.log('=== VERIFYING CONTRACT INTEGRITY ===');
    const res = engine.verifyContractIntegrity();
    console.log(JSON.stringify(res, null, 2));
  } else {
    // Blast radius demo
    const sampleChanges = [
      'apps/hermes-control-plane/app/components/HostingSelector.tsx',
      'tools/hermes-economic-router.js'
    ];
    console.log('=== COMPUTING SAMPLE BLAST RADIUS ===');
    console.log('Changed Files:', sampleChanges);
    const radius = engine.computeBlastRadius(sampleChanges);
    console.log(JSON.stringify(radius, null, 2));
  }
}
