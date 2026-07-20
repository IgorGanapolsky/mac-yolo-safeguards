import { audit } from "@/lib/audit";
import { requireDevice } from "@/lib/device-auth";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

const MAX_SESSIONS = 100;
const MAX_CONTEXT_MESSAGES = 60;
const MAX_CONTEXT_CHARS = 48_000;
const MAX_BODY_BYTES = 1_000_000;

interface SessionInput {
  id?: string;
  title?: string;
  source?: string;
  model?: string;
  preview?: string;
  messageCount?: number;
  updatedAt?: number;
  messages?: Array<{ role?: string; content?: string }>;
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replaceAll("\u0000", "").trim().slice(0, limit) : "";
}

function contextSnapshot(messages: SessionInput["messages"]): string | null {
  if (!Array.isArray(messages)) return null;
  const cleaned = messages.slice(-MAX_CONTEXT_MESSAGES).flatMap((message) => {
    const role = ["user", "assistant", "system"].includes(message?.role ?? "") ? message.role! : "";
    const content = cleanText(message?.content, 8_000);
    return role && content ? [{ role, content }] : [];
  });
  let total = 0;
  const bounded: typeof cleaned = [];
  for (const message of cleaned.reverse()) {
    if (total + message.content.length > MAX_CONTEXT_CHARS) break;
    bounded.unshift(message);
    total += message.content.length;
  }
  return bounded.length ? JSON.stringify(bounded) : null;
}

export async function POST(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) return jsonError("session sync payload is too large", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return jsonError("session sync payload is too large", 413);
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const payload = JSON.parse(body || "{}") as { sessions?: SessionInput[] };
  if (!Array.isArray(payload.sessions) || payload.sessions.length > MAX_SESSIONS) {
    return jsonError(`sessions must contain at most ${MAX_SESSIONS} items`);
  }

  const owner = await db().prepare(
    `SELECT user_id AS userId FROM memberships
      WHERE organization_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC LIMIT 1`
  ).bind(identity.organizationId).first<{ userId: string }>();
  if (!owner) return jsonError("device organization has no owner", 409);

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  let accepted = 0;
  for (const item of payload.sessions) {
    const sourceSessionId = cleanText(item.id, 160);
    const title = cleanText(item.title, 120);
    if (!sourceSessionId || !title) continue;
    const source = cleanText(item.source, 40) || "hermes";
    const model = cleanText(item.model, 120) || null;
    const preview = cleanText(item.preview, 500) || null;
    const messageCount = Number.isFinite(item.messageCount) ? Math.max(0, Math.floor(item.messageCount!)) : 0;
    const sourceUpdatedAt = Number.isFinite(item.updatedAt) ? Math.max(0, Math.floor(item.updatedAt!)) : now;
    const snapshot = contextSnapshot(item.messages);
    statements.push(db().prepare(
      `INSERT INTO threads
        (id, organization_id, title, device_id, source_session_id, source, model, preview, message_count,
         context_snapshot, source_updated_at, synced_at, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, source_session_id) DO UPDATE SET
         title = excluded.title, source = excluded.source, model = excluded.model, preview = excluded.preview,
         message_count = excluded.message_count,
         context_snapshot = COALESCE(excluded.context_snapshot, threads.context_snapshot),
         source_updated_at = excluded.source_updated_at,
         synced_at = COALESCE(excluded.synced_at, threads.synced_at), updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), identity.organizationId, title, identity.id, sourceSessionId, source, model, preview,
      messageCount, snapshot, sourceUpdatedAt, snapshot ? now : null, owner.userId, now, now));
    accepted += 1;
  }
  if (statements.length) await db().batch(statements);
  await db().prepare("UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?").bind(now, now, identity.id).run();
  await audit({ organizationId: identity.organizationId, actorType: "device", actorId: identity.id, action: "device.sessions.sync", targetType: "device", targetId: identity.id, metadata: { accepted } });
  return Response.json({ ok: true, accepted, syncedAt: now });
}
