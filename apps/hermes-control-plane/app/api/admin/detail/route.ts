import { currentAdminSession } from "@/lib/admin-auth";
import { db, runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

const RUNNER_HEALTH_URL =
  process.env.HERMES_CLOUD_RUNNER_HEALTH_URL?.trim()
  || "https://igor-hermes-cloud-runner.fly.dev/health";

/**
 * Deep-drill endpoint for the admin dashboard's clickable cards. Same privacy
 * boundary as /api/admin/metrics: no chat prompt/result bodies, no IPs, no
 * fingerprints, no emails — structural/operational detail only.
 */
export async function GET(request: Request) {
  if (!(await currentAdminSession())) return jsonError("admin sign-in required", 401);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");

  switch (kind) {
    case "health": {
      const startedAt = Date.now();
      let runner: unknown = null;
      let runnerError: string | null = null;
      try {
        const response = await fetch(RUNNER_HEALTH_URL, {
          signal: AbortSignal.timeout(8_000),
          headers: { accept: "application/json" },
        });
        runner = response.ok ? await response.json() : { httpStatus: response.status };
      } catch (error) {
        runnerError = error instanceof Error ? error.message : String(error);
      }
      const runnerFetchMs = Date.now() - startedAt;
      const dbStartedAt = Date.now();
      await db().prepare("SELECT 1").first();
      const d1PingMs = Date.now() - dbStartedAt;
      const current = runtimeEnv();
      return Response.json({
        runnerHealthUrl: RUNNER_HEALTH_URL,
        runnerRaw: runner,
        runnerError,
        runnerFetchMs,
        d1PingMs,
        config: {
          workosAuthConfigured: Boolean(current.WORKOS_CLIENT_ID && current.WORKOS_API_KEY && current.WORKOS_REDIRECT_URI),
          workosRedirectUri: current.WORKOS_REDIRECT_URI ?? null,
          stripeCheckoutConfigured: Boolean(current.STRIPE_SECRET_KEY && current.STRIPE_PRICE_ID),
          stripeWebhookConfigured: Boolean(current.STRIPE_WEBHOOK_SECRET),
          cloudRunnerConfigured: Boolean(current.HERMES_CLOUD_RUNNER_TOKEN),
        },
      });
    }
    case "sessions": {
      const rows = await db().prepare(
        `SELECT substr(id_hash,1,10) AS idPrefix, substr(organization_id,1,8) AS orgPrefix,
                created_at AS createdAt, expires_at AS expiresAt
           FROM sessions ORDER BY created_at DESC LIMIT 50`,
      ).all();
      return Response.json({ sessions: rows.results ?? [] });
    }
    case "revenue": {
      const rows = await db().prepare(
        `SELECT event_type AS eventType, substr(organization_id,1,8) AS orgPrefix, processed_at AS processedAt
           FROM billing_events WHERE event_type NOT LIKE '%.canary' ORDER BY processed_at DESC LIMIT 50`,
      ).all();
      return Response.json({ events: rows.results ?? [] });
    }
    case "activity": {
      const day = new Date().toISOString().slice(0, 10);
      const funnel = await db().prepare(
        `SELECT event, SUM(count) AS count FROM funnel_counters WHERE day = ? GROUP BY event ORDER BY count DESC`,
      ).bind(day).all();
      const actions = await db().prepare(
        `SELECT action, COUNT(*) AS count FROM audit_events WHERE created_at >= ? GROUP BY action ORDER BY count DESC LIMIT 50`,
      ).bind(Date.now() - 86_400_000).all();
      return Response.json({ funnelToday: funnel.results ?? [], topAuditActions24h: actions.results ?? [] });
    }
    case "device": {
      if (!id) return jsonError("id required", 400);
      const device = await db().prepare(
        `SELECT d.id AS id, d.name AS name, d.failover_mode AS failoverMode, d.last_seen_at AS lastSeenAt,
                d.created_at AS createdAt, d.updated_at AS updatedAt, d.revoked_at AS revokedAt, o.plan AS plan
           FROM devices d JOIN organizations o ON o.id = d.organization_id
          WHERE d.id LIKE ? || '%' LIMIT 1`,
      ).bind(id).first<Record<string, unknown>>();
      if (!device) return jsonError("device not found", 404);
      const events = await db().prepare(
        `SELECT action, actor_type AS actorType, created_at AS createdAt
           FROM audit_events WHERE target_id = ? ORDER BY created_at DESC LIMIT 25`,
      ).bind(device.id).all();
      const taskCounts = await db().prepare(
        `SELECT status, COUNT(*) AS count FROM tasks WHERE device_id = ? GROUP BY status`,
      ).bind(device.id).all();
      return Response.json({
        device: { ...device, id: `${String(device.id).slice(0, 8)}…` },
        recentAuditEvents: events.results ?? [],
        taskCountsByStatus: taskCounts.results ?? [],
      });
    }
    case "task": {
      if (!id) return jsonError("id required", 400);
      const task = await db().prepare(
        `SELECT id, status, route, lease_owner AS leaseOwner, lease_generation AS leaseGeneration,
                lease_expires_at AS leaseExpiresAt, error, created_at AS createdAt, updated_at AS updatedAt,
                completed_at AS completedAt, substr(device_id,1,8) AS devicePrefix, substr(organization_id,1,8) AS orgPrefix
           FROM tasks WHERE id LIKE ? || '%' LIMIT 1`,
      ).bind(id).first<Record<string, unknown>>();
      if (!task) return jsonError("task not found", 404);
      return Response.json({ task: { ...task, id: `${String(task.id).slice(0, 12)}…` } });
    }
    default:
      return jsonError("unknown kind", 400);
  }
}
