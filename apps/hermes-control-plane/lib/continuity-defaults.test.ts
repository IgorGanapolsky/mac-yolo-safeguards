import { describe, expect, it } from "vitest";
import { defaultFailoverModeForOrganization } from "./continuity-defaults";

describe("defaultFailoverModeForOrganization", () => {
  const now = 1_000_000;

  it("defaults paid Continuity workspaces to automatic VPS failover", () => {
    expect(defaultFailoverModeForOrganization({ plan: "pro", trialEndsAt: null }, now)).toBe("auto");
    expect(defaultFailoverModeForOrganization({ plan: "team", trialEndsAt: null }, now)).toBe("auto");
  });

  it("defaults active trial Continuity to automatic VPS failover", () => {
    expect(defaultFailoverModeForOrganization({ plan: "trial", trialEndsAt: now + 1 }, now)).toBe("auto");
  });

  it("keeps free / expired trial / suspended on ask-first manual", () => {
    expect(defaultFailoverModeForOrganization({ plan: "free", trialEndsAt: null }, now)).toBe("manual");
    expect(defaultFailoverModeForOrganization({ plan: "trial", trialEndsAt: now - 1 }, now)).toBe("manual");
    expect(defaultFailoverModeForOrganization({ plan: "suspended", trialEndsAt: null }, now)).toBe("manual");
  });
});
