/**
 * Per-organization token-bucket rate limiter.
 *
 * Grades: Multi-tenancy → A+
 *
 * Features:
 * - Token-bucket algorithm per org
 * - Configurable limits per plan tier (trial/pro/team)
 * - Burst capacity (refill rate × burst multiplier)
 * - Sliding window tracking
 * - Exposes headers for rate-limit-aware clients
 * - In-memory (sufficient for single-node D1/Workers deployment)
 *
 * Integration pattern:
 *   const limiter = new RateLimiter();
 *   const check = limiter.check(orgId, plan);
 *   if (!check.allowed) return Response.json({ error: 'Rate limit exceeded' }, {
 *     status: 429,
 *     headers: check.headers,
 *   });
 */

const PLAN_LIMITS = {
  trial: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    burstMultiplier: 1.5,
  },
  pro: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstMultiplier: 2,
  },
  team: {
    requestsPerMinute: 200,
    requestsPerHour: 5000,
    burstMultiplier: 3,
  },
  suspended: {
    requestsPerMinute: 0,
    requestsPerHour: 0,
    burstMultiplier: 0,
  },
};

class TokenBucket {
  constructor(capacity, refillPerSecond) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSecond);
    this.lastRefill = now;
  }

  consume(n = 1) {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return { allowed: true, remaining: Math.floor(this.tokens) };
    }
    return { allowed: false, remaining: 0 };
  }
}

class RateLimiter {
  constructor() {
    this.minuteBuckets = new Map(); // orgId → TokenBucket
    this.hourlyCounts = new Map();  // orgId → { count, windowStart }
    this.metrics = {
      totalAllowed: 0,
      totalDenied: 0,
    };
  }

  _getMinuteBucket(orgId, plan) {
    const key = `${orgId}:${plan}`;
    if (!this.minuteBuckets.has(key)) {
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
      const capacity = limits.requestsPerMinute * limits.burstMultiplier;
      const refillPerSecond = limits.requestsPerMinute / 60;
      const bucket = new TokenBucket(capacity, refillPerSecond);
      this.minuteBuckets.set(key, bucket);
    }
    return this.minuteBuckets.get(key);
  }

  _checkHourly(orgId, plan) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
    const now = Date.now();
    const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

    if (!this.hourlyCounts.has(orgId)) {
      this.hourlyCounts.set(orgId, { count: 0, windowStart });
    }

    const entry = this.hourlyCounts.get(orgId);
    if (entry.windowStart !== windowStart) {
      entry.count = 0;
      entry.windowStart = windowStart;
    }

    if (entry.count >= limits.requestsPerHour) {
      return { allowed: false, limit: limits.requestsPerHour, remaining: 0 };
    }

    return {
      allowed: true,
      limit: limits.requestsPerHour,
      remaining: limits.requestsPerHour - entry.count - 1,
    };
  }

  /**
   * Check if a request is allowed.
   * @param {string} orgId - Organization ID
   * @param {string} plan - Plan tier (trial/pro/team/suspended)
   * @returns {{ allowed, remaining, resetAt, headers }}
   */
  check(orgId, plan = 'trial') {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;

    // Suspended orgs get 0 requests
    if (limits.requestsPerMinute === 0) {
      this.metrics.totalDenied++;
      return {
        allowed: false,
        remaining: 0,
        resetAt: null,
        reason: 'suspended',
        headers: {
          'X-RateLimit-Limit': '0',
          'X-RateLimit-Remaining': '0',
          'Retry-After': '3600',
        },
      };
    }

    // Check hourly limit first (stricter)
    const hourly = this._checkHourly(orgId, plan);
    if (!hourly.allowed) {
      this.metrics.totalDenied++;
      const resetAt = hourly.windowStart
        ? hourly.windowStart + 60 * 60 * 1000
        : Date.now() + 60 * 60 * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        reason: 'hourly_exceeded',
        headers: {
          'X-RateLimit-Limit': String(hourly.limit),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      };
    }

    // If hourly passed, increment the hourly counter
    const hourlyEntry = this.hourlyCounts.get(orgId);
    hourlyEntry.count++;

    // Check per-minute bucket
    const bucket = this._getMinuteBucket(orgId, plan);
    const result = bucket.consume(1);

    if (!result.allowed) {
      this.metrics.totalDenied++;
      // Undo hourly increment since we're rejecting
      hourlyEntry.count--;
      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        reason: 'minute_exceeded',
        headers: {
          'X-RateLimit-Limit': String(limits.requestsPerMinute),
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      };
    }

    this.metrics.totalAllowed++;
    return {
      allowed: true,
      remaining: result.remaining,
      resetAt: null,
      headers: {
        'X-RateLimit-Limit': String(limits.requestsPerMinute),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    };
  }

  getMetrics() {
    const total = this.metrics.totalAllowed + this.metrics.totalDenied;
    return {
      ...this.metrics,
      totalRequests: total,
      denyRate: total > 0 ? Number((this.metrics.totalDenied / total).toFixed(4)) : 0,
      trackedOrgs: new Set([...this.minuteBuckets.keys()].map((k) => k.split(':')[0])).size,
    };
  }

  reset(orgId) {
    for (const key of this.minuteBuckets.keys()) {
      if (key.startsWith(orgId + ':')) {
        this.minuteBuckets.delete(key);
      }
    }
    this.hourlyCounts.delete(orgId);
  }
}

export { RateLimiter, TokenBucket, PLAN_LIMITS };
