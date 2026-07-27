import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { renewTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const payload = (() => {
    try { return JSON.parse(body || "{}") as { taskId?: string; leaseToken?: string }; }
    catch { return null; }
  })();
  if (!payload?.taskId || !payload.leaseToken) return jsonError("taskId and leaseToken are required");
  const renewed = await renewTask({
    owner: `device:${identity.id}`,
    taskId: payload.taskId,
    leaseToken: payload.leaseToken,
    actorType: "device",
  });
  return renewed ? Response.json(renewed) : jsonError("stale or invalid lease", 409);
}
