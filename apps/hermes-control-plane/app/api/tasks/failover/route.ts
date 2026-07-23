import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  evaluateCloudContinuation,
  governanceAuditMetadata,
  governanceError,
} from "@/lib/agent-governance";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const organization = await db().prepare(
    "SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?",
  ).bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null }>();
  const governedOrganization = organization ?? { plan: "suspended", trialEndsAt: null };
  const entitlementDecision = evaluateCloudContinuation({
    organization: governedOrganization,
    cloudTasks: 0,
    cloudTaskDelta: 0,
  });
  if (!entitlementDecision.allowed) {
    await audit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "task.policy.denied",
      targetType: "task-failover",
      metadata: governanceAuditMetadata(entitlementDecision, { stage: "manual_failover", route: "cloud" }),
    });
    return governanceError(entitlementDecision);
  }
  const payload = await request.json().catch(() => null) as { taskId?: string } | null;
  if (!payload?.taskId) return jsonError("taskId is required");
  const candidate = await db().prepare(
    `SELECT id FROM tasks
      WHERE id = ? AND organization_id = ? AND status IN ('needs_failover', 'offline_blocked') AND lease_owner IS NULL`,
  ).bind(payload.taskId, session.organizationId).first<{ id: string }>();
  if (!candidate) return jsonError("task is not eligible for cloud failover", 409);
  const now = Date.now();
  const windowStart = now - 30 * 24 * 60 * 60 * 1000;
  const usage = await db().prepare(
    "SELECT COUNT(*) AS cloudTasks FROM tasks WHERE organization_id = ? AND route = 'cloud' AND created_at >= ?",
  ).bind(session.organizationId, windowStart).first<{ cloudTasks: number | null }>();
  const decision = evaluateCloudContinuation({
    organization: governedOrganization,
    cloudTasks: usage?.cloudTasks ?? 0,
    cloudTaskDelta: 1,
    now,
  });
  if (!decision.allowed) {
    await audit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "task.policy.denied",
      targetType: "task",
      targetId: payload.taskId,
      metadata: governanceAuditMetadata(decision, { stage: "manual_failover", route: "cloud" }),
    });
    return governanceError(decision);
  }
  const cloudLimit = decision.limit ?? 0;
  const update = await db().prepare(
    `UPDATE tasks SET status = 'cloud_pending', route = 'cloud', updated_at = ?
      WHERE id = ? AND organization_id = ? AND status IN ('needs_failover', 'offline_blocked') AND lease_owner IS NULL
        AND (SELECT COUNT(*) FROM tasks AS cloud_budget
              WHERE cloud_budget.organization_id = ? AND cloud_budget.route = 'cloud'
                AND cloud_budget.created_at >= ?) < ?`
  ).bind(now, payload.taskId, session.organizationId, session.organizationId, windowStart, cloudLimit).run();
  if (update.meta.changes !== 1) return jsonError("task is not eligible for cloud failover", 409);
  await audit({
    organizationId: session.organizationId,
    actorType: "user",
    actorId: session.userId,
    action: "task.failover.approve",
    targetType: "task",
    targetId: payload.taskId,
    metadata: governanceAuditMetadata(decision, { stage: "manual_failover", route: "cloud" }),
  });
  return Response.json({
    ok: true,
    status: "cloud_pending",
    route: "cloud",
    policyVersion: decision.policyVersion,
  });
}
