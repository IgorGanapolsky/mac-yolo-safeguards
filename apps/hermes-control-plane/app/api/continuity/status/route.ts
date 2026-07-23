import { db } from "@/lib/runtime";

const RUNNER_HEALTH_URL =
  process.env.HERMES_CLOUD_RUNNER_HEALTH_URL?.trim()
  || "https://igor-hermes-cloud-runner.fly.dev/health";

type RunnerHealth = {
  ok?: boolean;
  lastPollAt?: number;
  lastTaskAt?: number;
  degraded?: boolean;
};

/**
 * Public Continuity status — no secrets, no workspace content.
 * Used for honest marketing + ops canaries (research checklist July 2026).
 */
export async function GET() {
  const now = Date.now();
  const windowStart = now - 30 * 24 * 60 * 60 * 1000;

  let runner: RunnerHealth | null = null;
  let runnerError: string | null = null;
  try {
    const response = await fetch(RUNNER_HEALTH_URL, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      runnerError = `runner health HTTP ${response.status}`;
    } else {
      runner = await response.json() as RunnerHealth;
    }
  } catch (error) {
    runnerError = error instanceof Error ? error.message : String(error);
  }

  const stats = await db().prepare(
    `SELECT
       SUM(CASE WHEN route = 'cloud' AND status = 'completed' AND created_at >= ? THEN 1 ELSE 0 END) AS cloud_completed_30d,
       SUM(CASE WHEN route = 'cloud' AND status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS cloud_failed_30d,
       SUM(CASE WHEN route = 'cloud' AND status IN ('cloud_pending', 'running') THEN 1 ELSE 0 END) AS cloud_inflight,
       MAX(CASE WHEN route = 'cloud' AND status = 'completed' THEN completed_at END) AS last_cloud_completed_at,
       MAX(CASE WHEN route = 'cloud' AND status = 'failed' THEN updated_at END) AS last_cloud_failed_at
     FROM tasks`,
  ).bind(windowStart, windowStart).first<{
    cloud_completed_30d: number | null;
    cloud_failed_30d: number | null;
    cloud_inflight: number | null;
    last_cloud_completed_at: number | null;
    last_cloud_failed_at: number | null;
  }>();

  const lastCanary = await db().prepare(
    `SELECT id, status, route, completed_at AS completedAt, substr(COALESCE(result, ''), 1, 80) AS resultPrefix
       FROM tasks
      WHERE route = 'cloud'
        AND (id LIKE 'canary_%' OR prompt LIKE 'Continuity live canary%' OR prompt LIKE 'Product-path Continuity canary%' OR prompt LIKE 'Failover healthcheck%')
      ORDER BY created_at DESC LIMIT 1`,
  ).first<{
    id: string;
    status: string;
    route: string;
    completedAt: number | null;
    resultPrefix: string | null;
  }>();

  const completed30d = Number(stats?.cloud_completed_30d ?? 0);
  const failed30d = Number(stats?.cloud_failed_30d ?? 0);
  const denom = completed30d + failed30d;
  const successRate30d = denom > 0 ? Number((completed30d / denom).toFixed(4)) : null;

  const runnerOk = Boolean(runner?.ok) && !runner?.degraded && !runnerError;
  const lastTaskAt = Number(runner?.lastTaskAt ?? 0);
  const hasRecentRunnerWork = lastTaskAt > 0 && now - lastTaskAt < 7 * 24 * 60 * 60 * 1000;

  return Response.json({
    ok: runnerOk,
    service: "thumbgate-continuity",
    checkedAt: now,
    claims: {
      model: "queued_prompt_handoff",
      not: "process_migration",
      description: "Eligible Continuity tasks continue on a fenced VPS runner when the paired Mac is offline.",
    },
    runner: {
      healthUrl: RUNNER_HEALTH_URL,
      reachable: runnerError === null,
      ok: runner?.ok ?? false,
      degraded: runner?.degraded ?? Boolean(runnerError),
      lastPollAt: runner?.lastPollAt ?? null,
      lastTaskAt: lastTaskAt > 0 ? lastTaskAt : null,
      error: runnerError,
    },
    tasks: {
      cloudCompleted30d: completed30d,
      cloudFailed30d: failed30d,
      cloudInflight: Number(stats?.cloud_inflight ?? 0),
      successRate30d,
      lastCloudCompletedAt: stats?.last_cloud_completed_at ?? null,
      lastCloudFailedAt: stats?.last_cloud_failed_at ?? null,
    },
    lastCanary: lastCanary
      ? {
          id: lastCanary.id,
          status: lastCanary.status,
          completedAt: lastCanary.completedAt,
          // Never return full prompts/results beyond a short canary prefix.
          resultPrefix: lastCanary.resultPrefix,
        }
      : null,
    readiness: {
      runnerHealthy: runnerOk,
      hasCompletedCloudWork30d: completed30d > 0,
      hasRecentRunnerWork,
      productReady: runnerOk && completed30d > 0,
    },
  }, {
    headers: {
      "cache-control": "public, max-age=30, s-maxage=30",
    },
  });
}
