import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { claimTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const configured = runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || supplied !== configured) return jsonError("runner authentication failed", 401);
  const runnerId = request.headers.get("x-hermes-runner")?.slice(0, 100) || "default";
  const claim = await claimTask({ route: "cloud", owner: `cloud:${runnerId}` });
  return claim ? Response.json(claim) : new Response(null, { status: 204 });
}
