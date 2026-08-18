import { describe, expect, it } from "vitest";
import {
  resolveComposerRunCta,
  resolveEffectiveRoutePreference,
} from "./composer-run-cta";

describe("resolveComposerRunCta", () => {
  it("entitled workspace always shows Run →, never pair or Auto/local", () => {
    const cta = resolveComposerRunCta({
      hasCloudAccess: true,
    });
    expect(cta.kind).toBe("run");
    expect(cta.label).toBe("Run →");
    expect(cta.label).not.toMatch(/pair/i);
    expect(cta.label).not.toMatch(/Continuity/i);
    expect(cta.label).not.toMatch(/Auto/i);
    expect(cta.isContinuity).toBe(true);
    expect(cta.disabled).toBe(false);
  });

  it("without plan shows upgrade, not pair", () => {
    const cta = resolveComposerRunCta({
      hasCloudAccess: false,
    });
    expect(cta.kind).toBe("upgrade");
    expect(cta.label).toMatch(/trial|Pro/i);
    expect(cta.label).not.toMatch(/pair/i);
    expect(cta.label).not.toMatch(/Continuity/i);
  });

  it("local/auto inputs are ignored — still hosted VPS Run", () => {
    const local = resolveComposerRunCta({
      routePreference: "local",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    const auto = resolveComposerRunCta({
      routePreference: "auto",
      deviceCount: 1,
      onlineDeviceCount: 0,
      hasCloudAccess: true,
    });
    expect(local.kind).toBe("run");
    expect(local.label).toBe("Run →");
    expect(auto.kind).toBe("run");
    expect(auto.label).toBe("Run →");
  });

  it("busy disables run", () => {
    const cta = resolveComposerRunCta({
      hasCloudAccess: true,
      busy: true,
    });
    expect(cta.disabled).toBe(true);
  });
});

describe("resolveEffectiveRoutePreference", () => {
  it("always returns cloud", () => {
    expect(resolveEffectiveRoutePreference()).toBe("cloud");
    expect(
      resolveEffectiveRoutePreference({
        routePreference: "local",
        deviceCount: 0,
        hasCloudAccess: true,
      }),
    ).toBe("cloud");
    expect(
      resolveEffectiveRoutePreference({
        routePreference: "auto",
        deviceCount: 1,
        hasCloudAccess: false,
      }),
    ).toBe("cloud");
  });
});
