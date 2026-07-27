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
});
