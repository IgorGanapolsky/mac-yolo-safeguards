import { describe, expect, it } from "vitest";

import {
  cleanActionClass,
  cleanApprovalSummary,
  cleanApprovalTtl,
  cleanArgumentDigest,
  cleanIdempotencyKey,
} from "./action-approvals";

describe("action approval input boundary", () => {
  it("accepts only the locked sensitive-action classes", () => {
    for (const actionClass of ["money", "customer", "production", "send", "calendar"]) {
      expect(cleanActionClass(actionClass)).toBe(actionClass);
    }
    expect(cleanActionClass("filesystem")).toBeNull();
  });

  it("allows useful redacted summaries and rejects likely secret-bearing summaries", () => {
    expect(cleanApprovalSummary("Deploy verified release to production")).toBe("Deploy verified release to production");
    for (const unsafe of [
      "Send to buyer@example.com",
      "Use api_key=top-secret-value",
      "Authorization bearer abcdefgh",
      "Call https://example.com/pay?token=secret",
      "Run {\"command\":\"rm -rf\"}",
    ]) expect(cleanApprovalSummary(unsafe)).toBeNull();
  });

  it("requires content-free SHA-256 digests, durable idempotency keys, and bounded expiry", () => {
    expect(cleanArgumentDigest("a".repeat(43))).toBe("a".repeat(43));
    expect(cleanArgumentDigest("raw arguments")).toBeNull();
    expect(cleanIdempotencyKey("task-123:tool-7")).toBe("task-123:tool-7");
    expect(cleanIdempotencyKey("short")).toBeNull();
    expect(cleanApprovalTtl(30_000)).toBe(30_000);
    expect(cleanApprovalTtl(900_000)).toBe(900_000);
    expect(cleanApprovalTtl(29_999)).toBeNull();
    expect(cleanApprovalTtl(900_001)).toBeNull();
  });
});
