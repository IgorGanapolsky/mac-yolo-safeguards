#!/usr/bin/env node
'use strict';

/**
 * Agent Harness Router — consolidates high-ROI ideas from:
 *
 * 1. TrueFoundry TrueForge (The NewStack): "the harness is the critical layer
 *    between the user, LLM, and everything else." Route model calls based on
 *    cost, latency, quality, and policy. Budget enforcement + rate limits via
 *    an AI Gateway pattern. Agent Development Life Cycle (ADLC): persistent
 *    sessions, tool credentials, sandboxes, context, human approvals, access
 *    policies, spending.
 *
 * 2. Martech "Turn scattered AI wins into an organizational advantage":
 *    power users discover good prompts/techniques but keep them in personal
 *    docs. We need discovery capture + a signal landing zone.
 *
 * 3. GLM-5.3 Anthropic Distillation (The NewStack): "Enterprises should avoid
 *    making their own model choices irreversible and build for portability."
 *    Don't trust vendor benchmarks; measure your own.
 *
 * 4. Futurism "ChatGPT Computer History": ChatGPT Desktop records clicks,
 *    keystrokes, events — fail-closed alternative that never captures local
 *    input, never stores unencrypted timelines, never ingests others' DMs.
 *
 * This is NOT ChatGPT Computer History. We never capture keystrokes, clicks,
 * or a timeline of local Mac activity.
 *
 * Architecture:
 *   - MODEL_REGISTRY: known models with cost/latency/quality/policy metadata
 *   - route(): optimal model for a task based on criteria
 *   - BudgetGuard: fail-closed $10/mo spending cap per operator
 *   - DiscoveryCapture: persist useful prompt/task patterns to a JSONL store
 *   - PrivateBenchmark: validate models on real tasks, not vendor benchmarks
 *   - PortabilityScore: track which models work best on which task types
 *
 * Constraint: Node.js built-ins only (fs, os, path, https, url). No npm deps.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const MODULE_NAME = 'agent-harness-router';
const SCHEMA = 'agent-harness-router/v1';
const DEFAULT_MONTHLY_CAP_USD = 10;
const DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');

// ─── MODEL REGISTRY ───────────────────────────────────────────────
// Models we know about, with cost/latency/quality/policy metadata.
// "provider" must be a FIRST_PARTY or VERIFIED_THIRD_PARTY operator.
// cost_per_1k_tokens is in USD (input/output).
// latency_ms is measured at the 80th percentile (warm).
// quality_score is 0-1 (higher is better).
// privacy is 'local' | 'fenced' | 'third_party'.
// Supports tools: whether the model supports tool calling.
const MODEL_REGISTRY = Object.freeze({
  'zai-org/glm-5.3': {
    provider: 'zai',
    cost_per_1k_tokens: { input: 0.0, output: 0.0 },
    latency_ms: 250,
    quality_score: 0.82,
    privacy: 'local',
    supportsTools: true,
    maxContext: 128000,
  },
  'zai-org/glm-5.3-coder': {
    provider: 'zai',
    cost_per_1k_tokens: { input: 0.1, output: 0.1 },
    latency_ms: 220,
    quality_score: 0.88,
    privacy: 'local',
    supportsTools: true,
    maxContext: 200000,
  },
  'openai/gpt-4.1': {
    provider: 'openai',
    cost_per_1k_tokens: { input: 2.0, output: 8.0 },
    latency_ms: 450,
    quality_score: 0.92,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 1000000,
  },
  'openai/gpt-4.1-mini': {
    provider: 'openai',
    cost_per_1k_tokens: { input: 0.4, output: 1.6 },
    latency_ms: 320,
    quality_score: 0.85,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 200000,
  },
  'openai/gpt-5.6-sol': {
    provider: 'openai',
    cost_per_1k_tokens: { input: 3.0, output: 12.0 },
    latency_ms: 650,
    quality_score: 0.95,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 1000000,
    serviceTier: 'ultrafast',
  },
  'anthropic/claude-3-5-sonnet': {
    provider: 'anthropic',
    cost_per_1k_tokens: { input: 3.0, output: 15.0 },
    latency_ms: 500,
    quality_score: 0.89,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 200000,
  },
  'anthropic/claude-3-5-haiku': {
    provider: 'anthropic',
    cost_per_1k_tokens: { input: 0.25, output: 1.25 },
    latency_ms: 280,
    quality_score: 0.78,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 200000,
  },
  'google/gemini-2.5-pro': {
    provider: 'google',
    cost_per_1k_tokens: { input: 1.0, output: 7.0 },
    latency_ms: 400,
    quality_score: 0.87,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 1000000,
  },
  'google/gemini-2.5-flash': {
    provider: 'google',
    cost_per_1k_tokens: { input: 0.1, output: 0.4 },
    latency_ms: 200,
    quality_score: 0.80,
    privacy: 'third_party',
    supportsTools: true,
    maxContext: 1000000,
  },
});

// First-party operators (no third-party data sharing)
const FIRST_PARTY_OPERATORS = Object.freeze([
  'zai',
  'zai-org',
  'openai-ultrafast',
]);

// Verified third-party operators trusted for production use
const VERIFIED_THIRD_PARTY_OPERATORS = Object.freeze([
  'openai',
  'anthropic',
  'google',
  'google-vertex',
  'openrouter.ai',
  'tavily',
]);

// Operators that should never receive sensitive data (per GLM-5.3 portability insight)
const SENSITIVE_DATA_RESTRICTED_OPERATORS = Object.freeze([
  'openai',
  'anthropic',
  'google',
]);

// Models that cost $0 (local/OSS)
const FREE_MODELS = new Set(['zai-org/glm-5.3']);

// ─── TASK CATEGORIES ─────────────────────────────────────────────
// Used for routing and benchmark portability scoring
const TASK_CATEGORIES = Object.freeze([
  'coding',
  'reasoning',
  'summarization',
  'classification',
  'creative',
  'data_extraction',
]);

// ─── ROUTING CRITERIA ────────────────────────────────────────────
const ROUTING_PREFERENCES = Object.freeze({
  cost: 'minimize spend',
  latency: 'minimize response time',
  quality: 'maximize output quality',
  privacy: 'prefer local/fenced',
  balance: 'weighted blend of cost/latency/quality',
});

// ─── DISCOVERY CAPTURE ────────────────────────────────────────────
// Captures useful prompt/task/model patterns — the Martech "scattered AI wins"
// problem: power users discover good patterns but keep them in personal docs.
// This provides the "signal landing zone" where discoveries become shareable.
const DISCOVERY_SCHEMA_VERSION = 'discovery/v1';

// ─── PRIVATE BENCHMARK ─────────────────────────────────────────────
// Per GLM-5.3: don't trust vendor benchmarks; measure your own.
const BENCHMARK_SCHEMA_VERSION = 'benchmark/v1';

// ─── FUNCTIONS ────────────────────────────────────────────────────

/**
 * Filter the model registry to only models that can handle a given task.
 * @param {object} task - { requiresTools, maxTokens, category, privacyRequired }
 * @returns {object[]} filtered model entries with modelId as key
 */
