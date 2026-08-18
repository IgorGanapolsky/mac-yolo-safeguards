import { currentSession, workosConfigured } from "@/lib/auth";
import { hasCloudContinuationAccess } from "@/lib/entitlements";
import { buildContinuityUsageSnapshot } from "@/lib/continuity-pricing";
import {
  describeHostedResources,
  lastCachedModelError,
  MODEL_ERROR_LOOKBACK_MS,
  probeRunnerHealth,
} from "@/lib/hosted-apphost";
import { db } from "@/lib/runtime";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await currentSession();
  // Always 200 for landing chrome (avoids noisy 401 in console). Cache never.
  if (!session) {
    return Response.json(
      { authenticated: false, workosConfigured: workosConfigured() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  // Capacity meter must not take down /api/me if D1 is briefly unavailable.
  let usage = buildContinuityUsageSnapshot({
    plan: session.plan,
    cloudTasks30d: 0,
    activeTasks: 0,
  });
  let hostedRunner = {
    status: "waiting" as const,
    message: "Hosted runner status is still loading.",
  };
  let hostedModel = {
    status: "waiting" as const,
    message: "Hosted model status is still loading.",
  };
  try {
    const now = Date.now();
    const windowStart = now - 30 * DAY_MS;
    const [usageRow, lastFailed, runner] = await Promise.all([
      db()
        .prepare(
          `SELECT
             SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks30d,
             SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks
           FROM tasks
           WHERE organization_id = ?`,
        )
        .bind(windowStart, session.organizationId)
        .first<{ cloudTasks30d: number | null; activeTasks: number | null }>(),
      db()
        .prepare(
          `SELECT error FROM tasks
            WHERE organization_id = ? AND route = 'cloud' AND status = 'failed'
              AND error IS NOT NULL AND updated_at >= ?
            ORDER BY updated_at DESC LIMIT 1`,
        )
        .bind(session.organizationId, now - MODEL_ERROR_LOOKBACK_MS)
        .first<{ error: string | null }>(),
      probeRunnerHealth({ now, timeoutMs: 8_000 }),
    ]);

    usage = buildContinuityUsageSnapshot({
      plan: session.plan,
      cloudTasks30d: usageRow?.cloudTasks30d,
      activeTasks: usageRow?.activeTasks,
    });
    const hosted = describeHostedResources({
      runner: { ok: runner.ok, lastPollAt: runner.lastPollAt ?? null },
      modelError: lastFailed?.error ?? lastCachedModelError(),
      now,
      runnerKnown: true,
    });
    hostedRunner = hosted.hostedRunner;
    hostedModel = hosted.hostedModel;
  } catch {
    // Keep zeroed snapshot with plan-correct limits. Resources stay waiting.
  }

  return Response.json(
    {
      authenticated: true,
      user: { id: session.userId, email: session.email, name: session.name, avatarUrl: session.avatarUrl },
      organization: {
        id: session.organizationId,
        plan: session.plan,
        trialEndsAt: session.trialEndsAt,
        cloudAccess: hasCloudContinuationAccess(session),
      },
      // CoreWeave-style capacity truth: public caps + observed usage for the dashboard meter.
      continuityUsage: usage,
      hostedRunner,
      hostedModel,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
