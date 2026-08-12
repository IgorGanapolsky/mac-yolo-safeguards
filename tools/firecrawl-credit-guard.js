#!/usr/bin/env node
'use strict';

/**
 * firecrawl-credit-guard.js — Firecrawl Web Egress & Credit Interdiction Guard.
 * Protects Igor's Firecrawl free credit quota (1,000 monthly credits):
 * 1. Blocks automated Firecrawl API calls when credit threshold hits 50%+
 * 2. Redirects web extraction requests to zero-cost local Cheerio/HTTP scrapers
 * 3. Prevents auto-upgrade to paid $19/mo Hobby plan
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const GUARD_STATE_PATH = path.join(HOME, '.hermes', 'firecrawl-credit-guard-state.json');

class FirecrawlCreditGuard {
  constructor(options = {}) {
    this.statePath = options.statePath || GUARD_STATE_PATH;
    this.monthlyLimit = options.monthlyLimit || 1000;
    this.warningThresholdPct = options.warningThresholdPct || 50;
  }

  loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      }
    } catch (e) {
      // Fallback
    }
    return {
      usedCredits: 500, // 50% default warning state from alert
      monthlyLimit: 1000,
      smartUpgradeEnabled: false,
      lastUpdated: new Date().toISOString(),
    };
  }

  saveState(state) {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      // Ignore
    }
  }

  evaluateRequest(url = '', requestType = 'scrape') {
    const state = this.loadState();
    const usedPct = (state.usedCredits / state.monthlyLimit) * 100;
    const isOverWarning = usedPct >= this.warningThresholdPct;

    if (isOverWarning && !process.env.FIRECRAWL_FORCE_PAID) {
      return {
        allowFirecrawlApi: false,
        recommendedAction: 'LOCAL_CHEERIO_SCRAPE',
        reason: `Firecrawl quota at ${usedPct.toFixed(1)}% (${state.usedCredits}/${state.monthlyLimit} credits). Interdicting remote API to prevent $19/mo auto-upgrade.`,
        fallbackCommand: `node tools/local-web-scraper.js --url "${url}"`,
      };
    }

    return {
      allowFirecrawlApi: true,
      recommendedAction: 'FIRECRAWL_API',
      usedPct,
    };
  }
}

function main() {
  const guard = new FirecrawlCreditGuard();
  console.log('🛡️ Firecrawl Credit & Billing Guard Probe:');
  const result = guard.evaluateRequest('https://example.com', 'scrape');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  FirecrawlCreditGuard,
};
