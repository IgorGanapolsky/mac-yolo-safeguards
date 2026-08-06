import { describe, expect, it } from "vitest";
import {
  resolveComposerRunCta,
  resolveEffectiveRoutePreference,
} from "./composer-run-cta";

describe("resolveComposerRunCta", () => {
  it("Continuity selected never shows pair CTA (even with zero devices)", () => {
    const cta = resolveComposerRunCta({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    expect(cta.kind).toBe("run");
    expect(cta.label).toMatch(/Continuity/i);
    expect(cta.label).not.toMatch(/pair/i);
    expect(cta.isContinuity).toBe(true);
    expect(cta.disabled).toBe(false);
  });

  it("Continuity without plan shows upgrade, not pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: false,
    });
    expect(cta.kind).toBe("upgrade");
    expect(cta.label).toMatch(/Continuity/i);
    expect(cta.label).not.toMatch(/pair/i);
  });

  it("local unpaired requires pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "local",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    expect(cta.kind).toBe("pair");
    expect(cta.label).toMatch(/pair/i);
  });

  it("auto unpaired with cloud runs Continuity", () => {
    const cta = resolveComposerRunCta({
      routePreference: "auto",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    expect(cta.kind).toBe("run");
    expect(cta.isContinuity).toBe(true);
  });

  it("auto with offline Mac + Continuity never forces pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "auto",
      deviceCount: 1,
      onlineDeviceCount: 0,
      hasCloudAccess: true,
    });
    expect(cta.kind).toBe("run");
    expect(cta.isContinuity).toBe(true);
    expect(cta.label).not.toMatch(/pair/i);
  });

  it("auto unpaired without cloud pairs", () => {
    const cta = resolveComposerRunCta({
      routePreference: "auto",
      deviceCount: 0,
      hasCloudAccess: false,
    });
    expect(cta.kind).toBe("pair");
  });

  it("paired machine shows Run task", () => {
    const cta = resolveComposerRunCta({
      routePreference: "local",
      deviceCount: 1,
      hasCloudAccess: false,
    });
    expect(cta.kind).toBe("run");
    expect(cta.label).toBe("Run task →");
  });

  it("busy disables run", () => {
    const cta = resolveComposerRunCta({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: true,
      busy: true,
    });
    expect(cta.disabled).toBe(true);
  });
});

describe("resolveEffectiveRoutePreference", () => {
  it("cloud stays cloud with zero devices", () => {
    expect(
      resolveEffectiveRoutePreference({
        routePreference: "cloud",
        deviceCount: 0,
        hasCloudAccess: true,
      }),
    ).toBe("cloud");
  });

  it("auto becomes cloud when unpaired + entitled", () => {
    expect(
      resolveEffectiveRoutePreference({
        routePreference: "auto",
        deviceCount: 0,
        hasCloudAccess: true,
      }),
    ).toBe("cloud");
  });
});
