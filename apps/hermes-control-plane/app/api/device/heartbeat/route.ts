import { audit } from "@/lib/audit";
import { requireDevice } from "@/lib/device-auth";
import { db } from "@/lib/runtime";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const now = Date.now();
  await db().batch([
    db().prepare("UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?").bind(now, now, identity.id),
    db().prepare(
      `UPDATE tasks SET route = 'local', status = 'local_pending', updated_at = ?
        WHERE device_id = ? AND route = 'cloud' AND status = 'cloud_pending' AND lease_owner IS NULL`
    ).bind(now, identity.id),
  ]);
  await audit({ organizationId: identity.organizationId, actorType: "device", actorId: identity.id, action: "device.heartbeat", targetType: "device", targetId: identity.id });
  return Response.json({ ok: true, serverTime: now, failoverMode: identity.failoverMode });
}
