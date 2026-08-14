import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { completeTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  let payload: { taskId?: string; leaseToken?: string; result?: string; error?: string };
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!payload.taskId || !payload.leaseToken || (!payload.result && !payload.error)) return jsonError("taskId, leaseToken, and result or error are required");
  const completed = await completeTask({ owner: `device:${identity.id}`, taskId: payload.taskId, leaseToken: payload.leaseToken, result: payload.result, error: payload.error, actorType: "device" });
  return completed ? Response.json({ ok: true }) : jsonError("stale or invalid lease", 409);
}
