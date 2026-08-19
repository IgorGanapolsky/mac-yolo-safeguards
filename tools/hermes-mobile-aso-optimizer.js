#!/usr/bin/env node
'use strict';

/**
 * hermes-mobile-aso-optimizer.js
 *
 * Automated Google Play Store & Apple App Store ASO Optimizer & Feature Gap Validator.
 * Addresses Issue #1469 (Competitor 'Hermes Agent Client' ranking dominance).
 *
 * Enforces:
 *  1. Google Play Character Limits: Title <= 30 chars, Short Desc <= 80 chars, Full Desc <= 4000 chars.
 *  2. High-Intent Keyword Insertion: 'hermes agent client', 'AI leash', 'claude code mobile', 'remote agent'.
 *  3. Unique Differentiator Scoring: Highlights ThumbGate Pre-Action Leash, Lock-Screen Approvals, & $0 Local AI.
 *  4. Fastlane / Metadata JSON export for automated Play Console deployment.
 */

const fs = require('fs');
const path = require('path');

const MAX_TITLE_LEN = 30;
const MAX_SHORT_DESC_LEN = 80;
const MAX_FULL_DESC_LEN = 4000;

const TARGET_KEYWORDS = [
  'hermes agent client',
  'hermes agent',
  'ai leash',
  'claude code mobile',
  'agent approvals',
  'remote agent',
];

const UNIQUE_DIFFERENTIATORS = [
  'thumbgate',
  'lock-screen',
  'approvals',
  'local-first',
  'privacy',
  'spend limit',
];

const DEFAULT_LISTING = {
  title: 'Hermes Agent Client: AI Leash',
  shortDescription: 'Chat, code & approve your Mac AI agents from anywhere. You hold the leash.',
  fullDescription: `Chat, code, and control your Mac's autonomous AI agents on the go with Hermes Agent Client.

Designed for developers running Hermes, Claude Code, and local AI agent fleets. Whether you are walking away from your desk or commuting, Hermes keeps you connected to your terminal workflows with total control.

⚡ KEY CAPABILITIES
• Remote Agent Chat & Coding: Inspect file changes, run test suites, and prompt your desktop agents in real-time.
• ThumbGate AI Leash: Never worry about rogue agent spending or runaway execution. Approve or deny protected actions with one tap.
• Lock-Screen Action Approvals: Receive push alerts for terminal commands, financial transactions, and PR merges.
• Multi-Model Switching: Switch instantly between local Apple Silicon models (Ollama, GLM-5.3, Qwen) and cloud specialists.
• Real-Time Token & Spend Analytics: Track API token consumption and ensure you stay under budget ceilings.
• Direct Wi-Fi & Tailscale Connectivity: Peer-to-peer, encrypted connection directly to your Mac. Zero third-party cloud surveillance.

🔒 PRIVACY-FIRST & ZERO DATA LEAKS
Your terminal session transcripts, code files, and credentials never touch external proxy servers. You hold the encryption keys and the leash.

Built for the Nous Research Hermes Agent ecosystem.`,
};

class AsoOptimizer {
  constructor(listing = DEFAULT_LISTING) {
    this.listing = { ...listing };
  }

  /**
   * Validates character lengths against Google Play Store policies.
   */
  validateLengths() {
    const errors = [];
    if (!this.listing.title || this.listing.title.length > MAX_TITLE_LEN) {
      errors.push(`Title must be 1-${MAX_TITLE_LEN} chars (got ${this.listing.title?.length || 0})`);
    }
    if (!this.listing.shortDescription || this.listing.shortDescription.length > MAX_SHORT_DESC_LEN) {
      errors.push(`Short description must be 1-${MAX_SHORT_DESC_LEN} chars (got ${this.listing.shortDescription?.length || 0})`);
    }
    if (!this.listing.fullDescription || this.listing.fullDescription.length > MAX_FULL_DESC_LEN) {
      errors.push(`Full description must be 1-${MAX_FULL_DESC_LEN} chars (got ${this.listing.fullDescription?.length || 0})`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Evaluates keyword presence and density.
   */
  evaluateKeywords() {
    const combined = `${this.listing.title} ${this.listing.shortDescription} ${this.listing.fullDescription}`.toLowerCase();
    const matches = [];
    for (const kw of TARGET_KEYWORDS) {
      if (combined.includes(kw.toLowerCase())) {
        matches.push(kw);
      }
    }
    const coverage = matches.length / TARGET_KEYWORDS.length;
    return {
      keywordMatches: matches,
      keywordCoverage: Number(coverage.toFixed(2)),
      isOptimized: coverage >= 0.6,
    };
  }

  /**
   * Scores unique value prop differentiation against rival basic clients.
   */
  scoreDifferentiation() {
    const text = this.listing.fullDescription.toLowerCase();
    const differentiatorsPresent = UNIQUE_DIFFERENTIATORS.filter(d => text.includes(d));
    const score = (differentiatorsPresent.length / UNIQUE_DIFFERENTIATORS.length) * 100;
    return {
      differentiatorsPresent,
      differentiationScore: Math.round(score),
      isStrongWedge: score >= 60,
    };
  }

  /**
   * Generates Play Console fastlane metadata structure.
   */
  exportFastlaneMetadata(outputDir) {
    if (!outputDir) return null;
    const localeDir = path.join(outputDir, 'fastlane', 'metadata', 'android', 'en-US');
    fs.mkdirSync(localeDir, { recursive: true });

    fs.writeFileSync(path.join(localeDir, 'title.txt'), this.listing.title.trim(), 'utf8');
    fs.writeFileSync(path.join(localeDir, 'short_description.txt'), this.listing.shortDescription.trim(), 'utf8');
    fs.writeFileSync(path.join(localeDir, 'full_description.txt'), this.listing.fullDescription.trim(), 'utf8');

    return { exported: true, localeDir };
  }
}

module.exports = {
  AsoOptimizer,
  DEFAULT_LISTING,
  MAX_TITLE_LEN,
  MAX_SHORT_DESC_LEN,
  MAX_FULL_DESC_LEN,
};

if (require.main === module) {
  const opt = new AsoOptimizer();
  console.log('Length validation:', opt.validateLengths());
  console.log('Keyword evaluation:', opt.evaluateKeywords());
  console.log('Differentiation score:', opt.scoreDifferentiation());
}
