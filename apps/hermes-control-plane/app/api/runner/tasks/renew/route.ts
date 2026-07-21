import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { renewTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const configured = runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || supplied !== configured) return jsonError("runner authentication failed", 401);
  const runnerId = request.headers.get("x-hermes-runner")?.slice(0, 100) || "default";
  const payload = await request.json().catch(() => null) as { taskId?: string; leaseToken?: string } | null;
  if (!payload?.taskId || !payload.leaseToken) return jsonError("taskId and leaseToken are required");
  const renewed = await renewTask({
    owner: `cloud:${runnerId}`,
    taskId: payload.taskId,
    leaseToken: payload.leaseToken,
    actorType: "runner",
  });
  return renewed ? Response.json(renewed) : jsonError("stale or invalid lease", 409);
}
