import { consumeApprovalRequest } from "@/lib/action-approvals";
import { db, runtimeEnv } from "@/lib/runtime";
import { verifyRunnerRequest } from "@/lib/runner-request-signature";
import { jsonError, sanitizeText } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.text();
  const auth = await verifyRunnerRequest(request, body, runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN);
  if (!auth.ok) return jsonError(auth.reason, 401);
  const approvalId = sanitizeText((await context.params).id, 160);
  if (!approvalId) return jsonError("approvalId is required");
  const result = await consumeApprovalRequest(db(), { runnerId: auth.runnerId, approvalId });
  return result.ok ? Response.json({ approval: result.approval }) : jsonError(result.reason, 409);
}
