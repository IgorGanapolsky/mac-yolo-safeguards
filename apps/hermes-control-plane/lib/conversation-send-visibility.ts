/**
 * After Enter/send on thumbgate.app/dashboard, the composer clears and the task
 * card updates — but conversation-history (the chat bubbles) is a different
 * store. Without an optimistic bubble + scroll-into-view, the prompt looks like
 * it vanished (2026-08-20 user report).
 *
 * Additionally, loadWorkspace() fetches /api/threads and /api/tasks concurrently
 * with the optimistic render. If the just-created thread hasn't propagated to
 * /api/threads yet (race), loadWorkspace clears threadDetails and replaces
 * setTasks without the optimistic row — making the sent message disappear
 * (2026-08-20 user report: "i inputted a message, pressed enter, and don't see
 * the message i inputted").
 */

export type ConversationTask = {
  id: string;
  prompt: string;
  result: string | null;
  error: string | null;
  route: string;
  status: string;
  createdAt: number;
};

/** Append optimistic web tasks that the server response has not returned yet. */
export function mergeConversationTasks(
  serverTasks: ConversationTask[],
  optimisticTasks: ConversationTask[],
): ConversationTask[] {
  const serverIds = new Set(serverTasks.map((task) => task.id));
  const pending = optimisticTasks.filter((task) => task.id && !serverIds.has(task.id) && task.prompt.trim());
  return pending.length ? [...serverTasks, ...pending] : serverTasks;
}

/** Drop optimistic rows once the server list includes the same id. */
export function pruneResolvedOptimistic(
  optimisticTasks: ConversationTask[],
  serverTasks: ConversationTask[],
): ConversationTask[] {
  const serverIds = new Set(serverTasks.map((task) => task.id));
  return optimisticTasks.filter((task) => task.id && !serverIds.has(task.id));
}

/**
 * True when there are optimistic conversation tasks (just-sent prompts) that
 * the server has not confirmed yet. Used by loadWorkspace() to avoid
 * nuking threadDetails or replacing the task list while a user's message
 * is still pending server-side propagation.
 */
export function hasPendingConversationTasks(
  optimisticTasks: ConversationTask[],
): boolean {
  return optimisticTasks.some((task) => task.id && task.prompt.trim());
}

/** Minimal Task-compatible shape for merging optimistic rows into the task list. */
export type TaskLike = {
  id: string;
  threadId: string;
  prompt: string;
  status: string;
  route: string;
  result: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deviceName: string | null;
};

/**
 * Merge server-returned Task[] with pending optimistic conversation tasks
 * that haven't landed on the server yet. Preserves the just-sent task row
 * in the task list until the server confirms it.
 *
 * `optimisticTasks` are converted to `TaskLike` via `toTaskLike`.
 */
export function mergeTasksForTaskList<T extends TaskLike & { threadTitle?: string }>(
  serverTasks: T[],
  optimisticTasks: ConversationTask[],
  threadId: string,
): T[] {
  const serverIds = new Set(serverTasks.map((task) => task.id));
  const pending = optimisticTasks
    .filter((task) => task.id && !serverIds.has(task.id) && task.prompt.trim())
    .map((task) => ({
      id: task.id,
      threadId,
      threadTitle: task.prompt.slice(0, 72),
      prompt: task.prompt,
      status: task.status,
      route: task.route,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.createdAt,
      completedAt: null,
      deviceName: null,
    }) as T);
  return pending.length ? [...serverTasks, ...pending] : serverTasks;
}

export function scrollConversationHistoryToLatest(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (!root) return false;
  const history = root.querySelector(".conversation-history");
  if (!(history instanceof HTMLElement)) return false;
  history.scrollTop = history.scrollHeight;
  const latest = history.querySelector(":scope > .conversation-message:last-child");
  if (latest instanceof HTMLElement) {
    latest.scrollIntoView({ behavior, block: "end" });
  }
  return true;
}
