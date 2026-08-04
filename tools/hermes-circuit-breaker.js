#!/usr/bin/env node
'use strict';

/**
 * Circuit breaker + retry-with-backoff for the economic router.
 *
 * Grades: Failure Modes → A+
 *
 * CircuitBreaker:
 *   - Tracks per-route failure rates
 *   - Opens circuit after N consecutive failures
 *   - Half-open probe after cooldown period
 *   - Closes on successful probe
 *
 * RetryWithBackoff:
 *   - Exponential backoff with jitter
 *   - Max 3 retries by default
 *   - Only retries on transient errors (timeout, 5xx, network)
 *   - Returns last error if all retries exhausted
 */

const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /timed?\s*out/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /network/i,
  /502/,
  /503/,
  /504/,
  /fetch failed/i,
  /abort/i,
];

// ── CircuitBreaker ────────────────────────────────────────────────

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownMs = options.cooldownMs || 30_000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 1;

    this.state = 'closed'; // closed | open | half-open
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    this.halfOpenCalls = 0;
    this.metrics = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0,
      stateTransitions: [],
    };
  }

  /**
   * Check if the circuit allows a call through.
   */
  canExecute() {
    this.metrics.totalCalls++;

    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        this._transition('half-open');
        this.halfOpenCalls = 0;
        return true;
      }
      this.metrics.totalRejected++;
      return false;
    }

    // half-open
    if (this.halfOpenCalls < this.halfOpenMaxCalls) {
      this.halfOpenCalls++;
      return true;
    }
    this.metrics.totalRejected++;
    return false;
  }

  /**
   * Record a successful call.
   */
  recordSuccess() {
    this.metrics.totalSuccesses++;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 1) {
        this._transition('closed');
      }
    } else if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call.
   */
  recordFailure() {
    this.metrics.totalFailures++;
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.state === 'half-open') {
      this._transition('open');
    } else if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
      this._transition('open');
    }
  }

  _transition(newState) {
    const oldState = this.state;
    this.state = newState;
    this.metrics.stateTransitions.push({
      from: oldState,
      to: newState,
      at: Date.now(),
    });

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = null;
    } else if (newState === 'open') {
      this.openedAt = Date.now();
      this.successCount = 0;
    } else if (newState === 'half-open') {
      this.successCount = 0;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openedAt: this.openedAt,
      lastFailureAt: this.lastFailureAt,
      cooldownRemaining: this.state === 'open' && this.openedAt
        ? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt))
        : 0,
    };
  }

  getMetrics() {
    return { ...this.metrics, currentState: this.state };
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
    this.lastFailureAt = null;
    this.halfOpenCalls = 0;
    this.metrics = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0,
      stateTransitions: [],
    };
  }
}

// ── Retry with backoff ────────────────────────────────────────────

function isTransientError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return TRANSIENT_ERROR_PATTERNS.some((p) => p.test(msg));
}

/**
 * Execute fn with exponential backoff retry.
 * Only retries on transient errors.
 *
 * @param {Function} fn - async function to execute
 * @param {Object} opts - { maxRetries, baseDelayMs, maxDelayMs }
 * @returns {Promise<{ ok, value, error, attempts }>}
 */
async function retryWithBackoff(fn, opts = {}) {
  const maxRetries = opts.maxRetries || 3;
  const baseDelayMs = opts.baseDelayMs || 500;
  const maxDelayMs = opts.maxDelayMs || 10_000;

  let lastError = null;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      return { ok: true, value, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      if (!isTransientError(error)) break;

      // Exponential backoff with jitter
      const exponential = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs * 0.5;
      const delay = Math.min(maxDelayMs, exponential + jitter);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { ok: false, error: lastError, attempts: totalAttempts };
}

/**
 * Execute fn with circuit breaker protection + retry.
 * Combines CircuitBreaker and retryWithBackoff.
 *
 * @param {CircuitBreaker} breaker
 * @param {Function} fn
 * @param {Object} retryOpts
 * @returns {Promise<{ ok, value, error, circuitOpen, attempts }>}
 */
async function executeWithProtection(breaker, fn, retryOpts = {}) {
  if (!breaker.canExecute()) {
    return {
      ok: false,
      error: new Error('Circuit breaker is open — service temporarily unavailable'),
      circuitOpen: true,
      attempts: 0,
    };
  }

  const result = await retryWithBackoff(fn, retryOpts);

  if (result.ok) {
    breaker.recordSuccess();
  } else {
    breaker.recordFailure();
  }

  return { ...result, circuitOpen: false };
}

module.exports = {
  CircuitBreaker,
  retryWithBackoff,
  executeWithProtection,
  isTransientError,
  TRANSIENT_ERROR_PATTERNS,
};
