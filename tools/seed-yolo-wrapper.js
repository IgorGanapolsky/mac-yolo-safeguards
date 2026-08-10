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

    // 2. Execute via Volcengine Ark CLI harness or fallback to Hermes Agent Engine
    const arkResult = this.arkHarness.executeTask(prompt, {
      model: 'seed-2.1-pro',
      thinkingConfig: thinkingAllocation,
    });

    let stdout = arkResult.stdout;

    if (arkResult.executedVia === 'ark-cli-harness-fallback') {
      const hermesWrapperPath = path.join(__dirname, '..', 'hermes-yolo-wrapper.js');
      const hermesEnv = {
        ...process.env,
        HERMES_YOLO_MODEL: process.env.HERMES_YOLO_MODEL || 'bytedance/seed-2.1-pro',
        HERMES_YOLO_BACKEND: 'hermes',
        SEED_21_THINKING_MODE: thinkingAllocation.thinkingMode,
        SEED_21_THINKING_BUDGET: String(thinkingAllocation.allocatedBudgetTokens),
      };
      const res = spawnSync(process.execPath, [hermesWrapperPath, ...args], {
        encoding: 'utf8',
        stdio: 'inherit',
        env: hermesEnv,
      });
      const fallbackReceipt = {
        timestamp: new Date().toISOString(),
        prompt,
        model: 'seed-2.1-pro',
        thinkingAllocation,
        execution: { status: res.status === 0 ? 'pass' : 'fail', executedVia: 'hermes-agent-seed-2.1' },
      };
      try {
        fs.writeFileSync(path.join(this.receiptDir, 'latest.json'), JSON.stringify(fallbackReceipt, null, 2), 'utf8');
      } catch (err) { /* ignore */ }
      return {
        exitCode: res.status !== null ? res.status : 0,
        stdout: '',
        receipt: fallbackReceipt,
      };
    }

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
      stdout: stdout || `[seed-yolo] Done in ${durationMs}ms model=seed-2.1-pro mode=${thinkingAllocation.thinkingMode}`,
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
