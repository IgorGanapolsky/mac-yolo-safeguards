import { decideApprovalRequest } from "@/lib/action-approvals";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/runtime";
import { jsonError, sanitizeText } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { decision?: unknown } | null;
  const decision = payload?.decision === "approved" || payload?.decision === "denied" ? payload.decision : null;
  const approvalId = sanitizeText((await context.params).id, 160);
  if (!decision || !approvalId) return jsonError("approvalId and decision are required");
  const result = await decideApprovalRequest(db(), {
    organizationId: session.organizationId,
    userId: session.userId,
    approvalId,
    decision,
  });
  return result.ok ? Response.json({ approval: result.approval }) : jsonError(result.reason, 409);
}
