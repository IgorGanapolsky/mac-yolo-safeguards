import { noteRunnerInbound } from "./hosted-apphost";
import { db } from "./runtime";

const HEARTBEAT_ID = "default";

/** Fly polls claim even with no work. That inbound poll is runner liveness. */
export async function persistCloudRunnerHeartbeat(now = Date.now()): Promise<void> {
  noteRunnerInbound(now);
  try {
    const database = db();
    await database.prepare(
      `CREATE TABLE IF NOT EXISTS cloud_runner_heartbeat (
         id TEXT PRIMARY KEY,
         last_seen_at INTEGER NOT NULL
       )`,
    ).run();
    await database.prepare(
      `INSERT INTO cloud_runner_heartbeat (id, last_seen_at) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    ).bind(HEARTBEAT_ID, now).run();
  } catch {
    // Claims must not fail if D1 is briefly unavailable.
  }
}

export async function hydrateCloudRunnerHeartbeat(): Promise<void> {
  try {
    const row = await db().prepare(
      `SELECT last_seen_at AS lastSeenAt FROM cloud_runner_heartbeat WHERE id = ?`,
    ).bind(HEARTBEAT_ID).first<{ lastSeenAt: number }>();
    if (row?.lastSeenAt) noteRunnerInbound(Number(row.lastSeenAt));
  } catch {
    // Table may not exist yet on a fresh isolate.
  }
}
