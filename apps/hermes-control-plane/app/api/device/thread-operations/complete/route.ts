import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { completeThreadOperation } from "@/lib/thread-operations";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const payload = JSON.parse(body || "{}") as { operationId?: string; leaseToken?: string; error?: string };
  if (!payload.operationId || !payload.leaseToken) return jsonError("operationId and leaseToken are required");
  const completed = await completeThreadOperation({
    owner: `device:${identity.id}`,
    deviceId: identity.id,
    operationId: payload.operationId,
    leaseToken: payload.leaseToken,
    error: payload.error,
  });
  return completed ? Response.json({ ok: true }) : jsonError("stale or invalid lease", 409);
}
