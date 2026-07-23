import { db, runtimeEnv } from "@/lib/runtime";

export async function GET() {
  try {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const dayAgo = now - 86_400_000;
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
         (SELECT MAX(processed_at) FROM billing_events WHERE event_type NOT LIKE '%.canary') AS real_billing_event_latest_at,
         (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'landing_view') AS landing_views_today,
         (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'sign_in_click') AS sign_in_clicks_today,
         (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'cloud_continuity_click') AS cloud_continuity_clicks_today,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'auth.login') AS logins_last_24h,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action IN ('device.pair', 'device.pair.reuse')) AS pairings_last_24h,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'billing.checkout.created') AS checkout_created_last_24h,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'billing.checkout.failed') AS checkout_failed_last_24h,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'billing.portal.created') AS portal_created_last_24h,
         (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'billing.portal.failed') AS portal_failed_last_24h,
         (SELECT COUNT(*) FROM billing_events WHERE processed_at >= ? AND event_type NOT LIKE '%.canary') AS billing_events_last_24h,
         (SELECT COUNT(*) FROM organizations WHERE plan IN ('pro', 'team')) AS paid_organizations_total`,
    ).bind(now, day, day, day, dayAgo, dayAgo, dayAgo, dayAgo, dayAgo, dayAgo, dayAgo).first<{
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
      landing_views_today: number;
      sign_in_clicks_today: number;
      cloud_continuity_clicks_today: number;
      logins_last_24h: number;
      pairings_last_24h: number;
      checkout_created_last_24h: number;
      checkout_failed_last_24h: number;
      portal_created_last_24h: number;
      portal_failed_last_24h: number;
      billing_events_last_24h: number;
      paid_organizations_total: number;
    }>();
    if (Number(health?.table_count) !== 5) {
      throw new Error("required D1 migrations are missing");
    }
    const current = runtimeEnv();
    const config = {
      workosAuthConfigured: Boolean(current.WORKOS_CLIENT_ID && current.WORKOS_API_KEY && current.WORKOS_REDIRECT_URI),
      stripeCheckoutConfigured: Boolean(current.STRIPE_SECRET_KEY && current.STRIPE_PRICE_ID),
      stripeWebhookConfigured: Boolean(current.STRIPE_WEBHOOK_SECRET),
      cloudRunnerConfigured: Boolean(current.HERMES_CLOUD_RUNNER_TOKEN),
    };
    const concerns = Object.entries(config)
      .filter(([, configured]) => !configured)
      .map(([name]) => `${name} is false`);
    return Response.json({
      ok: true,
      ready: concerns.length === 0,
      status: concerns.length === 0 ? "ok" : "degraded",
      service: "leash-control",
      database: "available",
      schema: "current",
      checkedAt: now,
      config,
      concerns,
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
        landingViewsToday: Number(health?.landing_views_today ?? 0),
        signInClicksToday: Number(health?.sign_in_clicks_today ?? 0),
        cloudContinuityClicksToday: Number(health?.cloud_continuity_clicks_today ?? 0),
        loginsLast24h: Number(health?.logins_last_24h ?? 0),
        pairingsLast24h: Number(health?.pairings_last_24h ?? 0),
        checkoutCreatedLast24h: Number(health?.checkout_created_last_24h ?? 0),
        checkoutFailedLast24h: Number(health?.checkout_failed_last_24h ?? 0),
        portalCreatedLast24h: Number(health?.portal_created_last_24h ?? 0),
        portalFailedLast24h: Number(health?.portal_failed_last_24h ?? 0),
        billingEventsLast24h: Number(health?.billing_events_last_24h ?? 0),
        paidOrganizationsTotal: Number(health?.paid_organizations_total ?? 0),
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