function filterModels(task) {
  const results = [];
  for (const [modelId, meta] of Object.entries(MODEL_REGISTRY)) {
    if (task.requiresTools && !meta.supportsTools) continue;
    if (task.maxTokens && task.maxTokens > meta.maxContext) continue;
    if (task.privacyRequired === 'local' && meta.privacy !== 'local') continue;
    if (task.privacyRequired === 'fenced' && meta.privacy === 'third_party') continue;
    results.push({ modelId, ...meta });
  }
  return results;
}

/**
 * Calculate effective cost per 1k tokens for a model, accounting for
 * budget guard status and free models.
 */
function effectiveCost(modelId, budgetGuard) {
  const meta = MODEL_REGISTRY[modelId];
  if (!meta) throw new Error(`Unknown model: ${modelId}`);
  if (FREE_MODELS.has(modelId)) return 0;

  // If budget guard is exhausted, third-party models are blocked
  if (budgetGuard && budgetGuard.isExhausted() && meta.privacy === 'third_party') {
    return Infinity;
  }

  const inputCost = meta.cost_per_1k_tokens.input;
  const outputCost = meta.cost_per_1k_tokens.output;
  // Assume 3:1 output-to-input ratio for estimation
  return (inputCost * 1 + outputCost * 3) / 4;
}

/**
 * Route a task to the best model based on criteria.
 * @param {object} task - { requiresTools, maxTokens, category, privacyRequired, priority }
 * @param {object} options - { preference: 'cost'|'latency'|'quality'|'privacy'|'balance', budgetGuard, portabilityScores }
 * @returns {{ modelId: string, reason: string, metadata: object }}
 */
