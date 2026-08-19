import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, resolveAnalyticsEvent } from "./analytics-events";

describe("high-ROI live pipes contract", () => {
  it("analytics allowlist has no continuity string", () => {
    expect(ANALYTICS_EVENTS.join("\\n")).not.toMatch(/continuity/i);
    expect(ANALYTICS_EVENTS).toContain("hosted_checkout_click");
    expect(ANALYTICS_EVENTS).toContain("landing_view");
  });

  it("legacy checkout alias writes the new counter without joining the allowlist", () => {
    expect(resolveAnalyticsEvent("hosted_checkout_click")).toBe("hosted_checkout_click");
    expect(resolveAnalyticsEvent("cloud_continuity_click")).toBe("hosted_checkout_click");
    expect(resolveAnalyticsEvent("not_a_real_event")).toBeNull();
  });

  it("control-plane package.json has no @opentelemetry/ direct dependency", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((name) => name.startsWith("@opentelemetry/"))).toBe(false);
    expect(JSON.stringify(pkg)).not.toMatch(/@opentelemetry\//);
  });

  it("product files do not add an OpenTelemetry collector config", () => {
    const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    expect(envExample).toMatch(/SENTRY_DSN=/);
    expect(envExample).toMatch(/NEXT_PUBLIC_SENTRY_DSN=/);
    expect(envExample).toMatch(/NEXT_PUBLIC_POSTHOG_KEY=/);
    expect(envExample).not.toMatch(/https:\/\/[a-z0-9]+@o\d+\.ingest/i);
    expect(envExample).not.toMatch(/phc_[A-Za-z0-9]+/);
    expect(envExample).not.toMatch(/opentelemetry|otel-collector|fluent-bit|loki/i);

    const sentry = readFileSync(new URL("./sentry.ts", import.meta.url), "utf8");
    expect(sentry).not.toMatch(/sessionReplay|browserProfilingIntegration|profilesSampleRate/);
    expect(sentry).not.toMatch(/@opentelemetry\//);
  });
});
