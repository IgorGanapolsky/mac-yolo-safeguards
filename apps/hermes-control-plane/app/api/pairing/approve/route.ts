import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { defaultFailoverModeForOrganization } from "@/lib/continuity-defaults";
import { decideDevicePairing, type FailoverMode } from "@/lib/device-pairing";
import { db } from "@/lib/runtime";
import { displayFingerprint, jsonError, sha256 } from "@/lib/security";

/**
 * Approve a pairing grant.
 *
 * Same-machine re-pair is common (installer re-run, --pair, recovered config).
 * Always minting a new device id for the same public key left ghost rows with the
 * same hostname (two "Igors-MacBook-Pro" cards). Reuse the org's existing row for
 * this fingerprint so the dashboard shows one machine per key.
 */
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
  const defaultFailover = defaultFailoverModeForOrganization(
    organization ?? { plan: "free", trialEndsAt: null },
  ) as FailoverMode;
  const now = Date.now();

  // Prefer the active row for this fingerprint; otherwise revive the newest revoked twin.
  const existing = await db().prepare(
    `SELECT id, failover_mode AS failoverMode, revoked_at AS revokedAt
       FROM devices
      WHERE organization_id = ? AND fingerprint = ?
      ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,
               last_seen_at DESC NULLS LAST,
               created_at DESC
      LIMIT 1`
  ).bind(session.organizationId, grant.fingerprint).first<{
    id: string;
    failoverMode: string;
    revokedAt: number | null;
  }>();

  const decision = decideDevicePairing({
    existing,
    defaultFailover,
    newDeviceId: crypto.randomUUID(),
  });
  const { deviceId, failoverMode, reused } = decision;

  if (decision.kind === "reuse") {
    await db().batch([
      db().prepare(
        `UPDATE devices
            SET name = ?, public_jwk = ?, failover_mode = ?, revoked_at = NULL, updated_at = ?
          WHERE id = ? AND organization_id = ?`
      ).bind(grant.deviceName, grant.publicJwk, failoverMode, now, deviceId, session.organizationId),
      // Collapse any accidental active twins with the same key (pre-dedupe data).
      db().prepare(
        `UPDATE devices
            SET revoked_at = ?, updated_at = ?
          WHERE organization_id = ? AND fingerprint = ? AND id <> ? AND revoked_at IS NULL`
      ).bind(now, now, session.organizationId, grant.fingerprint, deviceId),
      db().prepare(
        `UPDATE pairing_grants SET organization_id = ?, approved_by_user_id = ?, device_id = ?, approved_at = ?
          WHERE id = ? AND approved_at IS NULL`
      ).bind(session.organizationId, session.userId, deviceId, now, grant.id),
    ]);
  } else {
    await db().batch([
      db().prepare(
        `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(deviceId, session.organizationId, grant.deviceName, grant.publicJwk, grant.fingerprint, failoverMode, now, now),
      db().prepare(
        `UPDATE pairing_grants SET organization_id = ?, approved_by_user_id = ?, device_id = ?, approved_at = ?
          WHERE id = ? AND approved_at IS NULL`
      ).bind(session.organizationId, session.userId, deviceId, now, grant.id),
    ]);
  }

  await audit({
    organizationId: session.organizationId,
    actorType: "user",
    actorId: session.userId,
    action: reused ? "device.pair.reuse" : "device.pair",
    targetType: "device",
    targetId: deviceId,
    metadata: {
      fingerprint: displayFingerprint(grant.fingerprint),
      failoverMode,
      reused,
    },
  });
  return Response.json({
    device: {
      id: deviceId,
      name: grant.deviceName,
      fingerprint: displayFingerprint(grant.fingerprint),
      failoverMode,
      reused,
    },
  }, { status: reused ? 200 : 201 });
}
