import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { defaultFailoverModeForOrganization } from "@/lib/continuity-defaults";
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
  const organization = await db().prepare(
    "SELECT plan, trial_ends_at AS trialEndsAt FROM organizations WHERE id = ?",
  ).bind(session.organizationId).first<{ plan: string; trialEndsAt: number | null }>();
  const now = Date.now();
  // Same physical Mac re-pairing with the same key (reinstalled connector, lost local
  // state, retried approval) must reuse its existing device row, not fork a duplicate.
  // Only match non-revoked devices — a revoked fingerprint re-pairs as a genuinely new row.
  const existing = await db().prepare(
    `SELECT id, failover_mode AS failoverMode FROM devices
      WHERE organization_id = ? AND fingerprint = ? AND revoked_at IS NULL LIMIT 1`,
  ).bind(session.organizationId, grant.fingerprint).first<{ id: string; failoverMode: string }>();

  const deviceId = existing?.id ?? crypto.randomUUID();
  const failoverMode = existing?.failoverMode ?? defaultFailoverModeForOrganization(
    organization ?? { plan: "free", trialEndsAt: null },
  );

  await db().batch([
    existing
      ? db().prepare(
          `UPDATE devices SET name = ?, public_jwk = ?, updated_at = ? WHERE id = ?`,
        ).bind(grant.deviceName, grant.publicJwk, now, existing.id)
      : db().prepare(
          `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(deviceId, session.organizationId, grant.deviceName, grant.publicJwk, grant.fingerprint, failoverMode, now, now),
    db().prepare(
      `UPDATE pairing_grants SET organization_id = ?, approved_by_user_id = ?, device_id = ?, approved_at = ?
        WHERE id = ? AND approved_at IS NULL`
    ).bind(session.organizationId, session.userId, deviceId, now, grant.id),
  ]);
  await audit({
    organizationId: session.organizationId,
    actorType: "user",
    actorId: session.userId,
    action: existing ? "device.repair" : "device.pair",
    targetType: "device",
    targetId: deviceId,
    metadata: { fingerprint: displayFingerprint(grant.fingerprint), failoverMode },
  });
  return Response.json({ device: { id: deviceId, name: grant.deviceName, fingerprint: displayFingerprint(grant.fingerprint), failoverMode } }, { status: 201 });
}
