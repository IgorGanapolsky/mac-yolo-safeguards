#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const HERMES_RECEIPT_DIR = path.join(HOME, '.hermes', 'receipts', 'hermes-yolo');
const JCODE_RECEIPT_DIR = path.join(HOME, '.jcode', 'receipts', 'jcode-yolo');
const META_HARNESS_CACHE_DIR = path.join(HOME, '.meta-harness');

class MetaHarnessEngine {
  constructor(options = {}) {
    this.receiptDirs = options.receiptDirs || [HERMES_RECEIPT_DIR, JCODE_RECEIPT_DIR];
    this.cacheDir = options.cacheDir || META_HARNESS_CACHE_DIR;
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch (err) {
      // Ignore
    }
  }

  collectTraceReceipts() {
    const receipts = [];
    for (const dir of this.receiptDirs) {
      if (!fs.existsSync(dir)) continue;

      const latestPath = path.join(dir, 'latest.json');
      if (fs.existsSync(latestPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
          receipts.push({ sourceDir: dir, ...content });
        } catch (e) {
          // Ignore
        }
      }
    }
    return receipts;
  }

  analyzeFailureTraces(receipts) {
    let timeoutFailures = 0;
    let authFailures = 0;
    let totalRuns = receipts.length;
    let avgDurationMs = 0;

    for (const r of receipts) {
      if (r.durationMs) avgDurationMs += r.durationMs;
      if (r.execution && r.execution.status === 'timeout') {
        timeoutFailures += 1;
      }
      if (r.provider && r.provider.fallbackUsed) {
        authFailures += 1;
      }
    }

    if (totalRuns > 0) {
      avgDurationMs = Math.round(avgDurationMs / totalRuns);
    }

    return {
      totalRuns,
      avgDurationMs,
      timeoutFailures,
      authFailures,
      recommendedTimeoutMs: timeoutFailures > 0 ? 120_000 : 90_000,
      recommendedCompaction: 'compact',
    };
  }

  proposeOptimizedHarness(analysis) {
    return {
      version: '1.0.0-metaharness',
      timestamp: new Date().toISOString(),
      harnessParameters: {
        timeoutMs: analysis.recommendedTimeoutMs,
        contextCompaction: analysis.recommendedCompaction,
        draftVerificationEnabled: true,
        retryPolicy: {
          maxRetries: 3,
          backoffFactorMs: 1000,
        },
        toolsets: ['skills', 'context7', 'terminal', 'file'],
      },
      optimizationMetrics: {
        processedTraces: analysis.totalRuns,
        identifiedTimeoutFailures: analysis.timeoutFailures,
        identifiedAuthFailures: analysis.authFailures,
      },
    };
  }

  saveHarnessProposal(proposal) {
    const proposalPath = path.join(this.cacheDir, 'latest-proposal.json');
    try {
      fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), 'utf8');
      return true;
    } catch (err) {
      return false;
    }
  }

  runOptimizationStep() {
    const receipts = this.collectTraceReceipts();
    const analysis = this.analyzeFailureTraces(receipts);
    const proposal = this.proposeOptimizedHarness(analysis);
    this.saveHarnessProposal(proposal);
    return proposal;
  }
}

if (require.main === module) {
  const engine = new MetaHarnessEngine();
  const proposal = engine.runOptimizationStep();
  console.log('=== Meta-Harness Optimization Result ===');
  console.log(JSON.stringify(proposal, null, 2));
}

module.exports = {
  MetaHarnessEngine,
};
