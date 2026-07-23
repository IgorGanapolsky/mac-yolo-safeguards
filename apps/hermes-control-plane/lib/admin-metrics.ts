import { aggregateModelUsage } from "./model-usage";
import { microsToUsd } from "./model-usage-pricing";
import { db, runtimeEnv } from "./runtime";

const RUNNER_HEALTH_URL =
  process.env.HERMES_CLOUD_RUNNER_HEALTH_URL?.trim()
  || "https://igor-hermes-cloud-runner.fly.dev/health";

const CONTINUITY_PRICE_USD = 10; // list price for projected revenue
const CONTINUITY_INFRA_USD_PER_MONTH = Number(process.env.CONTINUITY_INFRA_USD_PER_MONTH || 5);

export type AdminMetrics = {
  checkedAt: number;
  health: {
    controlPlaneOk: boolean;
    database: string;
    runnerOk: boolean;
    runnerDegraded: boolean;
    runnerLastPollAt: number | null;
    runnerLastTaskAt: number | null;
    runnerError: string | null;
    config: Record<string, boolean>;
  };
  revenue: {
    paidOrganizations: number;
    listPriceUsdPerMonth: number;
    projectedMrrUsd: number;
    projectedArrUsd: number;
    billingEventsLast24h: number;
    realBillingEventLatestAt: number | null;
    note: string;
  };
  sessions: {
    activeWebSessions: number;
    sessionsCreatedLast24h: number;
    loginsLast24h: number;
  };
  activity: {
    tasksCreatedLast24h: number;
    tasksCompletedLast24h: number;
    tasksFailedLast24h: number;
    cloudCompleted30d: number;
    cloudFailed30d: number;
    cloudInflight: number;
    cloudSuccessRate30d: number | null;
    localCompleted30d: number;
    auditEventsLast24h: number;
    topAuditActions24h: Array<{ action: string; count: number }>;
    funnelToday: Record<string, number>;
  };
  /** Paired machines for paid orgs — no IPs, no fingerprints. Proxy for "sessions from paid users". */
  paidMachines: Array<{
    deviceIdPrefix: string;
    name: string;
    failoverMode: string;
    online: boolean;
    lastSeenAt: number | null;
    ageSeconds: number | null;
  }>;
  /** VPS Continuity runs — no prompts/results body. */
  continuityRuns: Array<{
    taskIdPrefix: string;
    status: string;
    route: string;
    createdAt: number;
    completedAt: number | null;
    durationMs: number | null;
    isCanary: boolean;
  }>;
  tokens: {
    available: boolean;
    note: string;
    rows24h: number;
    promptTokens24h: number;
    completionTokens24h: number;
    totalTokens24h: number;
    rows30d: number;
    promptTokens30d: number;
    completionTokens30d: number;
    totalTokens30d: number;
  };
  cost: {
    available: boolean;
    note: string;
    estimatedModelUsd24h: number;
    estimatedModelUsd30d: number;
    estimatedContinuityInfraUsdPerMonth: number;
    /** Rough monthly total = infra + (30d model * 1) — not annualized; model is trailing 30d. */
    estimatedCombinedUsd30d: number;
    priceBasis: string;
  };
  privacy: {
    chatBodies: false;
    ipAddresses: false;
    fingerprints: false;
    note: string;
  };
};

