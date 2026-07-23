import { cloudTaskLimit } from "./agent-governance";
import { hasCloudContinuationAccess } from "./entitlements";

export const CONTINUITY_USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Extra Continuity runs granted by one pack purchase (when pack price is configured). */
export const CONTINUITY_PACK_RUNS = 50;

export type ContinuityUsageSnapshot = {
  used: number;
  baseLimit: number;
  bonus: number;
  limit: number;
  remaining: number;
  windowDays: number;
  periodStart: number;
  cloudAccess: boolean;
  plan: string;
  packConfigured: boolean;
  packRuns: number;
};

export function continuityBaseLimit(plan: string): number {
  return cloudTaskLimit(plan);
}

export function buildContinuityUsage(input: {
  plan: string;
  trialEndsAt: number | null;
  used: number;
  bonus?: number | null;
  packConfigured?: boolean;
  now?: number;
}): ContinuityUsageSnapshot {
  const now = input.now ?? Date.now();
  const cloudAccess = hasCloudContinuationAccess(
    { plan: input.plan, trialEndsAt: input.trialEndsAt },
    now,
  );
  const baseLimit = cloudAccess ? continuityBaseLimit(input.plan) : 0;
  const bonus = Math.max(0, Math.floor(Number(input.bonus) || 0));
  const limit = baseLimit + bonus;
  const used = Math.max(0, Math.floor(Number(input.used) || 0));
  return {
    used,
    baseLimit,
    bonus,
    limit,
    remaining: Math.max(0, limit - used),
    windowDays: 30,
    periodStart: now - CONTINUITY_USAGE_WINDOW_MS,
    cloudAccess,
    plan: input.plan,
    packConfigured: Boolean(input.packConfigured),
    packRuns: CONTINUITY_PACK_RUNS,
  };
}
