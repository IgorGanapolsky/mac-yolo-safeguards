import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runtimeEnv: vi.fn(() => ({
    WORKOS_CLIENT_ID: "client",
    WORKOS_API_KEY: "key",
    WORKOS_REDIRECT_URI: "https://thumbgate.app/api/auth/callback",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PRICE_ID: "price_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    HERMES_CLOUD_RUNNER_TOKEN: "runner_token",
  })),
  aggregateRow: {
    paid_orgs: 3,
    active_sessions: 5,
    logins_24h: 2,
    sessions_created_24h: 4,
    tasks_created_24h: 10,
    tasks_completed_24h: 7,
    tasks_failed_24h: 1,
    cloud_completed_30d: 6,
    cloud_failed_30d: 2,
    cloud_inflight: 1,
    local_completed_30d: 20,
    audit_24h: 15,
    real_billing_latest: 1_700_000_000_000,
    billing_events_24h: 3,
    landing_views_today: 40,
    sign_in_clicks_today: 8,
    cloud_continuity_clicks_today: 2,
  },
}));

function statement(sql: string) {
  return {
    bind() { return this; },
    async first() {
      if (sql.includes("COUNT(*) FROM organizations")) return mocks.aggregateRow;
      return null;
    },
    async all() {
      if (sql.includes("FROM audit_events") && sql.includes("GROUP BY action")) {
        return { results: [{ action: "auth.login", count: 5 }, { action: "task.create", count: 3 }] };
      }
      if (sql.includes("FROM devices")) {
        return {
          results: [
            { id: "device-123456789", name: "Igor's Mac", failoverMode: "auto", lastSeenAt: Date.now() - 5_000 },
          ],
        };
      }
      if (sql.includes("FROM tasks") && sql.includes("route = 'cloud'") && sql.includes("ORDER BY created_at DESC")) {
        return {
          results: [
            {
              id: "task-abcdefghijklmnop",
              status: "completed",
              route: "cloud",
              createdAt: 1_000,
              completedAt: 4_000,
              isCanary: 0,
            },
          ],
        };
      }
      return { results: [] };
    },
  };
}

vi.mock("./runtime", () => ({
  runtimeEnv: mocks.runtimeEnv,
  db: () => ({ prepare: (sql: string) => statement(sql) }),
}));

const { collectAdminMetrics } = await import("./admin-metrics");

describe("collectAdminMetrics", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports runner health as ok when the health endpoint returns a healthy body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, lastPollAt: 1_700_000_001_000, lastTaskAt: 1_700_000_002_000, degraded: false }),
    }) as unknown as typeof fetch;

    const metrics = await collectAdminMetrics();

    expect(metrics.health.runnerOk).toBe(true);
    expect(metrics.health.runnerDegraded).toBe(false);
    expect(metrics.health.runnerError).toBeNull();
    expect(metrics.health.runnerLastPollAt).toBe(1_700_000_001_000);
  });

  it("marks the runner degraded (not crashed) when the health request fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const metrics = await collectAdminMetrics();

    expect(metrics.health.runnerOk).toBe(false);
    expect(metrics.health.runnerDegraded).toBe(true);
    expect(metrics.health.runnerError).toMatch(/ECONNREFUSED/);
    expect(metrics.health.controlPlaneOk).toBe(true);
  });

  it("computes projected MRR/ARR from paid org count at the fixed $10 list price", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("unreachable"));

    const metrics = await collectAdminMetrics();

    expect(metrics.revenue.paidOrganizations).toBe(3);
    expect(metrics.revenue.projectedMrrUsd).toBe(30);
    expect(metrics.revenue.projectedArrUsd).toBe(360);
  });

  it("computes cloud success rate as completed / (completed + failed) over the 30d window", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("unreachable"));

    const metrics = await collectAdminMetrics();

    // aggregateRow: cloud_completed_30d=6, cloud_failed_30d=2 -> 6 / 8 = 0.75
    expect(metrics.activity.cloudSuccessRate30d).toBe(0.75);
  });

  it("maps paid-machine rows without leaking full device ids", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("unreachable"));

    const metrics = await collectAdminMetrics();

    expect(metrics.paidMachines).toHaveLength(1);
    expect(metrics.paidMachines[0].deviceIdPrefix).toBe("device-1");
    expect(metrics.paidMachines[0].deviceIdPrefix.length).toBe(8);
    expect(metrics.paidMachines[0].online).toBe(true);
  });

  it("never exposes chat bodies, IPs, or fingerprints in the privacy block", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("unreachable"));

    const metrics = await collectAdminMetrics();

    expect(metrics.privacy.chatBodies).toBe(false);
    expect(metrics.privacy.ipAddresses).toBe(false);
    expect(metrics.privacy.fingerprints).toBe(false);
  });
});
