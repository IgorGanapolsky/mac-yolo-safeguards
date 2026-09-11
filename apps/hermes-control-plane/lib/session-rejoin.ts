/**
 * Cloud → Mac rejoin packs for Hosted Hermes Continuity.
 *
 * Watermark is threads.cloud_rejoined_at (NOT synced_at). synced_at is Mac→cloud
 * push time; advancing it must never erase unfinished cloud catch-up.
 */

import { audit } from "./audit";
import { db } from "./runtime";
import {
  REJOIN_MAX_PACKS,
  REJOIN_MAX_TASKS_PER_PACK,
  buildRejoinHandoff,
  type CompletedCloudTask,
  type RejoinMessage,
} from "./session-rejoin-core";

export {
  REJOIN_HANDOFF_MAX_CHARS,
  REJOIN_MAX_PACKS,
  REJOIN_MAX_TASKS_PER_PACK,
  buildRejoinHandoff,
  formatRejoinHandoffBlock,
  type CompletedCloudTask,
  type RejoinMessage,
} from "./session-rejoin-core";

export type RejoinPack = {
  threadId: string;
  threadTitle: string;
  sourceSessionId: string;
  cloudRejoinedAt: number | null;
  watermark: number;
  taskIds: string[];
  handoffMessages: RejoinMessage[];
};

/** List cloud→Mac packs for a paired device (threads bound to this device). */
export async function listRejoinPacksForDevice(input: {
  deviceId: string;
  organizationId: string;
}): Promise<RejoinPack[]> {
  const threads = await db().prepare(
    `SELECT id AS threadId, title AS threadTitle, source_session_id AS sourceSessionId,
            cloud_rejoined_at AS cloudRejoinedAt
       FROM threads
      WHERE organization_id = ? AND device_id = ? AND deleted_at IS NULL
        AND source_session_id IS NOT NULL AND TRIM(source_session_id) <> ''
      ORDER BY updated_at DESC
      LIMIT ?`,
  ).bind(input.organizationId, input.deviceId, REJOIN_MAX_PACKS).all<{
    threadId: string;
    threadTitle: string;
    sourceSessionId: string;
    cloudRejoinedAt: number | null;
  }>();

  const packs: RejoinPack[] = [];
  for (const thread of threads.results ?? []) {
    const tasks = await db().prepare(
      `SELECT id, prompt, result, created_at AS createdAt FROM tasks
        WHERE thread_id = ? AND organization_id = ? AND status = 'completed'
          AND route = 'cloud' AND result IS NOT NULL AND TRIM(result) <> ''
          AND created_at > ?
        ORDER BY created_at ASC
        LIMIT ?`,
    ).bind(
      thread.threadId,
      input.organizationId,
      thread.cloudRejoinedAt ?? 0,
      REJOIN_MAX_TASKS_PER_PACK,
    ).all<CompletedCloudTask>();

    const built = buildRejoinHandoff(tasks.results ?? [], thread.cloudRejoinedAt);
    if (!built.handoffMessages.length) continue;
    packs.push({
      threadId: thread.threadId,
      threadTitle: thread.threadTitle,
      sourceSessionId: thread.sourceSessionId,
      cloudRejoinedAt: thread.cloudRejoinedAt,
      watermark: built.nextWatermark,
      taskIds: built.taskIds,
      handoffMessages: built.handoffMessages,
    });
  }
  return packs;
}

/** Ack successful Mac injects; advances cloud_rejoined_at monotonically. */
export async function ackRejoinPacks(input: {
  deviceId: string;
  organizationId: string;
  actorId: string;
  acks: Array<{ threadId: string; watermark: number }>;
}): Promise<{ accepted: number }> {
  const now = Date.now();
  let accepted = 0;
  for (const ack of input.acks) {
    const threadId = String(ack.threadId || "").trim();
    const watermark = Number(ack.watermark);
    if (!threadId || !Number.isFinite(watermark) || watermark <= 0) continue;
    const result = await db().prepare(
      `UPDATE threads
          SET cloud_rejoined_at = CASE
                WHEN cloud_rejoined_at IS NULL OR ? > cloud_rejoined_at THEN ?
                ELSE cloud_rejoined_at
              END,
              updated_at = ?
        WHERE id = ? AND organization_id = ? AND device_id = ? AND deleted_at IS NULL`,
    ).bind(watermark, watermark, now, threadId, input.organizationId, input.deviceId).run();
    if ((result.meta?.changes ?? 0) === 1) accepted += 1;
  }
  if (accepted) {
    await audit({
      organizationId: input.organizationId,
      actorType: "device",
      actorId: input.actorId,
      action: "device.sessions.rejoin",
      targetType: "device",
      targetId: input.deviceId,
      metadata: { accepted, ackCount: input.acks.length },
    });
  }
  return { accepted };
}
