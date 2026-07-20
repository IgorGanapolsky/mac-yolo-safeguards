import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { completeTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const payload = JSON.parse(body || "{}") as { taskId?: string; leaseToken?: string; result?: string; error?: string };
  if (!payload.taskId || !payload.leaseToken || (!payload.result && !payload.error)) return jsonError("taskId, leaseToken, and result or error are required");
  const completed = await completeTask({ owner: `device:${identity.id}`, taskId: payload.taskId, leaseToken: payload.leaseToken, result: payload.result, error: payload.error, actorType: "device" });
  return completed ? Response.json({ ok: true }) : jsonError("stale or invalid lease", 409);
}
