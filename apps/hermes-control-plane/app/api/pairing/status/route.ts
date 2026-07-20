import { db } from "@/lib/runtime";
import { jsonError, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { deviceCode?: string } | null;
  if (!payload?.deviceCode) return jsonError("deviceCode is required");
  const row = await db().prepare(
    `SELECT id, device_id AS deviceId, approved_at AS approvedAt, consumed_at AS consumedAt, expires_at AS expiresAt
       FROM pairing_grants WHERE device_code_hash = ?`
  ).bind(await sha256(payload.deviceCode)).first<{ id: string; deviceId: string | null; approvedAt: number | null; consumedAt: number | null; expiresAt: number }>();
  if (!row || row.expiresAt < Date.now()) return jsonError("pairing code expired", 410);
  if (!row.approvedAt || !row.deviceId) return Response.json({ status: "pending" }, { status: 202 });
  if (!row.consumedAt) await db().prepare("UPDATE pairing_grants SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(Date.now(), row.id).run();
  return Response.json({ status: "paired", deviceId: row.deviceId });
}
