/**
 * Per-organization token-bucket rate limiting (Worker-safe, no Node require).
 * Logic mirrors tools/hermes-rate-limiter.js for single-node D1/Workers deploys.
 */

type PlanTier = "trial" | "pro" | "team" | "suspended" | string;

const PLAN_LIMITS: Record<
  string,
  { requestsPerMinute: number; requestsPerHour: number; burstMultiplier: number }
> = {
  trial: { requestsPerMinute: 10, requestsPerHour: 100, burstMultiplier: 1.5 },
  pro: { requestsPerMinute: 60, requestsPerHour: 1000, burstMultiplier: 2 },
  team: { requestsPerMinute: 200, requestsPerHour: 5000, burstMultiplier: 3 },
  suspended: { requestsPerMinute: 0, requestsPerHour: 0, burstMultiplier: 0 },
};

class TokenBucket {
  capacity: number;
  refillPerSecond: number;
  tokens: number;
  lastRefill: number;

  constructor(capacity: number, refillPerSecond: number) {
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

  consume(n = 1): { allowed: boolean; remaining: number } {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return { allowed: true, remaining: Math.floor(this.tokens) };
    }
    return { allowed: false, remaining: 0 };
  }
}

class RateLimiter {
  minuteBuckets = new Map<string, TokenBucket>();
  hourlyCounts = new Map<string, { count: number; windowStart: number }>();
  metrics = { totalAllowed: 0, totalDenied: 0 };

  _getMinuteBucket(orgId: string, plan: PlanTier) {
    const key = `${orgId}:${plan}`;
    if (!this.minuteBuckets.has(key)) {
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
      const capacity = limits.requestsPerMinute * limits.burstMultiplier;
      const refillPerSecond = limits.requestsPerMinute / 60;
      this.minuteBuckets.set(key, new TokenBucket(capacity, refillPerSecond));
    }
    return this.minuteBuckets.get(key)!;
  }

  _checkHourly(orgId: string, plan: PlanTier) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
    const now = Date.now();
    const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    if (!this.hourlyCounts.has(orgId)) {
      this.hourlyCounts.set(orgId, { count: 0, windowStart });
    }
    const entry = this.hourlyCounts.get(orgId)!;
    if (entry.windowStart !== windowStart) {
      entry.count = 0;
      entry.windowStart = windowStart;
    }
    if (entry.count >= limits.requestsPerHour) {
      return {
        allowed: false as const,
        limit: limits.requestsPerHour,
        remaining: 0,
        windowStart: entry.windowStart,
      };
    }
    return {
      allowed: true as const,
      limit: limits.requestsPerHour,
      remaining: limits.requestsPerHour - entry.count - 1,
      windowStart: entry.windowStart,
    };
  }

  check(orgId: string, plan: PlanTier = "trial") {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
    if (limits.requestsPerMinute === 0) {
      this.metrics.totalDenied++;
      return {
        allowed: false,
        remaining: 0,
        resetAt: null as number | null,
        reason: "suspended",
        headers: {
          "X-RateLimit-Limit": "0",
          "X-RateLimit-Remaining": "0",
          "Retry-After": "3600",
        },
      };
    }

    const hourly = this._checkHourly(orgId, plan);
    if (!hourly.allowed) {
      this.metrics.totalDenied++;
      const resetAt = hourly.windowStart + 60 * 60 * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        reason: "hourly_exceeded",
        headers: {
          "X-RateLimit-Limit": String(hourly.limit),
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      };
    }

    const hourlyEntry = this.hourlyCounts.get(orgId)!;
    hourlyEntry.count++;
    const bucket = this._getMinuteBucket(orgId, plan);
    const result = bucket.consume(1);
    if (!result.allowed) {
      this.metrics.totalDenied++;
      hourlyEntry.count--;
      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        reason: "minute_exceeded",
        headers: {
          "X-RateLimit-Limit": String(limits.requestsPerMinute),
          "X-RateLimit-Remaining": "0",
          "Retry-After": "60",
        },
      };
    }

    this.metrics.totalAllowed++;
    return {
      allowed: true,
      remaining: result.remaining,
      resetAt: null as number | null,
      headers: {
        "X-RateLimit-Limit": String(limits.requestsPerMinute),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    };
  }
}

const limiter = new RateLimiter();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number | null;
  reason?: string;
  headers: Record<string, string>;
}

export function checkRateLimit(orgKey: string, plan: string): RateLimitResult {
  return limiter.check(orgKey, plan);
}
