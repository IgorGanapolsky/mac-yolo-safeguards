import { describe, expect, it } from "vitest";
import {
  correlate,
  shouldEmitDuplicate,
  suggestValidatedFix,
} from "./hosted-alert-correlate";

describe("hosted-alert-correlate", () => {
  it("suppresses duplicate 500s in-window into one admission incident", () => {
    const burst = Array.from({ length: 10 }, (_, i) => ({
      ts: 1_000 + i * 10,
      method: "POST",
      path: "/api/tasks",
      status: 500,
    }));
    const report = correlate(burst, { windowMs: 60_000, precursorCount: 3 });
    expect(report.clonedIgnio).toBe(false);
    expect(report.autoApply).toBe(false);
    expect(report.rawCount).toBe(10);
    expect(report.incidentCount).toBe(1);
    expect(report.incidents[0].family).toBe("hosted_admission");
    expect(report.incidents[0].userFacing).toBe(true);
    expect(report.suppressRatio).toBeGreaterThanOrEqual(0.9);
  });

  it("correlates tasks + nostr 5xx into one hosted_admission incident", () => {
    const report = correlate([
      { ts: 1_000, method: "POST", path: "/api/tasks", status: 500 },
      { ts: 1_050, method: "POST", path: "/api/nostr/events", status: 502 },
      { ts: 1_080, method: "POST", path: "/api/tasks", status: 500 },
    ]);
    expect(report.incidentCount).toBe(1);
    expect(report.incidents[0].id).toBe("hosted_admission");
  });

  it("keeps 200s silent and treats 2 errors as precursor not user-facing", () => {
    const report = correlate(
      [
        { ts: 1, method: "GET", path: "/api/health", status: 200 },
        { ts: 2, method: "POST", path: "/api/billing/checkout", status: 500 },
        { ts: 3, method: "POST", path: "/api/billing/checkout", status: 500 },
      ],
      { precursorCount: 3 },
    );
    expect(report.incidents[0].family).toBe("billing");
    expect(report.incidents[0].precursor).toBe(true);
    expect(report.incidents[0].userFacing).toBe(false);
  });

  it("refuses unvalidated fixes and never auto-applies", () => {
    expect(suggestValidatedFix({ testsPass: true, receiptOk: false }).validated).toBe(false);
    const ok = suggestValidatedFix({ testsPass: true, receiptOk: true, action: "patch" });
    expect(ok.validated).toBe(true);
    expect(ok.autoApply).toBe(false);
  });

  it("does not merge same-family 5xx across the correlation window", () => {
    const report = correlate(
      [
        { ts: 1_000, method: "POST", path: "/api/tasks", status: 500 },
        { ts: 3_601_000, method: "POST", path: "/api/tasks", status: 500 },
      ],
      { windowMs: 60_000, precursorCount: 3 },
    );
    expect(report.incidentCount).toBe(2);
    expect(report.incidents.every((inc) => inc.userFacing === false)).toBe(true);
  });

  it("duplicate window suppresses client_error class", () => {
    const last: Record<string, number> = {};
    const first = shouldEmitDuplicate({
      signature: "client_error:TypeError",
      now: 1_000,
      lastBySignature: last,
    });
    expect(first.emit).toBe(true);
    last["client_error:TypeError"] = 1_000;
    const second = shouldEmitDuplicate({
      signature: "client_error:TypeError",
      now: 5_000,
      lastBySignature: last,
    });
    expect(second.emit).toBe(false);
    expect(second.reason).toBe("duplicate_suppressed");
  });
});