export async function collectAdminMetrics(): Promise<AdminMetrics> {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const dayAgo = now - 86_400_000;
  const window30d = now - 30 * 24 * 60 * 60 * 1000;
  const onlineThreshold = now - 60_000;

  let runner: { ok?: boolean; lastPollAt?: number; lastTaskAt?: number; degraded?: boolean } | null = null;
  let runnerError: string | null = null;
  try {
    const response = await fetch(RUNNER_HEALTH_URL, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) runnerError = `HTTP ${response.status}`;
    else runner = await response.json() as typeof runner;
  } catch (error) {
    runnerError = error instanceof Error ? error.message : String(error);
  }

  const current = runtimeEnv();
  const config = {
    workosAuthConfigured: Boolean(current.WORKOS_CLIENT_ID && current.WORKOS_API_KEY && current.WORKOS_REDIRECT_URI),
    stripeCheckoutConfigured: Boolean(current.STRIPE_SECRET_KEY && current.STRIPE_PRICE_ID),
    stripeWebhookConfigured: Boolean(current.STRIPE_WEBHOOK_SECRET),
    cloudRunnerConfigured: Boolean(current.HERMES_CLOUD_RUNNER_TOKEN),
  };

  const aggregate = await db().prepare(
    `SELECT
       (SELECT COUNT(*) FROM organizations WHERE plan IN ('pro', 'team')) AS paid_orgs,
       (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS active_sessions,
       (SELECT COUNT(*) FROM audit_events WHERE created_at >= ? AND action = 'auth.login') AS logins_24h,
       (SELECT COUNT(*) FROM sessions WHERE created_at >= ?) AS sessions_created_24h,
       (SELECT COUNT(*) FROM tasks WHERE created_at >= ?) AS tasks_created_24h,
       (SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND COALESCE(completed_at, updated_at) >= ?) AS tasks_completed_24h,
       (SELECT COUNT(*) FROM tasks WHERE status = 'failed' AND updated_at >= ?) AS tasks_failed_24h,
       (SELECT COUNT(*) FROM tasks WHERE route = 'cloud' AND status = 'completed' AND created_at >= ?) AS cloud_completed_30d,
       (SELECT COUNT(*) FROM tasks WHERE route = 'cloud' AND status = 'failed' AND created_at >= ?) AS cloud_failed_30d,
       (SELECT COUNT(*) FROM tasks WHERE route = 'cloud' AND status IN ('cloud_pending', 'running')) AS cloud_inflight,
       (SELECT COUNT(*) FROM tasks WHERE route = 'local' AND status = 'completed' AND created_at >= ?) AS local_completed_30d,
       (SELECT COUNT(*) FROM audit_events WHERE created_at >= ?) AS audit_24h,
       (SELECT MAX(processed_at) FROM billing_events WHERE event_type NOT LIKE '%.canary') AS real_billing_latest,
       (SELECT COUNT(*) FROM billing_events WHERE processed_at >= ? AND event_type NOT LIKE '%.canary') AS billing_events_24h,
       (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'landing_view') AS landing_views_today,
       (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'sign_in_click') AS sign_in_clicks_today,
       (SELECT COALESCE(SUM(count), 0) FROM funnel_counters WHERE day = ? AND event = 'cloud_continuity_click') AS cloud_continuity_clicks_today
    `,
  ).bind(
    now,
    dayAgo,
    dayAgo,
    dayAgo,
    dayAgo,
    dayAgo,
    window30d,
    window30d,
    window30d,
    dayAgo,
    dayAgo,
    day,
    day,
    day,
  ).first<{
    paid_orgs: number;
    active_sessions: number;
    logins_24h: number;
    sessions_created_24h: number;
    tasks_created_24h: number;
    tasks_completed_24h: number;
    tasks_failed_24h: number;
    cloud_completed_30d: number;
    cloud_failed_30d: number;
    cloud_inflight: number;
    local_completed_30d: number;
    audit_24h: number;
    real_billing_latest: number | null;
    billing_events_24h: number;
    landing_views_today: number;
    sign_in_clicks_today: number;
    cloud_continuity_clicks_today: number;
  }>();

  const topActions = await db().prepare(
    `SELECT action, COUNT(*) AS count
       FROM audit_events
      WHERE created_at >= ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 12`,
  ).bind(dayAgo).all<{ action: string; count: number }>();

  // Paid machines — no IP, no fingerprint, no email
  const paidMachines = await db().prepare(
    `SELECT d.id AS id, d.name AS name, d.failover_mode AS failoverMode, d.last_seen_at AS lastSeenAt
       FROM devices d
       JOIN organizations o ON o.id = d.organization_id
      WHERE d.revoked_at IS NULL
        AND o.plan IN ('pro', 'team')
      ORDER BY d.last_seen_at DESC NULLS LAST
      LIMIT 100`,
  ).all<{ id: string; name: string; failoverMode: string; lastSeenAt: number | null }>();

  const continuityRuns = await db().prepare(
    `SELECT id, status, route, created_at AS createdAt, completed_at AS completedAt,
            CASE WHEN id LIKE 'canary_%' THEN 1 ELSE 0 END AS isCanary
       FROM tasks
      WHERE route = 'cloud'
      ORDER BY created_at DESC
      LIMIT 50`,
  ).all<{
    id: string;
    status: string;
    route: string;
    createdAt: number;
    completedAt: number | null;
    isCanary: number;
  }>();

  const paidOrgs = Number(aggregate?.paid_orgs ?? 0);
  const cloudCompleted = Number(aggregate?.cloud_completed_30d ?? 0);
  const cloudFailed = Number(aggregate?.cloud_failed_30d ?? 0);
  const cloudDenom = cloudCompleted + cloudFailed;

  return {
    checkedAt: now,
    health: {
      controlPlaneOk: true,
      database: "available",
      runnerOk: Boolean(runner?.ok) && !runner?.degraded && !runnerError,
      runnerDegraded: Boolean(runner?.degraded || runnerError),
      runnerLastPollAt: runner?.lastPollAt ?? null,
      runnerLastTaskAt: runner?.lastTaskAt && runner.lastTaskAt > 0 ? runner.lastTaskAt : null,
      runnerError,
      config,
    },
    revenue: {
      paidOrganizations: paidOrgs,
      listPriceUsdPerMonth: CONTINUITY_PRICE_USD,
      projectedMrrUsd: paidOrgs * CONTINUITY_PRICE_USD,
      projectedArrUsd: paidOrgs * CONTINUITY_PRICE_USD * 12,
      billingEventsLast24h: Number(aggregate?.billing_events_24h ?? 0),
      realBillingEventLatestAt: aggregate?.real_billing_latest ?? null,
      note: "Projected MRR = paid orgs × Continuity list price ($10). Not Stripe cash-collected.",
    },
    sessions: {
      activeWebSessions: Number(aggregate?.active_sessions ?? 0),
      sessionsCreatedLast24h: Number(aggregate?.sessions_created_24h ?? 0),
      loginsLast24h: Number(aggregate?.logins_24h ?? 0),
    },
    activity: {
      tasksCreatedLast24h: Number(aggregate?.tasks_created_24h ?? 0),
      tasksCompletedLast24h: Number(aggregate?.tasks_completed_24h ?? 0),
      tasksFailedLast24h: Number(aggregate?.tasks_failed_24h ?? 0),
      cloudCompleted30d: cloudCompleted,
      cloudFailed30d: cloudFailed,
      cloudInflight: Number(aggregate?.cloud_inflight ?? 0),
      cloudSuccessRate30d: cloudDenom > 0 ? Number((cloudCompleted / cloudDenom).toFixed(4)) : null,
      localCompleted30d: Number(aggregate?.local_completed_30d ?? 0),
      auditEventsLast24h: Number(aggregate?.audit_24h ?? 0),
      topAuditActions24h: (topActions.results ?? []).map((row) => ({
        action: row.action,
        count: Number(row.count),
      })),
      funnelToday: {
        landing_view: Number(aggregate?.landing_views_today ?? 0),
        sign_in_click: Number(aggregate?.sign_in_clicks_today ?? 0),
        cloud_continuity_click: Number(aggregate?.cloud_continuity_clicks_today ?? 0),
      },
    },
    paidMachines: (paidMachines.results ?? []).map((device) => ({
      deviceIdPrefix: String(device.id).slice(0, 8),
      name: device.name || "unnamed-machine",
      failoverMode: device.failoverMode,
      online: Boolean(device.lastSeenAt && device.lastSeenAt >= onlineThreshold),
      lastSeenAt: device.lastSeenAt,
      ageSeconds: device.lastSeenAt ? Math.max(0, Math.floor((now - device.lastSeenAt) / 1000)) : null,
    })),
    continuityRuns: (continuityRuns.results ?? []).map((task) => ({
      taskIdPrefix: String(task.id).slice(0, 12),
      status: task.status,
      route: task.route,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      durationMs: task.completedAt && task.createdAt ? Math.max(0, task.completedAt - task.createdAt) : null,
      isCanary: Boolean(task.isCanary),
    })),
    tokens: await (async () => {
      const u24 = await aggregateModelUsage(dayAgo);
      const u30 = await aggregateModelUsage(window30d);
      const hasRows = u24.rows > 0 || u30.rows > 0;
      return {
        available: true,
        note: hasRows
          ? "From model_usage ledger (OpenAI-compatible usage on Continuity complete). No prompt bodies. No LangSmith."
          : "Ledger ready; no usage rows yet. After Continuity runs complete with provider usage, totals appear here. No LangSmith required.",
        rows24h: u24.rows,
        promptTokens24h: u24.promptTokens,
        completionTokens24h: u24.completionTokens,
        totalTokens24h: u24.totalTokens,
        rows30d: u30.rows,
        promptTokens30d: u30.promptTokens,
        completionTokens30d: u30.completionTokens,
        totalTokens30d: u30.totalTokens,
      };
    })(),
    cost: await (async () => {
      const u24 = await aggregateModelUsage(dayAgo);
      const u30 = await aggregateModelUsage(window30d);
      const model24 = microsToUsd(u24.estimatedUsdMicros);
      const model30 = microsToUsd(u30.estimatedUsdMicros);
      const infra = Number.isFinite(CONTINUITY_INFRA_USD_PER_MONTH) ? CONTINUITY_INFRA_USD_PER_MONTH : 5;
      return {
        available: true,
        note: "Model $ from token ledger × MODEL_PRICE_*_USD_PER_1M (defaults 0.15 in / 0.60 out). Infra is Fly Continuity estimate (CONTINUITY_INFRA_USD_PER_MONTH).",
        estimatedModelUsd24h: model24,
        estimatedModelUsd30d: model30,
        estimatedContinuityInfraUsdPerMonth: infra,
        estimatedCombinedUsd30d: Number((model30 + infra).toFixed(6)),
        priceBasis: `in=$${envPrice("MODEL_PRICE_INPUT_USD_PER_1M", 0.15)}/1M out=$${envPrice("MODEL_PRICE_OUTPUT_USD_PER_1M", 0.6)}/1M`,
      };
    })(),
    privacy: {
      chatBodies: false,
      ipAddresses: false,
      fingerprints: false,
      note: "Admin metrics intentionally omit chat bodies, IPs, fingerprints, and emails. Paid machines shown as names + online/stale only (connector sessions; not Tailscale API).",
    },
  };
}

function envPrice(name: string, fallback: number): number {
  const n = Number(process.env[name]?.trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
