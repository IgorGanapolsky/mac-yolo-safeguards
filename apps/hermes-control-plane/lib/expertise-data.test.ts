import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectExpertiseData } from "./expertise-data.ts";

vi.mock("./runtime.ts", () => ({
  db: vi.fn(() => ({
    prepare: vi.fn(() => ({
      first: vi.fn(async () => ({ count: 0, total: 0, ok: 0 })),
      all: vi.fn(async () => ({ results: [] })),
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({ count: 0, total: 0, ok: 0 })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
  })),
}));

describe("collectExpertiseData", () => {
  it("returns structured expertise data with all required fields", async () => {
    const data = await collectExpertiseData();

    expect(data).toHaveProperty("generatedAt");
    expect(data).toHaveProperty("continuity");
    expect(data).toHaveProperty("pairing");
    expect(data).toHaveProperty("availability");
    expect(data).toHaveProperty("scale");
    expect(data).toHaveProperty("caseStudies");
    expect(data).toHaveProperty("methodology");

    expect(Array.isArray(data.caseStudies)).toBe(true);
    expect(data.caseStudies.length).toBeGreaterThan(0);

    for (const cs of data.caseStudies) {
      expect(cs).toHaveProperty("id");
      expect(cs).toHaveProperty("title");
      expect(cs).toHaveProperty("author");
      expect(cs.author).toHaveProperty("name");
      expect(cs.author).toHaveProperty("role");
    }

    expect(data.methodology).toHaveProperty("dataSource");
    expect(data.methodology).toHaveProperty("privacyBoundary");
    expect(data.methodology).toHaveProperty("canaryExclusion");
  });

  it("continuity stats include success rate and duration percentiles", async () => {
    const data = await collectExpertiseData();
    expect(data.continuity).toHaveProperty("successRate30d");
    expect(data.continuity).toHaveProperty("medianDurationMs");
    expect(data.continuity).toHaveProperty("p95DurationMs");
    expect(data.continuity).toHaveProperty("completedRuns30d");
    expect(data.continuity).toHaveProperty("failedRuns30d");
  });

  it("pairing stats include transport mix and median pair time", async () => {
    const data = await collectExpertiseData();
    expect(data.pairing).toHaveProperty("transportMix");
    expect(data.pairing.transportMix).toHaveProperty("usb");
    expect(data.pairing.transportMix).toHaveProperty("tailscale");
    expect(data.pairing.transportMix).toHaveProperty("lan");
    expect(data.pairing).toHaveProperty("medianPairTimeSec");
  });

  it("availability stats include uptime and orgs with online machines", async () => {
    const data = await collectExpertiseData();
    expect(data.availability).toHaveProperty("controlPlaneUptime30d");
    expect(data.availability).toHaveProperty("runnerUptime30d");
    expect(data.availability).toHaveProperty("orgsWithOnlineMachine");
  });

  it("degrades availability uptime to null when optional health tables throw", async () => {
    const { db } = await import("./runtime.ts");
    const prepare = vi.fn((sql: string) => {
      if (
        typeof sql === "string" &&
        (sql.includes("health_checks") || sql.includes("runner_health_checks"))
      ) {
        return {
          bind: () => ({
            first: async () => {
              throw new Error("no such table: health_checks");
            },
            all: async () => {
              throw new Error("no such table: health_checks");
            },
          }),
          first: async () => {
            throw new Error("no such table: health_checks");
          },
          all: async () => {
            throw new Error("no such table: health_checks");
          },
        };
      }
      return {
        first: vi.fn(async () => ({ count: 0, total: 0, ok: 0 })),
        all: vi.fn(async () => ({ results: [] })),
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({ count: 2, total: 0, ok: 0 })),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    vi.mocked(db).mockReturnValue({ prepare } as ReturnType<typeof db>);

    const data = await collectExpertiseData();
    expect(data.availability.controlPlaneUptime30d).toBeNull();
    expect(data.availability.runnerUptime30d).toBeNull();
    // devices query still works under the mock
    expect(typeof data.availability.orgsWithOnlineMachine).toBe("number");
  });

  it("scale stats include total machines, sessions, tasks", async () => {
    const data = await collectExpertiseData();
    expect(data.scale).toHaveProperty("totalPairedMachines");
    expect(data.scale).toHaveProperty("activeSessions24h");
    expect(data.scale).toHaveProperty("totalTasks30d");
  });
});