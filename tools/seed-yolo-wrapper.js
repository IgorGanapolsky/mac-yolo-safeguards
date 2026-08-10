#!/usr/bin/env node
'use strict';

/**
 * seed-yolo — Zero-Spend Autonomous ByteDance Seed 2.1 / Volcengine CLI Wrapper
 * (Part of mac-yolo-safeguards fleet: hermes-yolo, jcode-yolo, grok-yolo, seed-yolo)
 * Harnesses ByteDance Seed 2.1 adaptive thinking engine and ark-cli for high-ROI autonomous execution.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { Seed21AdaptiveThinkingEngine } = require('./seed21-adaptive-thinking-engine');
const { ArkCliHarness } = require('./ark-cli-harness');

const HOME = os.homedir();
const SEED_RECEIPT_DIR = process.env.SEED_YOLO_RECEIPT_DIR || path.join(HOME, '.seed', 'receipts', 'seed-yolo');

class SeedYoloWrapper {
  constructor(options = {}) {
    this.adaptiveEngine = new Seed21AdaptiveThinkingEngine(options);
    this.arkHarness = new ArkCliHarness(options);
    this.receiptDir = options.receiptDir || SEED_RECEIPT_DIR;
    this.ensureReceiptDir();
  }

  ensureReceiptDir() {
    try {
      fs.mkdirSync(this.receiptDir, { recursive: true });
    } catch (err) {
      // Ignore
    }
  }

  /**
   * Run seed-yolo CLI command
   */
  run(args = [], options = {}) {
    const startTime = Date.now();
    const prompt = args.join(' ').trim() || 'Reply with SEED-YOLO-READY';

    // 1. Calculate Adaptive Thinking Budget
    const thinkingAllocation = this.adaptiveEngine.allocateThinkingBudget({
      prompt,
      taskName: 'seed-yolo-execution',
    });

    // 2. Execute via Volcengine Ark CLI harness
    const arkResult = this.arkHarness.executeTask(prompt, {
      model: 'seed-2.1-pro',
      thinkingConfig: thinkingAllocation,
    });

    const durationMs = Date.now() - startTime;

    // 3. Write Execution Receipt
    const receipt = {
      timestamp: new Date().toISOString(),
      durationMs,
      prompt,
      model: 'seed-2.1-pro',
      thinkingAllocation,
      execution: {
        status: arkResult.status,
        executedVia: arkResult.executedVia,
      },
    };

    const latestReceiptPath = path.join(this.receiptDir, 'latest.json');
    try {
      fs.writeFileSync(latestReceiptPath, JSON.stringify(receipt, null, 2), 'utf8');
    } catch (err) {
      // Ignore
    }

    return {
      exitCode: 0,
      stdout: arkResult.stdout || `[seed-yolo] Done in ${durationMs}ms model=seed-2.1-pro mode=${thinkingAllocation.thinkingMode}`,
      receipt,
    };
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const wrapper = new SeedYoloWrapper();
  const res = wrapper.run(args);
  console.log(res.stdout);
  process.exit(res.exitCode);
}

module.exports = {
  SeedYoloWrapper,
};
