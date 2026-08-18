#!/usr/bin/env node
'use strict';

/**
 * wright-sdlc-engine.js — Opinionated Agentic SDLC & Phased Work Order Gate Engine
 * --------------------------------------------------------------------------------
 * Stolen from the "Wrights" Agentic SDLC Pattern (August 2026):
 *   - Phased Work Orders: SPEC -> BUILD -> TEST -> CI_CD -> OBSERVABILITY
 *   - Role-Specific Gatekeepers ("Wrights"):
 *       1. Coordinator: Creates work order, verifies startup DAG.
 *       2. Product Wright: Validates specifications and Acceptance Criteria (AC).
 *       3. Build Wright: Implements code changes in isolated worktrees.
 *       4. Testing Wright: Validates ACs and runs automated test suites.
 *       5. CI/CD Wright: Enforces green required checks and squash auto-merge.
 *       6. Observability Wright: Validates post-deploy live canary & health metrics.
 *   - Pragmatic Gate Automation: Auto-passes deterministic gates while recording immutable audit receipts.
 *
 * Usage:
 *   node tools/wright-sdlc-engine.js --doctor
 *   node tools/wright-sdlc-engine.js --demo
 *   node tools/wright-sdlc-engine.js --json
 */

const fs = require('fs');
const path = require('path');

const SDLC_PHASES = ['SPEC', 'BUILD', 'TEST', 'CI_CD', 'OBSERVABILITY', 'CLOSED'];

class WorkOrder {
  constructor(id, title, metadata = {}) {
    this.id = id || `WO-${Date.now()}`;
    this.title = title || 'Autonomous Feature Work Order';
    this.currentPhase = 'SPEC';
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.metadata = metadata;
    this.phases = {
      SPEC: { status: 'PENDING', wright: 'Product Wright', proofs: [], completedAt: null },
      BUILD: { status: 'PENDING', wright: 'Build Wright', proofs: [], completedAt: null },
      TEST: { status: 'PENDING', wright: 'Testing Wright', proofs: [], completedAt: null },
      CI_CD: { status: 'PENDING', wright: 'CI/CD Wright', proofs: [], completedAt: null },
      OBSERVABILITY: { status: 'PENDING', wright: 'Observability Wright', proofs: [], completedAt: null },
      CLOSED: { status: 'PENDING', wright: 'Coordinator', proofs: [], completedAt: null },
    };
  }

  /**
   * Passes the gate for the current phase with verifiable proof.
   * @param {string} phase
   * @param {object} proof
   */
  passGate(phase, proof = {}) {
    if (this.currentPhase !== phase) {
      throw new Error(`Cannot pass gate for ${phase}: current active phase is ${this.currentPhase}`);
    }
    const record = this.phases[phase];
    record.status = 'PASSED';
    record.completedAt = new Date().toISOString();
    record.proofs.push({ timestamp: record.completedAt, ...proof });

    const nextIndex = SDLC_PHASES.indexOf(phase) + 1;
    if (nextIndex < SDLC_PHASES.length) {
      this.currentPhase = SDLC_PHASES[nextIndex];
      this.phases[this.currentPhase].status = 'IN_PROGRESS';
    }
    this.updatedAt = new Date().toISOString();
    return this;
  }

  /**
   * Fails the current gate with an error reason.
   */
  failGate(phase, reason) {
    if (this.phases[phase]) {
      this.phases[phase].status = 'BLOCKED';
      this.phases[phase].error = reason;
      this.phases[phase].failedAt = new Date().toISOString();
    }
    this.updatedAt = new Date().toISOString();
    return this;
  }

  /**
   * Checks if all required development and release gates have passed.
   */
  isFullyVerified() {
    return (
      this.phases.SPEC.status === 'PASSED' &&
      this.phases.BUILD.status === 'PASSED' &&
      this.phases.TEST.status === 'PASSED' &&
      this.phases.CI_CD.status === 'PASSED' &&
      this.phases.OBSERVABILITY.status === 'PASSED'
    );
  }

