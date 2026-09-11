import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { ackRejoinPacks, listRejoinPacksForDevice } from "@/lib/session-rejoin";

const MAX_ACKS = 40;

/**
 * POST /api/device/sessions/rejoin
 *
 * Empty / {} body → list cloud→Mac rejoin packs for this device.
 * { acks: [{ threadId, watermark }] } → advance cloud_rejoined_at after Mac inject.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;

  let payload: { acks?: Array<{ threadId?: string; watermark?: number }> } = {};
  if (body.trim()) {
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return jsonError("invalid JSON body", 400);
    }
  }

  if (Array.isArray(payload.acks)) {
    if (payload.acks.length > MAX_ACKS) return jsonError(`acks must contain at most ${MAX_ACKS} items`, 400);
    const acks = payload.acks.map((ack) => ({
      threadId: String(ack?.threadId ?? ""),
      watermark: Number(ack?.watermark),
    }));
    const result = await ackRejoinPacks({
      deviceId: identity.id,
      organizationId: identity.organizationId,
      actorId: identity.id,
      acks,
    });
    return Response.json({ ok: true, ...result });
  }

  const packs = await listRejoinPacksForDevice({
    deviceId: identity.id,
    organizationId: identity.organizationId,
  });
  return Response.json({ ok: true, packs, serverTime: Date.now() });
}
