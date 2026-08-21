import { hasLeakedToolProtocol } from "./chat-output-safety";

export type ConversationMessageMeta = {
  status: string;
  timestamp: number | null;
  timestampSource: "message" | "task" | "sync" | null;
};

type SnapshotMessage = {
  role: string;
  createdAt?: number | null;
};

type ConversationTask = {
  status: string;
  createdAt: number;
  completedAt?: number | null;
  result?: string | null;
  error?: string | null;
};

function validTimestamp(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Synced Hermes snapshots historically store role/content without a per-message
 * clock. Prefer an exact message clock when present; otherwise show the thread's
 * sync time explicitly as a fallback instead of fabricating message precision.
 */
export function snapshotMessageMeta(
  message: SnapshotMessage,
  threadSyncedAt: number | null | undefined,
): ConversationMessageMeta {
  const exact = validTimestamp(message.createdAt);
  const synced = validTimestamp(threadSyncedAt);
  return {
    status: message.role === "assistant" ? "completed" : message.role === "user" ? "sent" : "context",
    timestamp: exact ?? synced,
    timestampSource: exact ? "message" : synced ? "sync" : null,
  };
}

export function taskPromptMeta(task: ConversationTask): ConversationMessageMeta {
  return {
    status: "sent",
    timestamp: validTimestamp(task.createdAt),
    timestampSource: validTimestamp(task.createdAt) ? "task" : null,
  };
}

export function taskOutputMeta(task: ConversationTask): ConversationMessageMeta {
  const createdAt = validTimestamp(task.createdAt);
  const completedAt = validTimestamp(task.completedAt);
  const terminal = Boolean(task.result || task.error || ["completed", "failed"].includes(task.status));
  const incompleteToolRun = hasLeakedToolProtocol(task.result);
  return {
    status: task.error ? "failed" : incompleteToolRun ? "incomplete" : task.result ? "completed" : task.status,
    timestamp: terminal ? completedAt ?? createdAt : createdAt,
    timestampSource: completedAt || createdAt ? "task" : null,
  };
}
