import { db } from "@/lib/runtime";
import { displayFingerprint, jsonError, publicKeyFingerprint, randomToken, sha256 } from "@/lib/security";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function userCode(): string {
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  const value = Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { deviceName?: string; publicJwk?: JsonWebKey } | null;
  const name = payload?.deviceName?.trim().slice(0, 80);
  const key = payload?.publicJwk;
  if (!name || !key || key.kty !== "EC" || key.crv !== "P-256" || !key.x || !key.y) {
    return jsonError("deviceName and a P-256 publicJwk are required");
  }
  const deviceCode = randomToken(32);
  const code = userCode();
  const fingerprint = await publicKeyFingerprint(key);
  const now = Date.now();
  await db().prepare(
    `INSERT INTO pairing_grants
      (id, device_code_hash, user_code_hash, user_code_display, device_name, public_jwk, fingerprint, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), await sha256(deviceCode), await sha256(code.replace("-", "")), code, name,
    JSON.stringify(key), fingerprint, now + 10 * 60 * 1000, now).run();
  return Response.json({ deviceCode, userCode: code, fingerprint: displayFingerprint(fingerprint), expiresIn: 600 }, { status: 201 });
}