function routeModel(task, options = {}) {
  const { preference = 'balance', budgetGuard, portabilityScores = {} } = options;

  const candidates = filterModels(task);

  if (candidates.length === 0) {
    // Fallback: any model, even if privacy is violated
    const fallback = Object.keys(MODEL_REGISTRY)[0];
    return {
      modelId: fallback,
      reason: 'No model satisfies all constraints; routing to first available',
      metadata: MODEL_REGISTRY[fallback],
      fallback: true,
    };
  }

  // Score each candidate
  const scored = candidates.map((m) => {
    let score = 0;
    const cost = effectiveCost(m.modelId, budgetGuard);

    switch (preference) {
      case 'cost':
        // Lower cost = higher score (invert and normalize)
        score = cost === Infinity ? 0 : 1 / (cost + 0.001);
        break;
      case 'latency':
        score = 1000 / (m.latency_ms || 1000);
        break;
      case 'quality':
        score = m.quality_score;
        break;
      case 'privacy':
        const privacyScore = { local: 3, fenced: 2, third_party: 1 };
        score = privacyScore[m.privacy] || 1;
        // If budget exhausted, third-party is impossible anyway
        if (cost === Infinity) score = 0;
        break;
      case 'balance':
      default: {
        // Weighted blend: 40% quality, 30% cost, 15% latency, 15% privacy
        const costScore = cost === Infinity ? 0 : 1 / (cost + 0.001);
        const latencyScore = 1000 / (m.latency_ms || 1000);
        const privacyScore = { local: 3, fenced: 2, third_party: 1 }[m.privacy] || 1;
        // Normalize cost score (higher cost = lower score)
        const normCost = costScore / (1 / 0.001 + 1);
        score =
          m.quality_score * 0.4 +
          normCost * 0.3 +
          (latencyScore / 1000) * 0.15 +
          (privacyScore / 3) * 0.15;
        break;
      }
    }

    // Apply portability boost: if this model has done well on similar tasks, boost it
    const portability = portabilityScores[m.modelId];
    if (portability && portability[task.category]) {
      score *= (1 + portability[task.category] * 0.1);
    }

    // Budget enforcement: block third-party if budget exhausted
    if (cost === Infinity) score = 0;

    return { ...m, score, cost };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return {
    modelId: best.modelId,
    score: best.score,
    reason: `preference=${preference}, score=${best.score.toFixed(4)}`,
    metadata: best,
  };
}

/**
 * BudgetGuard — fail-closed spending cap.
 * Per Anti-Babysitting + GLM-5.3: hard $10/mo cap, never exceed.
 */
class BudgetGuard {
  constructor(storageDir, monthlyCapUsd = DEFAULT_MONTHLY_CAP_USD) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    this.monthlyCapUsd = monthlyCapUsd;
    this.ledgerPath = path.join(this.storageDir, 'spend-ledger.jsonl');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.ledgerPath)) {
      fs.writeFileSync(this.ledgerPath, '');
    }
  }

  /**
   * Check if the budget is exhausted for the current billing period.
   * @returns {boolean}
   */
  isExhausted() {
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const spent = this.getSpent(currentMonth);
    return spent >= this.monthlyCapUsd;
  }

  /**
   * Get total spend for a given billing period (YYYY-MM).
   */
  getSpent(billingPeriod) {
    if (!fs.existsSync(this.ledgerPath)) return 0;
    const lines = fs
      .readFileSync(this.ledgerPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    let total = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.billingPeriod === billingPeriod) {
          total += entry.costUsd;
        }
      } catch {
        // skip malformed lines
      }
    }
    return total;
  }

  /**
   * Record a spend entry. Returns false if the budget would be exceeded.
   * @param {object} entry - { modelId, tokenCount, costUsd, billingPeriod }
   * @returns {boolean} true if recording succeeded, false if blocked
   */
  recordSpend(entry) {
    const now = new Date();
    const billingPeriod =
      entry.billingPeriod ||
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const currentSpent = this.getSpent(billingPeriod);
    if (currentSpent + entry.costUsd > this.monthlyCapUsd) {
      return false;
    }

    const record = {
      timestamp: entry.timestamp || new Date().toISOString(),
      modelId: entry.modelId,
      tokenCount: entry.tokenCount,
      costUsd: entry.costUsd,
      billingPeriod,
    };

    fs.appendFileSync(this.ledgerPath, JSON.stringify(record) + '\n');
    return true;
  }

  /**
   * Check if a proposed spend would be allowed.
   * @param {string} modelId
   * @param {number} estimatedCostUsd
   * @returns {{ allowed: boolean, spent: number, remaining: number, cap: number }}
   */
  checkBudget(modelId, estimatedCostUsd) {
    const now = new Date();
    const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const spent = this.getSpent(billingPeriod);
    const remaining = this.monthlyCapUsd - spent;
    const allowed = estimatedCostUsd <= remaining;
    return { allowed, spent, remaining, cap: this.monthlyCapUsd };
  }

  /**
   * Get summary stats.
   */
  getStats() {
    const now = new Date();
    const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const spent = this.getSpent(billingPeriod);
    return {
      monthlyCapUsd: this.monthlyCapUsd,
      spentUsd: spent,
      remainingUsd: this.monthlyCapUsd - spent,
      exhausted: this.isExhausted(),
      billingPeriod,
    };
  }
}

