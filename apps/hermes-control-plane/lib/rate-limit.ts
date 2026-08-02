/**
 * A+ Multi-tenancy: per-organization rate limiting.
 */

import { RateLimiter } from "./hermes-rate-limiter.js";

interface RateLimitRawResult {
  allowed: boolean;
  remaining: number;
  resetAt: number | null;
  reason?: string;
  headers: Record<string, string>;
}

const limiter = new (RateLimiter as new () => {
  check: (orgId: string, plan: string) => RateLimitRawResult;
})();

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
