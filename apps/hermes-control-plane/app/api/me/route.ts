import { currentSession, workosConfigured } from "@/lib/auth";
import { hasCloudContinuationAccess } from "@/lib/entitlements";
import { buildContinuityUsageSnapshot } from "@/lib/continuity-pricing";
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
  try {
    const now = Date.now();
    const windowStart = now - 30 * DAY_MS;
    const usageRow = await db()
      .prepare(
        `SELECT
           SUM(CASE WHEN route = 'cloud' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudTasks30d,
           SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) AS activeTasks
         FROM tasks
         WHERE organization_id = ?`,
      )
      .bind(windowStart, session.organizationId)
      .first<{ cloudTasks30d: number | null; activeTasks: number | null }>();

    usage = buildContinuityUsageSnapshot({
      plan: session.plan,
      cloudTasks30d: usageRow?.cloudTasks30d,
      activeTasks: usageRow?.activeTasks,
    });
  } catch {
    // Keep zeroed snapshot with plan-correct limits.
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
    },
    { headers: { "cache-control": "no-store" } },
  );
}
