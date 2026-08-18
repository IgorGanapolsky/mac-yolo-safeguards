import { describe, expect, it } from "vitest";
import {
  UPSTREAM_QUOTA_RETRY_MESSAGE,
  composerLockForTaskError,
  formatTaskError,
  isZaiWeeklyQuotaError,
} from "./task-error-display";

describe("task-error-display", () => {
  const quota = "Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-08-22 21:07:02";

  it("treats z.ai 429 code 1310 as upstream coding quota, not Pro cap", () => {
    expect(isZaiWeeklyQuotaError(quota)).toBe(true);
    expect(isZaiWeeklyQuotaError('429 code 1310 from z.ai')).toBe(true);
    expect(isZaiWeeklyQuotaError("Continuity capacity exhausted for this 30-day window")).toBe(false);
  });

  it("429 Limit Exhausted triggers failover copy, not a composer lock", () => {
    expect(formatTaskError(quota)).toBe(UPSTREAM_QUOTA_RETRY_MESSAGE);
    expect(composerLockForTaskError(quota)).toBe(false);
    expect(composerLockForTaskError("CLOUD PENDING")).toBe(false);
    expect(composerLockForTaskError("FAILED")).toBe(false);
  });
});
