import { pollApprovalRequest } from "@/lib/action-approvals";
import { db, runtimeEnv } from "@/lib/runtime";
import { verifyRunnerRequest } from "@/lib/runner-request-signature";
import { jsonError, sanitizeText } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.text();
  const auth = await verifyRunnerRequest(request, body, runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN);
  if (!auth.ok) return jsonError(auth.reason, 401);
  let payload: { approvalId?: unknown } | null;
  try {
    payload = JSON.parse(body || "null") as { approvalId?: unknown } | null;
  } catch {
    return jsonError("request body must be valid JSON");
  }
  const approvalId = typeof payload?.approvalId === "string" ? sanitizeText(payload.approvalId, 160) : "";
  if (!approvalId) return jsonError("approvalId is required");
  const approval = await pollApprovalRequest(db(), { runnerId: auth.runnerId, approvalId });
  return approval ? Response.json({ approval }) : jsonError("approval request not found", 404);
}
