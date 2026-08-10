#!/usr/bin/env node
'use strict';

/**
 * AI Automation Offer Engine & NotebookLM Grounding Pipeline
 * Productizes internal workflows into 1-input -> 1-transform -> 1-output MVPs
 * with mandatory human-in-the-loop approval gates.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const OFFERS_DIR = path.join(HOME, '.ai-offers');

class AIAutomationOfferEngine {
  constructor(options = {}) {
    this.offersDir = options.offersDir || OFFERS_DIR;
    this.ensureDir();
  }

  ensureDir() {
    try {
      fs.mkdirSync(this.offersDir, { recursive: true });
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Build MVP specification matching the 1-input -> 1-transform -> 1-output architecture
   */
  generateMvpSpec(offerName, config = {}) {
    const spec = {
      title: `AI Automation Offer — ${offerName}`,
      createdAt: new Date().toISOString(),
      coreJob: {
        userInput: config.userInput || 'Source materials, audio transcript, or URL',
        transformation: config.transformation || 'Extract key facts, cite grounded sources, format structured draft',
        output: config.output || 'Reviewable proposal, article brief, or campaign spec',
      },
      nonNegotiables: [
        'Human approval before any external action (publish/send/charge)',
        'Inputs and outputs saved to local state DB/JSON',
        'Clear error state and retry action',
        'Simple audit log',
        'Desktop-first operator UI',
      ],
      deliverable14DayPlan: [
        'Day 1-3: 3-day workflow audit & 1-input MVP build',
        'Day 4-7: Human review gate & error state logging',
        'Day 8-10: Client pilot test with grounded sources',
        'Day 11-14: SOP documentation & client handoff',
      ],
    };

    const filePath = path.join(this.offersDir, `${offerName.toLowerCase().replace(/\s+/g, '-')}-spec.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), 'utf8');
    } catch (e) {
      // Ignore
    }

    return { spec, filePath };
  }
}

if (require.main === module) {
  const engine = new AIAutomationOfferEngine();
  const res = engine.generateMvpSpec('Affiliate Content Engine', {
    userInput: 'Product URL, YouTube transcript, client notes',
    transformation: 'Source-cited comparison outline & SEO brief',
    output: 'Draft article & email newsletter draft',
  });
  console.log('=== AI Automation MVP Spec Generated ===');
  console.log(JSON.stringify(res.spec, null, 2));
}

module.exports = {
  AIAutomationOfferEngine,
};