/**
 * DiscoveryCapture — captures useful prompt/task/model patterns from local
 * usage. Addresses the Martech "scattered AI wins" problem: power users discover
 * good prompts but keep them in personal docs. This is the "signal landing zone."
 */
class DiscoveryCapture {
  constructor(storageDir) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    this.discoveryPath = path.join(this.storageDir, 'discoveries.jsonl');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.discoveryPath)) {
      fs.writeFileSync(this.discoveryPath, '');
    }
  }

  /**
   * Capture a discovered pattern.
   * @param {object} entry - { prompt, modelId, taskType, outcome, userNotes, tags }
   * @returns {string} recordId
   */
  capture(entry) {
    const record = {
      schemaVersion: DISCOVERY_SCHEMA_VERSION,
      recordId: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      prompt: entry.prompt || '',
      modelId: entry.modelId || 'unknown',
      taskType: entry.taskType || 'general',
      outcome: entry.outcome || 'success',
      userNotes: entry.userNotes || '',
      tags: entry.tags || [],
      tokenCount: entry.tokenCount || 0,
      elapsedMs: entry.elapsedMs || 0,
    };

    // Refuse to capture anything that looks like a secret
    if (this.containsSecret(record.prompt) || this.containsSecret(record.userNotes)) {
      throw new Error('Discovery entry contains potential secret; capture refused');
    }

    // Refuse to capture keystroke data or input event logs
    if (this.looksLikeInputCapture(record)) {
      throw new Error('Discovery entry looks like input capture data; capture refused (fail-closed)');
    }

    fs.appendFileSync(this.discoveryPath, JSON.stringify(record) + '\n');
    return record.recordId;
  }

  /**
   * Query discoveries by tag, model, or task type.
   */
  query(filters = {}) {
    if (!fs.existsSync(this.discoveryPath)) return [];
    const lines = fs
      .readFileSync(this.discoveryPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());

    const results = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (this.matchesFilters(entry, filters)) {
          results.push(entry);
        }
      } catch {
        // skip malformed
      }
    }
    return results;
  }

  matchesFilters(entry, filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (entry[key] !== undefined) {
        if (Array.isArray(value)) {
          if (!value.includes(entry[key])) return false;
        } else if (entry[key] !== value) {
          return false;
        }
      }
    }
    return true;
  }

  containsSecret(text) {
    if (!text || typeof text !== 'string') return false;
    const secretPatterns = [
      /\bAKIA[0-9A-Z]{16}\b/, // AWS access key (AKIA + 16 chars)
      /\bghp_[a-zA-Z0-9]{36}\b/, // GitHub PAT (ghp_ + 36 chars)
      /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/i, // JWT
      /\b(Bearer\s+)[a-zA-Z0-9._-]{20,}/i, // Bearer token
      /\b[AKIA[0-9A-Z]{16}\b/, // AWS-style (loose: 16 chars from key set)
      /\bAWS_SECRET_ACCESS_KEY=/i,
      /\bSECRET_KEY=/i,
    ];
    return secretPatterns.some((re) => re.test(text));
  }

  looksLikeInputCapture(entry) {
    const suspicious = [
      'keystroke',
      'input_event',
      'click tracker',
      'eventtap',
      'event_log',
      'interaction_events',
      'computer_history',
      'activity_timeline',
    ];
    const blob = JSON.stringify(entry).toLowerCase();
    return suspicious.some((s) => blob.includes(s));
  }

  getStats() {
    if (!fs.existsSync(this.discoveryPath)) return { total: 0 };
    const lines = fs
      .readFileSync(this.discoveryPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    return { total: lines.length };
  }
}

/**
 * PrivateBenchmark — validate model performance on real tasks,
 * not vendor benchmarks (per GLM-5.3 article).
 * Tracks tokens and spend against tasks (cybersecurity or otherwise).
 */
class PrivateBenchmark {
  constructor(storageDir) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    this.benchmarkPath = path.join(this.storageDir, 'benchmarks.jsonl');
    this.resultsPath = path.join(this.storageDir, 'benchmark-results.jsonl');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.benchmarkPath)) {
      fs.writeFileSync(this.benchmarkPath, '');
    }
    if (!fs.existsSync(this.resultsPath)) {
      fs.writeFileSync(this.resultsPath, '');
    }
  }

  /**
   * Add a benchmark task.
   * @param {object} entry - { name, category, prompt, expectedOutput, tags }
   */
  addTask(entry) {
    const record = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      taskId: `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: entry.name,
      category: entry.category,
      prompt: entry.prompt,
      expectedOutput: entry.expectedOutput,
      tags: entry.tags || [],
      createdAt: new Date().toISOString(),
    };
    fs.appendFileSync(this.benchmarkPath, JSON.stringify(record) + '\n');
    return record.taskId;
  }

  /**
   * Record a benchmark result.
   * @param {object} entry - { taskId, modelId, actualOutput, tokenCount, costUsd, elapsedMs, passed }
   */
  recordResult(entry) {
    const record = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      resultId: `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      taskId: entry.taskId,
      modelId: entry.modelId,
      actualOutput: entry.actualOutput,
      tokenCount: entry.tokenCount || 0,
      costUsd: entry.costUsd || 0,
      elapsedMs: entry.elapsedMs || 0,
      passed: entry.passed,
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(this.resultsPath, JSON.stringify(record) + '\n');
    return record.resultId;
  }

  /**
   * Get benchmark results for a task, grouped by model.
   */
  getTaskResults(taskId) {
    if (!fs.existsSync(this.resultsPath)) return [];
    const lines = fs
      .readFileSync(this.resultsPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    const results = [];
    const tasks = this.getTasks();
    const taskNames = {};
    for (const t of tasks) {
      taskNames[t.taskId] = t.name;
    }
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.taskId === taskId) {
          results.push({ ...entry, taskName: taskNames[taskId] || 'unknown' });
        }
      } catch {
        // skip
      }
    }
    return results;
  }

  /**
   * Get all benchmark tasks.
   */
  getTasks() {
    if (!fs.existsSync(this.benchmarkPath)) return [];
    return fs
      .readFileSync(this.benchmarkPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Compute portable model rankings per category (GLM-5.3 portability insight).
   * Returns { category: { modelId: { passRate, avgCost, avgLatency } } }
   */
  getPortabilityScores() {
    if (!fs.existsSync(this.resultsPath)) return {};
    const lines = fs
      .readFileSync(this.resultsPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());

    const tasks = this.getTasks();
    const taskCategories = {};
    for (const t of tasks) {
      taskCategories[t.taskId] = t.category;
    }

    const byCategory = {};
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const category = taskCategories[entry.taskId] || 'unknown';
        if (!byCategory[category]) byCategory[category] = {};
        if (!byCategory[category][entry.modelId]) {
          byCategory[category][entry.modelId] = {
            passed: 0,
            total: 0,
            costSum: 0,
            latencySum: 0,
          };
        }
        const stats = byCategory[category][entry.modelId];
        stats.total++;
        if (entry.passed) stats.passed++;
        stats.costSum += entry.costUsd || 0;
        stats.latencySum += entry.elapsedMs || 0;
      } catch {
        // skip
      }
    }

    // Convert to scores
    for (const [category, models] of Object.entries(byCategory)) {
      for (const [modelId, stats] of Object.entries(models)) {
        const passRate = stats.total > 0 ? stats.passed / stats.total : 0;
        const avgCost = stats.total > 0 ? stats.costSum / stats.total : 0;
        const avgLatency = stats.total > 0 ? stats.latencySum / stats.total : 0;
        // Portability score: passRate * (1 - normalizedCost) * (1 - normalizedLatency)
        // Higher = better overall for this category
        byCategory[category][modelId] = {
          passRate,
          avgCost,
          avgLatency,
          portabilityScore: passRate * (1 / (avgCost + 0.001)) * (1000 / (avgLatency + 1)),
        };
      }
    }

    return byCategory;
  }

  getStats() {
    return {
      tasks: this.getTasks().length,
      results: fs.existsSync(this.resultsPath)
        ? fs.readFileSync(this.resultsPath, 'utf8').split('\n').filter((l) => l.trim()).length
        : 0,
    };
  }
}

