import { describe, expect, it } from "vitest";
import {
  CONTINUITY_ELIGIBILITY_VERSION,
  CONTINUITY_LEASE_MS,
  buildContinuityEligibilityMatrix,
  evaluateContinuityEligibility,
} from "./continuity-eligibility";
import { LOCAL_ONLY_PROMPT_PATTERNS } from "./cloud-tool-policy";

describe("Continuity eligibility matrix", () => {
  it("keeps public lease TTL at the 90s fencing contract", () => {
    // Must match TASK_LEASE_MS in task-leases.ts (not imported here — avoids cloudflare:workers in unit tests).
    expect(CONTINUITY_LEASE_MS).toBe(90_000);
  });

  it("exposes honest lease + handoff claims", () => {
    const matrix = buildContinuityEligibilityMatrix();
    expect(matrix.version).toBe(CONTINUITY_ELIGIBILITY_VERSION);
    expect(matrix.model).toBe("queued_prompt_handoff");
    expect(matrix.not).toBe("process_migration");
    expect(matrix.leaseMs).toBe(CONTINUITY_LEASE_MS);
    expect(matrix.leaseMs).toBe(90_000);
    expect(matrix.eligible.length).toBeGreaterThanOrEqual(4);
    expect(matrix.localOnly.length).toBeGreaterThanOrEqual(LOCAL_ONLY_PROMPT_PATTERNS.length);
    expect(matrix.invariants.some((row) => row.id === "one_thread_one_executor")).toBe(true);
    expect(matrix.honesty.avoid).toContain("process migration / live memory handoff");
    // Every enforced pattern id appears in the public localOnly list.
    for (const id of matrix.enforcedLocalOnlyPatternIds) {
      expect(matrix.localOnly.some((row) => row.id === id)).toBe(true);
    }
  });

  it("marks ordinary coding prompts eligible and local-only blocked", () => {
    expect(evaluateContinuityEligibility("Draft a PR description for the last three commits")).toEqual({
      eligible: true,
      version: CONTINUITY_ELIGIBILITY_VERSION,
    });
    expect(evaluateContinuityEligibility("Use security find-generic-password -s hermes")).toMatchObject({
      eligible: false,
      code: "local_only_tool",
      matched: "keychain",
    });
  });
});