  exportReceipt() {
    return {
      workOrderId: this.id,
      title: this.title,
      currentPhase: this.currentPhase,
      isFullyVerified: this.isFullyVerified(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      phases: this.phases,
    };
  }
}

class WrightSDLCEngine {
  constructor() {
    this.roles = {
      Coordinator: 'Creates work-order plan, orchestrates phase execution DAG.',
      'Product Wright': 'Formulates spec, acceptance criteria, and product blueprints.',
      'Build Wright': 'Implements code changes in isolated worktrees.',
      'Testing Wright': 'Validates acceptance criteria against unit and E2E test suites.',
      'CI/CD Wright': 'Enforces 100% green CI checks and automated squash merge.',
      'Observability Wright': 'Judges post-deploy production health, canaries, and latency telemetry.',
    };
  }

  createWorkOrder(id, title, metadata) {
    const wo = new WorkOrder(id, title, metadata);
    wo.phases.SPEC.status = 'IN_PROGRESS';
    return wo;
  }

  /**
   * Simulates an end-to-end autonomous work order flow.
   */
  runDemoWorkOrder() {
    const wo = this.createWorkOrder('WO-DEMO-20260818', 'Multi-Tier Cloud Runner Resilient Fallback');

    // 1. Product Wright passes SPEC
    wo.passGate('SPEC', { acList: ['Must intercept 429 quota exhaustion', 'Must fail over to secondary provider in <500ms'], specApproved: true });

    // 2. Build Wright passes BUILD
    wo.passGate('BUILD', { commitSha: 'f925898c2', filesChanged: ['services/hermes-cloud-runner/server.js'] });

    // 3. Testing Wright passes TEST
    wo.passGate('TEST', { testSuite: 'services/hermes-cloud-runner/test/server.test.js', testsPassed: 6, testsFailed: 0 });

    // 4. CI/CD Wright passes CI_CD
    wo.passGate('CI_CD', { prNumber: 1826, requiredChecksCount: 19, autoMergeEnabled: true });

    // 5. Observability Wright passes OBSERVABILITY
    wo.passGate('OBSERVABILITY', { endpoint: 'https://igor-hermes-cloud-runner.fly.dev/health', statusCode: 200, latencyMs: 226 });

    // 6. Coordinator closes
    wo.passGate('CLOSED', { closedBy: 'Coordinator', finalStatus: 'SHIPPED_TO_PRODUCTION' });

    return wo;
  }
}

function runDoctor() {
  const engine = new WrightSDLCEngine();
  return {
    engine: 'wright-sdlc-engine',
    status: 'READY',
    stolenFrom: 'Wrights Agentic SDLC & Phased Work Order Pattern (August 2026)',
    activeWrightRoles: Object.keys(engine.roles),
    supportedPhases: SDLC_PHASES,
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const engine = new WrightSDLCEngine();

  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[wright-sdlc] Status: ${doc.status}`);
    console.log(`[wright-sdlc] Wright Roles: ${doc.activeWrightRoles.join(', ')}`);
    console.log(`[wright-sdlc] Phases: ${doc.supportedPhases.join(' -> ')}`);
    process.exit(0);
  }

  if (args.includes('--demo')) {
    const demo = engine.runDemoWorkOrder();
    console.log(`\n=== Executing Wrights Work Order: ${demo.title} ===`);
    for (const [phase, data] of Object.entries(demo.phases)) {
      const icon = data.status === 'PASSED' ? '🟢' : data.status === 'IN_PROGRESS' ? '🟡' : '⚪';
      console.log(`${icon} [${phase}] Wright: ${data.wright} -> ${data.status} ${data.completedAt ? `(${data.completedAt})` : ''}`);
    }
    console.log(`\nWork Order Fully Verified: ${demo.isFullyVerified() ? 'YES (100% Green)' : 'NO'}`);
    process.exit(0);
  }

  if (args.includes('--json')) {
    const demo = engine.runDemoWorkOrder();
    console.log(JSON.stringify(demo.exportReceipt(), null, 2));
    process.exit(0);
  }

  console.log('Usage: wright-sdlc [--doctor] [--demo] [--json]');
}

module.exports = {
  WorkOrder,
  WrightSDLCEngine,
  runDoctor,
  SDLC_PHASES,
};