/**
 * ModelRegistry — queryable model metadata for portability decisions.
 */
class ModelRegistry {
  getModels() {
    return Object.fromEntries(
      Object.entries(MODEL_REGISTRY).map(([id, meta]) => [id, { ...meta }])
    );
  }

  getModel(modelId) {
    return MODEL_REGISTRY[modelId];
  }

  /**
   * Check if a model is first-party (no third-party data sharing).
   */
  isFirstParty(modelId) {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) return false;
    return FIRST_PARTY_OPERATORS.includes(meta.provider);
  }

  /**
   * Check if a model is verified third-party.
   */
  isVerifiedThirdParty(modelId) {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) return false;
    return VERIFIED_THIRD_PARTY_OPERATORS.includes(meta.provider);
  }

  /**
   * Check if a model is safe for sensitive data.
   */
  isSafeForSensitiveData(modelId) {
    const meta = MODEL_REGISTRY[modelId];
    if (!meta) return false;
    return !SENSITIVE_DATA_RESTRICTED_OPERATORS.includes(meta.provider);
  }
}

// ─── CLI ──────────────────────────────────────────────────────────

/**
 * Format a routing decision as human-readable text.
 */
function formatRouteResult(result) {
  const lines = [
    `Selected: ${result.modelId}`,
    `  reason: ${result.reason}`,
    `  privacy: ${result.metadata.privacy}`,
    `  cost/1k: $${result.metadata.cost_per_1k_tokens.input} in / $${result.metadata.cost_per_1k_tokens.output} out`,
    `  latency: ${result.metadata.latency_ms}ms`,
    `  quality: ${result.metadata.quality_score}`,
    `  context: ${result.metadata.maxContext}`,
    `  tools: ${result.metadata.supportsTools ? 'yes' : 'no'}`,
  ];
  if (result.fallback) {
    lines.push(`  ⚠ FALLBACK: no model satisfied all constraints`);
  }
  return lines.join('\n');
}

