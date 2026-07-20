import { db } from "./runtime";

export async function audit(input: {
  organizationId?: string | null;
  actorType: "user" | "device" | "runner" | "system";
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db().prepare(
    `INSERT INTO audit_events
      (id, organization_id, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), input.organizationId ?? null, input.actorType, input.actorId ?? null,
    input.action, input.targetType, input.targetId ?? null, JSON.stringify(input.metadata ?? {}), Date.now()
  ).run();
}
