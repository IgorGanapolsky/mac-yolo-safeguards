import { describe, expect, it } from "vitest";
import { isPosthogLandingEvent, shouldLoadPosthog, posthogKeyFromEnv } from "./posthog-browser";

describe("gated PostHog snippet", () => {
  it("stays off without a key", () => {
    expect(shouldLoadPosthog({})).toBe(false);
    expect(posthogKeyFromEnv({})).toBe("");
  });

  it("only allows landing_view and hosted_checkout_click", () => {
    expect(isPosthogLandingEvent("landing_view")).toBe(true);
    expect(isPosthogLandingEvent("hosted_checkout_click")).toBe(true);
    expect(isPosthogLandingEvent("client_error")).toBe(false);
  });
});