/**
 * Main CLI entry point.
 */
function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'help';
  const rest = argv.slice(1);
  const json = rest.includes('--json');

  const storageDir = process.env.HARNESS_ROUTER_STORAGE_DIR || DEFAULT_STORAGE_DIR;
  const budgetGuard = new BudgetGuard(storageDir);
  const discovery = new DiscoveryCapture(storageDir);
  const benchmark = new PrivateBenchmark(storageDir);
  const registry = new ModelRegistry();

  if (cmd === 'route') {
    const task = JSON.parse(rest.find((a) => a.startsWith('{')) || '{}');
    const routes = routeModel(task, {
      preference: task.preference || 'balance',
      budgetGuard,
      portabilityScores: benchmark.getPortabilityScores(),
    });
    if (json) {
      console.log(JSON.stringify(routes, null, 2));
    } else {
      console.log(formatRouteResult(routes));
    }
    return routes;
  }

  if (cmd === 'check') {
    const stats = budgetGuard.getStats();
    const benchStats = benchmark.getStats();
    const discStats = discovery.getStats();
    const result = {
      budget: stats,
      benchmark: benchStats,
      discovery: discStats,
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Budget: $${stats.spentUsd}/${stats.cap} (remaining: $${stats.remainingUsd}, exhausted: ${stats.exhausted})`);
      console.log(`Benchmark: ${benchStats.tasks} tasks, ${benchStats.results} results`);
      console.log(`Discovery: ${discStats.total} captured patterns`);
    }
    return result;
  }

  if (cmd === 'discover') {
    const prompt = rest.find((a) => !a.startsWith('--'));
    if (!prompt) {
      console.error('Usage: agent-harness-router discover <prompt> --model <modelId> --task <taskType> --tags <tag1,tag2>');
      process.exit(1);
    }
    const modelId = rest.find((a) => a.startsWith('--model'))?.split('=')[1] || 'unknown';
    const taskType = rest.find((a) => a.startsWith('--task'))?.split('=')[1] || 'general';
    const tagsStr = rest.find((a) => a.startsWith('--tags'))?.split('=')[1] || '';
    const tags = tagsStr.split(',').filter(Boolean);
    const recordId = discovery.capture({ prompt, modelId, taskType, tags });
    if (json) {
      console.log(JSON.stringify({ recordId, schema: DISCOVERY_SCHEMA_VERSION }, null, 2));
    } else {
      console.log(`Captured discovery: ${recordId}`);
    }
    return { recordId };
  }

  if (cmd === 'benchmark') {
    const subCmd = rest[0];
    if (subCmd === 'add') {
      const name = rest.find((a) => a.startsWith('--name'))?.split('=')[1];
      const category = rest.find((a) => a.startsWith('--category'))?.split('=')[1];
      const prompt = rest.find((a) => a.startsWith('--prompt'))?.split('=')[1];
      const expected = rest.find((a) => a.startsWith('--expected'))?.split('=')[1];
      const taskId = benchmark.addTask({ name, category, prompt, expectedOutput: expected });
      console.log(`Added benchmark task: ${taskId}`);
      return { taskId };
    }
    if (subCmd === 'results') {
      const taskId = rest.find((a) => a.startsWith('--task-id'))?.split('=')[1];
      const results = taskId ? benchmark.getTaskResults(taskId) : [];
      console.log(JSON.stringify(results, null, 2));
      return { results };
    }
    if (subCmd === 'portability') {
      const scores = benchmark.getPortabilityScores();
      console.log(JSON.stringify(scores, null, 2));
      return { scores };
    }
    console.error('Usage: agent-harness-router benchmark <add|results|portability> [options]');
    process.exit(1);
  }

  if (cmd === 'registry') {
    const models = registry.getModels();
    if (json) {
      console.log(JSON.stringify(models, null, 2));
    } else {
      for (const [id, meta] of Object.entries(models)) {
        console.log(`${id} (${meta.privacy}, quality=${meta.quality_score}, latency=${meta.latency_ms}ms)`);
      }
    }
    return { models };
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`
Agent Harness Router v${SCHEMA}

Consolidates high-ROI ideas from:
  - TrueFoundry TrueForge (The NewStack): harness as control point, budget enforcement, ADLC
  - Martech: scattered AI discovery capture + signal landing zone
  - GLM-5.3 (The NewStack): private benchmark validation, model portability
  - Futurism: ChatGPT Computer History — fail-closed alternative (never captures keystrokes)

Usage:
  agent-harness-router route '{"requiresTools":true,"category":"coding"}' [--preference cost|latency|quality|privacy|balance]
  agent-harness-router check [--json]
  agent-harness-router discover <prompt> --model <modelId> --task <taskType> --tags <t1,t2>
  agent-harness-router benchmark add --name <name> --category <cat> --prompt <p> --expected <e>
  agent-harness-router benchmark results --task-id <id>
  agent-harness-router benchmark portability
  agent-harness-router registry [--json]

This is NOT ChatGPT Computer History. Never captures keystrokes, clicks,
or local Mac activity timelines.
`);
    return { help: true };
  }

  console.error(`Unknown command: ${cmd}`);
  console.error('Run: agent-harness-router help');
  process.exit(1);
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  SCHEMA,
  MODULE_NAME,
  MODEL_REGISTRY,
  FIRST_PARTY_OPERATORS,
  VERIFIED_THIRD_PARTY_OPERATORS,
  SENSITIVE_DATA_RESTRICTED_OPERATORS,
  FREE_MODELS,
  TASK_CATEGORIES,
  ROUTING_PREFERENCES,
  DISCOVERY_SCHEMA_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  DEFAULT_MONTHLY_CAP_USD,
  DEFAULT_STORAGE_DIR,
  filterModels,
  effectiveCost,
  routeModel,
  BudgetGuard,
  DiscoveryCapture,
  PrivateBenchmark,
  ModelRegistry,
  formatRouteResult,
  main,
};

if (require.main === module) {
  main();
}
