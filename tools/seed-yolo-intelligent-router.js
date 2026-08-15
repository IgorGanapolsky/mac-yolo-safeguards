#!/usr/bin/env node
'use strict';

/**
 * seed-yolo-intelligent-router.js — Intelligent Model Routing for Seed-Yolo
 * -----------------------------------------------------------------------------
 * Provides intelligent model routing based on prompt intent for the seed-yolo CLI.
 * Inspired by Rubrik Mythos learnings: AI models outperform human security engineers
 * at vulnerability hunting (Mythos 5: 83.8%, GLM-5.3: 84.5% on CyberGym).
 *
 * Usage:
 *   const { classifyPrompt, selectOptimalModel } = require('./tools/seed-yolo-intelligent-router');
 *   const route = selectOptimalModel("scan for security vulnerabilities");
 *   // => { model: 'glm-5.3', provider: 'zai', costClass: 'subscription' }
 */

// Model capability matrix with CyberGym scores
const MODEL_ROSTER = {
  glm53: {
    id: 'glm53',
    provider: 'zai',
    model: 'glm-5.3',
    costClass: 'subscription',
    estimatedCostUsd: 0.00,
    contextTokens: 1000000,
    cyberGymScore: '84.5%',
    strengths: ['cyber', 'security', 'vulnerability', 'audit', 'cve', 'sanitize', 'exploit', 'injection',
                'csrf', 'xss', 'sqli', 'rce', 'privilege', 'auth', 'jwt', 'breach', 'penetration'],
  },
  grok45: {
    id: 'grok45',
    provider: 'grok-build',
    model: 'grok-4.5',
    costClass: 'oauth_quota',
    estimatedCostUsd: 0.00,
    contextTokens: 500000,
    cyberGymScore: '78.2%',
    strengths: ['verify', 'check', 'validate', 'proof', 'confirm', 'debug', 'analysis', 'review'],
  },
  claude37: {
    id: 'claude37',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-5',
    costClass: 'metered',
    estimatedCostUsd: 2.00,
    contextTokens: 1000000,
    strengths: ['architecture', 'framework', 'migration', 'design', 'specification', 'large-refactor'],
  },
  seed_turbo: {
    id: 'seed_turbo',
    provider: 'openrouter',
    model: 'bytedance-seed/seed-2-1-turbo',
    costClass: 'metered_cheap',
    estimatedCostUsd: 0.20,
    contextTokens: 128000,
    strengths: ['quick', 'fast', 'boilerplate', 'helper', 'script', 'test', 'regex', 'patch'],
  },
  qwen_local: {
    id: 'qwen_local',
    provider: 'ollama',
    model: 'qwen3.5:9b-hermes-64k',
    costClass: 'local',
    estimatedCostUsd: 0.00,
    contextTokens: 65536,
    strengths: ['local', 'offline', 'zero-spend', 'test', 'dry-run'],
  },
};

// Regex patterns for prompt classification
const PATTERNS = {
  security: /\b(security|vulnerability|audit|cve|cwe|sanitize|exploit|injection|csrf|xss|sqli|rce|privilege.?escalation|auth.?bypass|jwt|penetration.?test|threat.?model|owasp|clickjacking|idor|ssrf|malicious|payload|security.?flaw|breach|taint|scan)\b/i,
  verify: /\b(verify|check|validate|ensure|proof|confirm|double.?check|review|second.?opinion)\b/i,
  architecture: /\b(architecture|framework|migration|design.?system|multi.?file|specification|large.?refactor|rewrit|eject|redesign)\b/i,
  video: /\b(video|cinematic|scene|shot|animation|render|3d|visual|multimodal)\b/i,
  fast: /\b(quick|fast|simple|boilerplate|helper|one.?line|typo|fix|patch|snippet|unit.?test)\b/i,
  gpt: /\b(gpt[- ]?5|chatgpt|openai)\b/i,
};

/**
 * Classify prompt intent and return optimal model route
 * @param {string} prompt - The user prompt to classify
 * @param {Object} options - Options (budgetAllowed, zaiKey, openrouterKey)
 * @returns {Object} Route information with model, provider, costClass, etc.
 */
