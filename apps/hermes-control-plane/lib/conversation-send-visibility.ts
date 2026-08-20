/**
 * After Enter/send on thumbgate.app/dashboard, the composer clears and the task
 * card updates — but conversation-history (the chat bubbles) is a different
 * store. Without an optimistic bubble + scroll-into-view, the prompt looks like
 * it vanished (2026-08-20 user report).
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

export function scrollConversationHistoryToLatest(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (!root) return false;
  const history = root.querySelector(".conversation-history");
  if (!(history instanceof HTMLElement)) return false;
  history.scrollTop = history.scrollHeight;
  const latest = history.querySelector(
    '.conversation-message.role-user[data-testid="conversation-user-prompt"]:last-of-type',
  );
  if (latest instanceof HTMLElement) {
    latest.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return true;
}
