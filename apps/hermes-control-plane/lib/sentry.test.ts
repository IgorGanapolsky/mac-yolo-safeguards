import { afterEach, describe, expect, it } from "vitest";
import { parseSentryDsn, sentryDsnFromEnv, __resetSentryForTests } from "./sentry";

describe("tiny Sentry init", () => {
  afterEach(() => {
    __resetSentryForTests();
  });

  it("parses a well-formed DSN without requiring a real project", () => {
    const parsed = parseSentryDsn("https://publickey@example.invalid/123");
    expect(parsed).toEqual({ host: "example.invalid", publicKey: "publickey", projectId: "123" });
  });

  it("returns null when DSN is empty or malformed", () => {
    expect(parseSentryDsn("")).toBeNull();
    expect(parseSentryDsn("not-a-url")).toBeNull();
    expect(sentryDsnFromEnv({})).toBe("");
  });
});
