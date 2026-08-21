import {
  cleanActionClass,
  cleanApprovalSummary,
  cleanApprovalTtl,
  cleanArgumentDigest,
  cleanIdempotencyKey,
  openApprovalRequest,
} from "@/lib/action-approvals";
import { db, runtimeEnv } from "@/lib/runtime";
import { verifyRunnerRequest } from "@/lib/runner-request-signature";
import { jsonError, sanitizeText } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.text();
  const auth = await verifyRunnerRequest(request, body, runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN);
  if (!auth.ok) return jsonError(auth.reason, 401);
  let payload: Record<string, unknown> | null;
  try {
    payload = JSON.parse(body || "null") as Record<string, unknown> | null;
  } catch {
    return jsonError("request body must be valid JSON");
  }
  const taskId = typeof payload?.taskId === "string" ? sanitizeText(payload.taskId, 160) : "";
  const idempotencyKey = cleanIdempotencyKey(payload?.idempotencyKey);
  const actionClass = cleanActionClass(payload?.actionClass);
  const summary = cleanApprovalSummary(payload?.summary);
  const argumentDigest = cleanArgumentDigest(payload?.argumentDigest);
  const ttlMs = cleanApprovalTtl(payload?.ttlMs);
  if (!taskId || !idempotencyKey || !actionClass || !summary || !argumentDigest || !ttlMs) {
    return jsonError("taskId, idempotencyKey, actionClass, redacted summary, argumentDigest, and bounded ttlMs are required");
  }
  const result = await openApprovalRequest(db(), {
    runnerId: auth.runnerId,
    taskId,
    idempotencyKey,
    actionClass,
    summary,
    argumentDigest,
    ttlMs,
  });
  if (!result.ok) return jsonError(result.reason, result.reason.includes("idempotency") ? 409 : 404);
  return Response.json({ approval: result.approval, created: result.created }, { status: result.created ? 201 : 200 });
}
