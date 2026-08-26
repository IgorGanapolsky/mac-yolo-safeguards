import { hasLeakedToolProtocol } from "./chat-output-safety";

export type ConversationMessageMeta = {
  status: string;
  timestamp: number | null;
  timestampSource: "message" | "task" | "sync" | null;
};

type SnapshotMessage = {
  role: string;
  content?: string | null;
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
  const incompleteToolRun = message.role === "assistant" && hasLeakedToolProtocol(message.content);
  return {
    status: incompleteToolRun ? "incomplete" : message.role === "assistant" ? "completed" : message.role === "user" ? "sent" : "context",
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

/** Chat-facing status. Never dump operator enums like cloud_pending. */
export function chatOutputStatus(status: string): string {
  if (status === "cloud_pending" || status === "local_pending" || status === "pending") {
    return "waiting";
  }
  if (status === "running") return "working";
  return status;
}

export function pendingWaitCopy(status?: string): string {
  if (status === "running") return "Hermes is working on this.";
  return "Hermes hasn't started this yet.";
}

export function taskOutputMeta(task: ConversationTask): ConversationMessageMeta {
  const createdAt = validTimestamp(task.createdAt);
  const completedAt = validTimestamp(task.completedAt);
  const terminal = Boolean(task.result || task.error || ["completed", "failed"].includes(task.status));
  const incompleteToolRun = hasLeakedToolProtocol(task.result);
  const raw = task.error ? "failed" : incompleteToolRun ? "incomplete" : task.result ? "completed" : task.status;
  return {
    status: chatOutputStatus(raw),
    timestamp: terminal ? completedAt ?? createdAt : createdAt,
    timestampSource: completedAt || createdAt ? "task" : null,
  };
}
