import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/runtime";
import { displayFingerprint, jsonError, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => null) as { userCode?: string } | null;
  const normalized = payload?.userCode?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  if (normalized.length !== 8) return jsonError("enter the eight-character pairing code");
  const grant = await db().prepare(
    `SELECT id, device_name AS deviceName, public_jwk AS publicJwk, fingerprint, approved_at AS approvedAt
       FROM pairing_grants WHERE user_code_hash = ? AND expires_at > ?`
  ).bind(await sha256(normalized), Date.now()).first<{ id: string; deviceName: string; publicJwk: string; fingerprint: string; approvedAt: number | null }>();
  if (!grant) return jsonError("pairing code not found or expired", 404);
  if (grant.approvedAt) return jsonError("pairing code was already used", 409);
  const deviceId = crypto.randomUUID();
  const now = Date.now();
  await db().batch([
    db().prepare(
      `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`
    ).bind(deviceId, session.organizationId, grant.deviceName, grant.publicJwk, grant.fingerprint, now, now),
    db().prepare(
      `UPDATE pairing_grants SET organization_id = ?, approved_by_user_id = ?, device_id = ?, approved_at = ?
        WHERE id = ? AND approved_at IS NULL`
    ).bind(session.organizationId, session.userId, deviceId, now, grant.id),
  ]);
  await audit({ organizationId: session.organizationId, actorType: "user", actorId: session.userId, action: "device.pair", targetType: "device", targetId: deviceId, metadata: { fingerprint: displayFingerprint(grant.fingerprint) } });
  return Response.json({ device: { id: deviceId, name: grant.deviceName, fingerprint: displayFingerprint(grant.fingerprint), failoverMode: "manual" } }, { status: 201 });
}
