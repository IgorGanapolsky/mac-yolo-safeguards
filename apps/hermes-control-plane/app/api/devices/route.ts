import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { devicePresenceLabel, isDeviceOnline, isDeviceStale } from "@/lib/device-pairing";
import { db } from "@/lib/runtime";
import { displayFingerprint, jsonError } from "@/lib/security";

interface DeviceRow {
  id: string;
  name: string;
  fingerprint: string;
  failoverMode: string;
  lastSeenAt: number | null;
  createdAt: number;
}

export async function GET() {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const now = Date.now();
  const result = await db().prepare(
    `SELECT id, name, fingerprint, failover_mode AS failoverMode, last_seen_at AS lastSeenAt, created_at AS createdAt
       FROM devices WHERE organization_id = ? AND revoked_at IS NULL
       ORDER BY CASE WHEN last_seen_at IS NULL THEN 1 ELSE 0 END, last_seen_at DESC, created_at DESC`
  ).bind(session.organizationId).all<DeviceRow>();
  return Response.json({ devices: result.results.map((device: DeviceRow) => ({
    ...device,
    fingerprint: displayFingerprint(device.fingerprint),
    online: isDeviceOnline(device.lastSeenAt, now),
    stale: isDeviceStale(device.lastSeenAt, now),
    presence: devicePresenceLabel(device.lastSeenAt, now),
  })) });
}

export async function PATCH(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { deviceId?: string; failoverMode?: string } | null;
  if (!payload?.deviceId || !["disabled", "manual", "auto"].includes(payload.failoverMode ?? "")) {
    return jsonError("deviceId and failoverMode are required");
  }
  const update = await db().prepare(
    "UPDATE devices SET failover_mode = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND revoked_at IS NULL"
  ).bind(payload.failoverMode, Date.now(), payload.deviceId, session.organizationId).run();
  if (update.meta.changes !== 1) return jsonError("device not found", 404);
  await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId, action: "device.failover_mode.update", targetType: "device", targetId: payload.deviceId, metadata: { failoverMode: payload.failoverMode } });
  return Response.json({ ok: true });
}

/** Soft-revoke a paired connector so ghost / stale machines leave the dashboard. */
export async function DELETE(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { deviceId?: string } | null;
  if (!payload?.deviceId) return jsonError("deviceId is required");
  const now = Date.now();
  const update = await db().prepare(
    "UPDATE devices SET revoked_at = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND revoked_at IS NULL"
  ).bind(now, now, payload.deviceId, session.organizationId).run();
  if (update.meta.changes !== 1) return jsonError("device not found", 404);
  await audit({
    organizationId: session.organizationId,
    actorType: "user",
    actorId: session.userId,
    action: "device.revoke",
    targetType: "device",
    targetId: payload.deviceId,
    metadata: {},
  });
  return Response.json({ ok: true });
}
