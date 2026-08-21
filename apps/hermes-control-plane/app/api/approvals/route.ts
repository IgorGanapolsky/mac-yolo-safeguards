import { requireSession } from "@/lib/auth";
import { listOrganizationApprovals } from "@/lib/action-approvals";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  return Response.json(await listOrganizationApprovals(db(), session.organizationId));
}
