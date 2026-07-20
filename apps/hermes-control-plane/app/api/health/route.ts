import { db } from "@/lib/runtime";

export async function GET() {
  try {
    const now = Date.now();
    const health = await db().prepare(
      `SELECT
         (SELECT COUNT(*) FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('organizations', 'funnel_counters', 'audit_events', 'devices', 'billing_events')) AS table_count,
         (SELECT COUNT(*) FROM users) AS users_total,
         (SELECT COUNT(*) FROM organizations) AS organizations_total,
         (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS active_sessions,
         (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) AS active_devices,
         (SELECT MAX(last_seen_at) FROM devices WHERE revoked_at IS NULL) AS device_heartbeat_latest_at,
         (SELECT MAX(created_at) FROM audit_events) AS audit_latest_at,
         (SELECT MAX(updated_at) FROM funnel_counters) AS analytics_latest_at,
         (SELECT MAX(processed_at) FROM billing_events) AS billing_event_latest_at,
         (SELECT MAX(processed_at) FROM billing_events WHERE event_type NOT LIKE '%.canary') AS real_billing_event_latest_at`,
    ).bind(now).first<{
      table_count: number;
      users_total: number;
      organizations_total: number;
      active_sessions: number;
      active_devices: number;
      device_heartbeat_latest_at: number | null;
      audit_latest_at: number | null;
      analytics_latest_at: number | null;
      billing_event_latest_at: number | null;
      real_billing_event_latest_at: number | null;
    }>();
    if (Number(health?.table_count) !== 5) {
      throw new Error("required D1 migrations are missing");
    }
    return Response.json({
      ok: true,
      service: "leash-control",
      database: "available",
      schema: "current",
      checkedAt: now,
      telemetry: {
        usersTotal: Number(health?.users_total ?? 0),
        organizationsTotal: Number(health?.organizations_total ?? 0),
        activeSessions: Number(health?.active_sessions ?? 0),
        activeDevices: Number(health?.active_devices ?? 0),
        deviceHeartbeatLatestAt: health?.device_heartbeat_latest_at ?? null,
        auditLatestAt: health?.audit_latest_at ?? null,
        analyticsLatestAt: health?.analytics_latest_at ?? null,
        billingEventLatestAt: health?.billing_event_latest_at ?? null,
        realBillingEventLatestAt: health?.real_billing_event_latest_at ?? null,
      },
    });
  } catch (error) {
    console.error("control_plane_health_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      {
        ok: false,
        service: "leash-control",
        database: "unavailable",
        schema: "unknown",
        code: "LEASH_DATABASE_UNAVAILABLE",
        retryAfterMs: 60_000,
        remediation: "Apply the control-plane D1 migrations before serving traffic.",
      },
      { status: 503, headers: { "retry-after": "60" } },
    );
  }
}
