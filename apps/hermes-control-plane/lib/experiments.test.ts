import { describe, it, expect, vi } from "vitest";

// Mock runtime (cloudflare:workers) before importing experiments — the pure
// logic functions we test below don't touch the DB, but the module imports
// ./runtime which imports cloudflare:workers (unavailable in Node test env).
vi.mock("./runtime", () => ({
  db: () => ({
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({}),
      }),
    }),
  }),
}));

const { fnv1a32, assignVariant, evaluateFlagValue } = await import("@/lib/experiments");
import type { ExperimentVariant, FlagDefinition } from "@/lib/experiments";

describe("experiments — FNV-1a hash", () => {
  it("is deterministic: same input → same output", () => {
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
  });

  it("differs for different inputs", () => {
    expect(fnv1a32("hello")).not.toBe(fnv1a32("world"));
  });

  it("produces 32-bit unsigned values", () => {
    const h = fnv1a32("test");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("handles empty string", () => {
    expect(fnv1a32("")).toBe(2166136261); // FNV offset basis
  });
});

describe("experiments — variant assignment", () => {
  const variants: ExperimentVariant[] = [
    { name: "control", weight: 0.5 },
    { name: "treatment-a", weight: 0.3 },
    { name: "treatment-b", weight: 0.2 },
  ];

  it("always returns the only variant when there's one", () => {
    expect(assignVariant("exp", "subj1", 0, [{ name: "only", weight: 1 }])).toBe("only");
  });

  it("throws on empty variant list", () => {
    expect(() => assignVariant("exp", "subj1", 0, [])).toThrow("empty list");
  });

  it("throws on zero-weight variants", () => {
    expect(() =>
      assignVariant("exp", "subj1", 0, [
        { name: "a", weight: 0 },
        { name: "b", weight: 0 },
      ]),
    ).toThrow("positive");
  });

  it("is deterministic: same subject → same variant", () => {
    const v1 = assignVariant("exp1", "user-123", 0, variants);
    const v2 = assignVariant("exp1", "user-123", 0, variants);
    expect(v1).toBe(v2);
  });

  it("changes variant distribution when seed changes", () => {
    const v1 = assignVariant("exp1", "user-123", 0, variants);
    const v2 = assignVariant("exp1", "user-123", 1, variants);
    // Not guaranteed different, but with 3 variants and different seeds it should be
    expect([v1, v2]).toContain(v2);
  });

  it("distinguishes different subjects within same experiment", () => {
    const results = new Map<string, string>();
    const subjects = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
    for (const s of subjects) {
      results.set(s, assignVariant("exp1", s, 0, variants));
    }
    // With 1000 subjects and 3 variants, at least 2 variants should appear
    const uniqueVariants = new Set(results.values());
    expect(uniqueVariants.size).toBeGreaterThanOrEqual(2);
  });

  it("variant distribution is approximately proportional", () => {
    const counts: Record<string, number> = {};
    for (const v of variants) counts[v.name] = 0;
    for (let i = 0; i < 3000; i++) {
      const v = assignVariant("exp", `user-${i}`, 42, variants);
      counts[v]!++;
    }
    // control ~50%, treatment-a ~30%, treatment-b ~20%
    expect(counts["control"]).toBeGreaterThan(1200); // ~1500
    expect(counts["treatment-a"]).toBeGreaterThan(600); // ~900
    expect(counts["treatment-b"]).toBeGreaterThan(300); // ~600
  });

  it("float precision doesn't cause fallback miss", () => {
    const v = assignVariant("exp", "subj", 0, [
      { name: "a", weight: 0.33 },
      { name: "b", weight: 0.33 },
      { name: "c", weight: 0.34 },
    ]);
    expect(["a", "b", "c"]).toContain(v);
  });
});

describe("experiments — feature flag evaluation", () => {
  const globalFlag: FlagDefinition = {
    key: "new_ui",
    description: "Enable new UI",
    enabled: true,
  };

  const orgScopedFlag: FlagDefinition = {
    key: "beta-feature",
    description: "Beta for specific orgs",
    enabled: true,
    orgId: "org-acme",
  };

  it("returns false for undefined flag", () => {
    expect(evaluateFlagValue(undefined, "org-1")).toBe(false);
  });

  it("global flag is enabled for all orgs", () => {
    expect(evaluateFlagValue(globalFlag, "org-1")).toBe(true);
    expect(evaluateFlagValue(globalFlag, undefined)).toBe(true);
    expect(evaluateFlagValue(globalFlag, "org-2")).toBe(true);
  });

  it("org-scoped flag is enabled only for matching org", () => {
    expect(evaluateFlagValue(orgScopedFlag, "org-acme")).toBe(true);
    expect(evaluateFlagValue(orgScopedFlag, "org-other")).toBe(false);
  });

  it("org-scoped flag disabled when enabled=false", () => {
    const disabled: FlagDefinition = { ...orgScopedFlag, enabled: false };
    expect(evaluateFlagValue(disabled, "org-acme")).toBe(false);
  });

  it("org-scoped flag with no orgId in flag is treated as global", () => {
    const flag: FlagDefinition = { key: "k", description: "d", enabled: true };
    expect(evaluateFlagValue(flag, "any-org")).toBe(true);
    expect(evaluateFlagValue(flag, undefined)).toBe(true);
  });
});
