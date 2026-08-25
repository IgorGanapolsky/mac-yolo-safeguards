import { describe, expect, it } from "vitest";
import { __test } from "../app/ClientErrorBeacon";

describe("ClientErrorBeacon classifyError", () => {
  it("allowlists standard Error names", () => {
    expect(__test.classifyError(new TypeError("x"))).toBe("TypeError");
    expect(__test.classifyError(new ReferenceError("x"))).toBe("ReferenceError");
    expect(__test.classifyError(new Error("x"))).toBe("Error");
  });

  it("collapses unknown *Error names to OtherError", () => {
    class WeirdError extends Error {
      name = "WeirdError";
    }
    expect(__test.classifyError(new WeirdError("nope"))).toBe("OtherError");
  });

  it("never stores free-form strings as class", () => {
    expect(__test.classifyError({ message: "user email secret@x.com" })).toBe("Error");
    expect(__test.classifyError("totally free form")).toBe("Error");
  });

  it("suppresses the same errorClass inside the duplicate window", () => {
    const last: Record<string, number> = {};
    const first = __test.shouldReportClientError("TypeError", 1_000, last, 0);
    expect(first.emit).toBe(true);
    last["client_error:TypeError"] = 1_000;
    const again = __test.shouldReportClientError("TypeError", 2_000, last, 1);
    expect(again.emit).toBe(false);
    const other = __test.shouldReportClientError("ReferenceError", 2_000, last, 1);
    expect(other.emit).toBe(true);
  });

  it("still honors the session cap", () => {
    const last: Record<string, number> = {};
    const blocked = __test.shouldReportClientError(
      "TypeError",
      1_000,
      last,
      __test.MAX_REPORTS_PER_SESSION,
    );
    expect(blocked.emit).toBe(false);
    expect(blocked.reason).toBe("session_cap");
  });
});
