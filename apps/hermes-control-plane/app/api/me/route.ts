import { currentSession, workosConfigured } from "@/lib/auth";
import { CONTINUITY_USAGE_WINDOW_MS, buildContinuityUsage } from "@/lib/continuity-usage";
import { hasCloudContinuationAccess } from "@/lib/entitlements";
import { db, runtimeEnv } from "@/lib/runtime";

export async function GET() {
  const session = await currentSession();
  // Always 200 for landing chrome (avoids noisy 401 in console). Cache never.
  if (!session) {
    return Response.json(
      { authenticated: false, workosConfigured: workosConfigured() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const now = Date.now();
  const org = await db().prepare(
    "SELECT plan, trial_ends_at AS trialEndsAt, COALESCE(cloud_task_bonus, 0) AS cloudTaskBonus FROM organizations WHERE id = ?",
  ).bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null; cloudTaskBonus: number }>();
  const plan = org?.plan ?? session.plan;
  const trialEndsAt = org?.trialEndsAt ?? session.trialEndsAt;
  const bonus = org?.cloudTaskBonus ?? 0;

  const usageRow = await db().prepare(
    `SELECT COUNT(*) AS cloudTasks FROM tasks
      WHERE organization_id = ? AND route = 'cloud' AND created_at >= ?`,
  ).bind(session.organizationId, now - CONTINUITY_USAGE_WINDOW_MS)
    .first<{ cloudTasks: number | null }>();

  const packConfigured = Boolean(runtimeEnv().STRIPE_CONTINUITY_PACK_PRICE_ID && runtimeEnv().STRIPE_SECRET_KEY);
  const continuityUsage = buildContinuityUsage({
    plan,
    trialEndsAt,
    used: usageRow?.cloudTasks ?? 0,
    bonus,
    packConfigured,
    now,
  });

  return Response.json(
    {
      authenticated: true,
      user: { id: session.userId, email: session.email, name: session.name, avatarUrl: session.avatarUrl },
      organization: {
        id: session.organizationId,
        plan,
        trialEndsAt,
        cloudAccess: hasCloudContinuationAccess({ plan, trialEndsAt }),
      },
      continuityUsage,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