function selectOptimalModel(prompt = '', options = {}) {
  const { budgetAllowed = true, zaiKey = false, openrouterKey = false } = options;
  
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) {
    return { ...MODEL_ROSTER.glm53, reason: 'default-flagship-coding-plan' };
  }

  // Security/Cyber patterns -> GLM-5.3 (84.5% CyberGym - best for security)
  if (PATTERNS.security.test(text)) {
    if (zaiKey) {
      return { ...MODEL_ROSTER.glm53, reason: 'cyber-security-audit-glm53-84.5%-cybergym' };
    }
    if (openrouterKey) {
      return { ...MODEL_ROSTER.seed_turbo, reason: 'cyber-security-fallback-to-seed-with-budget' };
    }
    return { ...MODEL_ROSTER.qwen_local, reason: 'cyber-security-fallback-to-local' };
  }

  // Verification patterns -> Grok 4.5 (second opinion)
  if (PATTERNS.verify.test(text)) {
    if (openrouterKey) {
      return { ...MODEL_ROSTER.grok45, reason: 'verification-second-opinion-grok' };
    }
    return { ...MODEL_ROSTER.glm53, reason: 'verification-fallback-to-glm53' };
  }

  // Architecture patterns -> Claude 3.7
  if (PATTERNS.architecture.test(text)) {
    if (openrouterKey) {
      return { ...MODEL_ROSTER.claude37, reason: 'architecture-design-claude-3-7' };
    }
    return { ...MODEL_ROSTER.seed_turbo, reason: 'architecture-fallback-to-seed' };
  }

  // Video patterns -> Seed with video context
  if (PATTERNS.video.test(text)) {
    return { ...MODEL_ROSTER.seed_turbo, reason: 'multimodal-video-request' };
  }

  // Fast routine patterns -> Seed Turbo
  if (PATTERNS.fast.test(text)) {
    if (openrouterKey) {
      return { ...MODEL_ROSTER.seed_turbo, reason: 'fast-boilerplate-seed-turbo' };
    }
    return { ...MODEL_ROSTER.qwen_local, reason: 'fast-fallback-to-local' };
  }

  // Explicit GPT request -> GPT Sol
  if (PATTERNS.gpt.test(text)) {
    return { ...MODEL_ROSTER.glm53, reason: 'explicit-gpt-fallback-to-glm53' };
  }

  // Default -> GLM-5.3 (best all-around coding, 84.5% CyberGym)
  return { ...MODEL_ROSTER.glm53, reason: 'default-flagship-coding-plan' };
}

function classifyPrompt(prompt = '') {
  const route = selectOptimalModel(prompt);
  return {
    routeId: route.id,
    model: `${route.provider}/${route.model}`,
    provider: route.provider,
    costClass: route.costClass,
    cyberGymScore: route.cyberGymScore,
    estimatedCostUsd: route.estimatedCostUsd,
    reason: route.reason,
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === '--doctor' || args[0] === 'doctor') {
    console.log(JSON.stringify({
      service: 'seed-yolo Intelligent Router',
      status: 'READY',
      modelRoster: Object.keys(MODEL_ROSTER),
      defaultRoute: MODEL_ROSTER.glm53.model,
      cyberGymScore: MODEL_ROSTER.glm53.cyberGymScore,
      patterns: Object.keys(PATTERNS),
    }, null, 2));
    process.exit(0);
  }
  
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`seed-yolo-intelligent-router.js — Intelligent Model Routing

Usage:
  node tools/seed-yolo-intelligent-router.js "prompt"  # Classify prompt
  node tools/seed-yolo-intelligent-router.js --doctor   # Health check

Routing Logic:
  Security/Cyber prompts      -> GLM-5.3 (84.5% CyberGym)
  Verification/Review         -> Grok 4.5 (second opinion)
  Architecture/Migration      -> Claude 3.7 Sonnet 5
  Quick/Helper/Boilerplate    -> Seed 2.1 Turbo
  Video/Multimodal            -> Seed 2.1 Turbo with vision
  Default                     -> GLM-5.3 (flagship coding)

Options:
  ZAI_KEY present              -> GLM-5.3 available for cyber tasks
  OPENROUTER_KEY present       -> All paid models available
  Budget exhausted             -> Falls back to local/zero-cost
`);
    process.exit(0);
  }
  
  const prompt = args.join(' ');
  const result = classifyPrompt(prompt);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  MODEL_ROSTER,
  PATTERNS,
  selectOptimalModel,
  classifyPrompt,
};