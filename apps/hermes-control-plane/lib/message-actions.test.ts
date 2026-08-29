import { describe, expect, it } from "vitest";
import { humanizeTaskError, isRetryableTaskError, shareableMessageText } from "./message-actions";

describe("shareableMessageText", () => {
  it("returns trimmed text as-is for plain output", () => {
    expect(shareableMessageText("  Paris is the capital of France.  ")).toBe("Paris is the capital of France.");
  });

  it("returns empty string for null/undefined", () => {
    expect(shareableMessageText(null)).toBe("");
    expect(shareableMessageText(undefined)).toBe("");
  });

  it("strips leaked tool protocol when hideToolProtocol is set, matching the rendered view", () => {
    const raw = 'Here is the answer.\n<|DSML|invoke name="shell">curl example</|DSML|>';
    const shared = shareableMessageText(raw, { hideToolProtocol: true });
    expect(shared).toContain("Here is the answer.");
    expect(shared).not.toContain("DSML");
  });
});

describe("humanizeTaskError", () => {
  it("translates raw fetch failed into a customer explanation with a next step", () => {
    const copy = humanizeTaskError("fetch failed");
    expect(copy).not.toBe("fetch failed");
    expect(copy).toContain("Retry");
    expect(copy.toLowerCase()).toContain("network");
  });

  it("translates connection-level errno strings", () => {
    expect(humanizeTaskError("connect ECONNREFUSED 127.0.0.1:11434")).toContain("Retry");
    expect(humanizeTaskError("getaddrinfo ENOTFOUND runner.internal")).toContain("Retry");
  });

  it("keeps already human-readable errors verbatim", () => {
    const readable = "Hosted VPS capacity exhausted for this 30-day window. Upgrade to continue.";
    expect(humanizeTaskError(readable)).toBe(readable);
  });

  it("falls back to a generic retry message when the error is empty", () => {
    expect(humanizeTaskError("")).toContain("Retry");
    expect(humanizeTaskError(null)).toContain("Retry");
  });
});

describe("isRetryableTaskError", () => {
  it("marks transient network failures retryable", () => {
    expect(isRetryableTaskError("fetch failed")).toBe(true);
    expect(isRetryableTaskError("ECONNRESET")).toBe(true);
  });

  it("does not offer retry for plan/capacity walls", () => {
    expect(isRetryableTaskError("A trial or Pro plan is required to run on the hosted VPS.")).toBe(false);
    expect(isRetryableTaskError("Hosted VPS capacity exhausted for this 30-day window.")).toBe(false);
  });
});
