import { currentAdminSession } from "@/lib/admin-auth";
import { collectAdminMetrics } from "@/lib/admin-metrics";
import { jsonError } from "@/lib/security";

export async function GET() {
  if (!(await currentAdminSession())) return jsonError("admin sign-in required", 401);
  try {
    const metrics = await collectAdminMetrics();
    return Response.json(metrics, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "metrics failed", 500);
  }
}
