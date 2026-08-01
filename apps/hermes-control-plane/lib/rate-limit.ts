/**
 * A+ Multi-tenancy: per-organization rate limiting.
 *
 * Thin TypeScript wrapper around `hermes-rate-limiter.js`.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RateLimiter } = require("../../tools/hermes-rate-limiter.js") as {
  RateLimiter: new () => RateLimiterInstance;
};

interface RateLimitRawResult {
  allowed: boolean;
  remaining: number;
  resetAt: number | null;
  reason?: string;
  headers: Record<string, string>;
}

interface RateLimiterInstance {
  check: (orgId: string, plan: string) => RateLimitRawResult;
  getMetrics: () => Record<string, unknown>;
  reset: (orgId: string) => void;
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
