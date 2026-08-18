#!/usr/bin/env node
'use strict';

/**
 * AI Profit Boardroom (Julian Goldie) Community Engagement & Monetization Engine
 *
 * Automates:
 * 1. Community question classification & intent scoring
 * 2. High-signal technical architecture response generation
 * 3. Structured client acquisition & Stripe payment link routing ($499 / $2,500/mo)
 * 4. Interaction history & deduplication ledger
 */

const fs = require('fs');
const path = require('path');

const MONETIZATION_OFFERS = {
  RAPID_AUDIT: {
    name: '1-Day Rapid AI Implementation & Architecture Audit',
    priceUsd: 499,
    checkoutUrl: 'https://buy.stripe.com/5kQ00j3Ug6zcbO95e33sI3B',
    description: 'Direct 1-on-1 architecture overhaul, fixing broken agent loops, webhooks, and rate limits within 24 hours.'
  },
  MANAGED_RETAINER: {
    name: 'Managed Autonomous AI Operations Retainer',
    priceUsd: 2500,
    checkoutUrl: 'https://buy.stripe.com/3cIfZhfCYbTwg4p8qf3sI3L',
    description: 'Full-stack enterprise AI agent infrastructure, continuous governance, and automated revenue pipelines.'
  },
  THUMBGATE_SAAS: {
    name: 'ThumbGate Autonomous Safety & Governance',
    priceUsd: 49,
    checkoutUrl: 'https://thumbgate.app',
    description: 'Real-time pre-action interdiction, model cost guards, and multi-agent coordination.'
  }
};

class SkoolAIProfitLabEngine {
  constructor(options = {}) {
    this.ledgerPath = options.ledgerPath || path.join(__dirname, '../docs/vault/Projects/Skool-AI-Profit-Lab/interaction_ledger.json');
    this.interactions = this.loadLedger();
  }

  loadLedger() {
    try {
      if (fs.existsSync(this.ledgerPath)) {
        return JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
      }
    } catch (e) {
      // Fall back to empty ledger
    }
    return [];
  }

  saveLedger() {
    try {
      const dir = path.dirname(this.ledgerPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.ledgerPath, JSON.stringify(this.interactions, null, 2), 'utf8');
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Analyze incoming post/question text and determine buyer intent and technical category
   */
  classifyPost(post) {
    const text = String(post.body || post.text || post.title || '').toLowerCase();
    const author = post.author || 'Anonymous Member';

    let category = 'GENERAL_DISCUSSION';
    let intentScore = 1; // 1-10 scale
    let recommendedOffer = MONETIZATION_OFFERS.THUMBGATE_SAAS;

    if (/hire|looking for (a )?dev|pay|budget|need someone to build|freelance/i.test(text)) {
      category = 'DIRECT_HIRING';
      intentScore = 10;
      recommendedOffer = MONETIZATION_OFFERS.MANAGED_RETAINER;
    } else if (/broken|error|stuck|failed|timeout|rate limit|429|bug|not working/i.test(text)) {
      category = 'TROUBLESHOOTING_PAIN';
      intentScore = 8;
      recommendedOffer = MONETIZATION_OFFERS.RAPID_AUDIT;
    } else if (/how (do|can) (i|we)|agent os|n8n|make\.com|langgraph|autogen|crewai|claude code/i.test(text)) {
      category = 'TECHNICAL_HOWTO';
      intentScore = 6;
      recommendedOffer = MONETIZATION_OFFERS.RAPID_AUDIT;
    } else if (/win|revenue|client|closed|mrr|success/i.test(text)) {
      category = 'COMMUNITY_WIN';
      intentScore = 3;
      recommendedOffer = MONETIZATION_OFFERS.MANAGED_RETAINER;
    }

    return {
      author,
      category,
      intentScore,
      recommendedOffer,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate high-value, authority-building response that provides full value upfront
   */
  generateResponse(post, classification) {
    const { category, recommendedOffer } = classification;
    const author = classification.author;

    let response = '';

    if (category === 'TROUBLESHOOTING_PAIN') {
      response = `Hey @${author}! 👋\n\nThis is usually caused by unhandled rate-limiting or async state drift in the execution loop.\n\nHere is how we solve this in production:\n1. Wrap your API dispatcher in an exponential backoff with jitter (initial: 500ms, factor: 2x, max: 8s).\n2. Isolate state in an atomic worker process rather than keeping dirty state in memory.\n3. Add a circuit breaker to fail-closed when error rate exceeds 15%.\n\nHope that helps! If you want our team to audit and bulletproof your entire pipeline in 24h, you can check our setup audit here: ${recommendedOffer.checkoutUrl}`;
    } else if (category === 'DIRECT_HIRING') {
      response = `Hey @${author}! 👋 We build and manage enterprise autonomous AI agents and automated revenue pipelines.\n\nWe can handle your full architecture from multi-model routing to live webhook execution. You can check our managed retainer here: ${recommendedOffer.checkoutUrl} or shoot me a DM with your specs!`;
    } else {
      response = `Hey @${author}! Solid question. When structuring Agent OS workflows, the key is decoupling the reasoning planner from the deterministic execution tools.\n\n1. Use structured JSON output for all tool definitions.\n2. Keep your KV cache hit rate high by freezing prefix prompts.\n3. Implement pre-action validation gates to prevent hallucinated tool loops.\n\nLet me know if you want to see a working code template!`;
    }

    return response;
  }

  /**
   * Record engagement event to ledger
   */
  recordEngagement(postId, author, response, classification) {
    const entry = {
      postId,
      author,
      category: classification.category,
      intentScore: classification.intentScore,
      offerPresented: classification.recommendedOffer.name,
      responseSummary: response.slice(0, 100) + '...',
      timestamp: new Date().toISOString()
    };
    this.interactions.push(entry);
    this.saveLedger();
    return entry;
  }
}

module.exports = {
  SkoolAIProfitLabEngine,
  MONETIZATION_OFFERS
};

if (require.main === module) {
  const engine = new SkoolAIProfitLabEngine();
  const sample = {
    author: 'Mark_AgencyOwner',
    title: 'My n8n Claude agent keeps getting 429 rate limits and crashing during lead scraping',
    body: 'Anyone know how to fix this? The workflow dies halfway through and loses state.'
  };
  const classification = engine.classifyPost(sample);
  const response = engine.generateResponse(sample, classification);
  console.log('--- SAMPLE CLASSIFICATION ---');
  console.log(JSON.stringify(classification, null, 2));
  console.log('\n--- SAMPLE RESPONSE ---');
  console.log(response);
}
