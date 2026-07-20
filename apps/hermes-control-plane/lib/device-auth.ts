import { db } from "./runtime";
import { fromBase64Url, jsonError, sha256 } from "./security";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface DeviceIdentity {
  id: string;
  organizationId: string;
  name: string;
  failoverMode: "disabled" | "manual" | "auto";
}

export async function requireDevice(request: Request, bodyText: string): Promise<DeviceIdentity | Response> {
  const deviceId = request.headers.get("x-hermes-device");
  const timestamp = request.headers.get("x-hermes-timestamp");
  const nonce = request.headers.get("x-hermes-nonce");
  const signature = request.headers.get("x-hermes-signature");
  if (!deviceId || !timestamp || !nonce || !signature) return jsonError("signed device headers are required", 401);
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > MAX_CLOCK_SKEW_MS) {
    return jsonError("device request timestamp is outside the allowed window", 401);
  }
  const row = await db().prepare(
    `SELECT id, organization_id AS organizationId, name, failover_mode AS failoverMode, public_jwk AS publicJwk
       FROM devices WHERE id = ? AND revoked_at IS NULL`
  ).bind(deviceId).first<DeviceIdentity & { publicJwk: string }>();
  if (!row) return jsonError("unknown or revoked device", 401);

  const nonceHash = await sha256(`${deviceId}:${nonce}`);
  const seen = await db().prepare("SELECT nonce_hash FROM request_nonces WHERE nonce_hash = ?").bind(nonceHash).first();
  if (seen) return jsonError("replayed device request", 401);

  const url = new URL(request.url);
  const bodyHash = await sha256(bodyText);
  const canonical = [request.method.toUpperCase(), url.pathname, timestamp, nonce, bodyHash].join("\n");
  try {
    const key = await crypto.subtle.importKey("jwk", JSON.parse(row.publicJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, fromBase64Url(signature), new TextEncoder().encode(canonical)
    );
    if (!verified) return jsonError("invalid device signature", 401);
  } catch {
    return jsonError("invalid device public key", 401);
  }

  const now = Date.now();
  await db().batch([
    db().prepare("INSERT INTO request_nonces (nonce_hash, device_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(nonceHash, deviceId, now + MAX_CLOCK_SKEW_MS, now),
    db().prepare("DELETE FROM request_nonces WHERE expires_at < ?").bind(now),
  ]);
  return { id: row.id, organizationId: row.organizationId, name: row.name, failoverMode: row.failoverMode };
}
