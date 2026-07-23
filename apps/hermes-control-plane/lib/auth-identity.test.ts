import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  pickBestMembership,
  shouldBackfillWorkosOrganizationId,
  type MembershipCandidate,
} from "./auth-identity";

const base = (over: Partial<MembershipCandidate> & { organizationId: string }): MembershipCandidate => ({
  organizationId: over.organizationId,
  plan: over.plan ?? "trial",
  workosOrganizationId: over.workosOrganizationId ?? null,
  deviceCount: over.deviceCount ?? 0,
  membershipCreatedAt: over.membershipCreatedAt ?? 1_000,
});

describe("pickBestMembership", () => {
  it("returns null for empty list", () => {
    expect(pickBestMembership([])).toBeNull();
  });

  it("prefers the membership with paired devices over an empty WorkOS-matched org", () => {
    const emptyWorkos = base({
      organizationId: "empty",
      workosOrganizationId: "org_new",
      deviceCount: 0,
      plan: "trial",
      membershipCreatedAt: 2_000,
    });
    const withDevices = base({
      organizationId: "real",
      workosOrganizationId: null,
      deviceCount: 2,
      plan: "pro",
      membershipCreatedAt: 1_000,
    });
    const picked = pickBestMembership([emptyWorkos, withDevices], "org_new");
    expect(picked?.organizationId).toBe("real");
  });

  it("uses exact WorkOS org when that org has devices", () => {
    const a = base({ organizationId: "a", workosOrganizationId: "org_a", deviceCount: 1, plan: "trial" });
    const b = base({ organizationId: "b", workosOrganizationId: "org_b", deviceCount: 5, plan: "pro" });
    expect(pickBestMembership([a, b], "org_a")?.organizationId).toBe("a");
  });

  it("prefers pro over empty trial when neither has devices", () => {
    const trial = base({ organizationId: "t", plan: "trial", deviceCount: 0, membershipCreatedAt: 1 });
    const pro = base({ organizationId: "p", plan: "pro", deviceCount: 0, membershipCreatedAt: 2 });
    expect(pickBestMembership([trial, pro])?.organizationId).toBe("p");
  });

  it("falls back to oldest membership when tied", () => {
    const older = base({ organizationId: "old", membershipCreatedAt: 100, deviceCount: 0 });
    const newer = base({ organizationId: "new", membershipCreatedAt: 200, deviceCount: 0 });
    expect(pickBestMembership([newer, older])?.organizationId).toBe("old");
  });
});

describe("shouldBackfillWorkosOrganizationId", () => {
  it("backfills only when chosen org has no workos id yet", () => {
    const chosen = base({ organizationId: "real", workosOrganizationId: null });
    expect(shouldBackfillWorkosOrganizationId(chosen, "org_x")).toBe(true);
    expect(shouldBackfillWorkosOrganizationId({ ...chosen, workosOrganizationId: "org_y" }, "org_x")).toBe(false);
    expect(shouldBackfillWorkosOrganizationId(chosen, null)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Igor@Gmail.com ")).toBe("igor@gmail.com");
  });
});
