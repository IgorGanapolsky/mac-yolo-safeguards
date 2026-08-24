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

export function normalizeTaskPrompt(prompt: string | null | undefined): string {
  return String(prompt ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function taskProgressRank(task: {
  status: string;
  result?: string | null;
  error?: string | null;
}): number {
  if ((task.result && String(task.result).trim()) || (task.error && String(task.error).trim())) return 3;
  if (task.status === "completed" || task.status === "failed") return 2;
  if (task.status === "running") return 1;
  return 0;
}

export function preferRicherTask<T extends { status: string; result?: string | null; error?: string | null }>(
  current: T,
  incoming: T,
): T {
  return taskProgressRank(incoming) >= taskProgressRank(current) ? incoming : current;
}

export function preferRicherTaskList<T extends { id: string; status: string; result?: string | null; error?: string | null }>(
  left: T[],
  right: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of left) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of right) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    byId.set(row.id, prev ? preferRicherTask(prev, row) : row);
  }
  return [...byId.values()];
}

function promptKeySet<T extends { prompt?: string | null }>(rows: T[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = normalizeTaskPrompt(row.prompt);
    if (key) keys.add(key);
  }
  return keys;
}

/** Append optimistic web tasks that the server response has not returned yet. */
export function mergeConversationTasks(
  serverTasks: ConversationTask[],
  optimisticTasks: ConversationTask[],
  previousTasks: ConversationTask[] = [],
): ConversationTask[] {
  const serverIds = new Set(serverTasks.map((task) => task.id));
  const optimisticIds = new Set(optimisticTasks.map((task) => task.id));
  const optimisticPrompts = promptKeySet(optimisticTasks);
  const retainedPrevious = previousTasks.filter((task) => {
    if (!task.id) return false;
    return (
      serverIds.has(task.id)
      || optimisticIds.has(task.id)
      || optimisticPrompts.has(normalizeTaskPrompt(task.prompt))
    );
  });
  const base = preferRicherTaskList(retainedPrevious, serverTasks);
  const baseIds = new Set(base.map((task) => task.id));
  const basePrompts = promptKeySet(base);
  const pending = optimisticTasks.filter((task) => (
    Boolean(task.id)
    && Boolean(task.prompt.trim())
    && !baseIds.has(task.id)
    && !basePrompts.has(normalizeTaskPrompt(task.prompt))
  ));
  return pending.length ? [...base, ...pending] : base;
}

/** Drop optimistic rows once the server list includes the same id or prompt. */
export function pruneResolvedOptimistic(
  optimisticTasks: ConversationTask[],
  serverTasks: ConversationTask[],
): ConversationTask[] {
  const serverIds = new Set(serverTasks.map((task) => task.id));
  const serverPrompts = promptKeySet(serverTasks);
  return optimisticTasks.filter((task) => (
    Boolean(task.id)
    && !serverIds.has(task.id)
    && !serverPrompts.has(normalizeTaskPrompt(task.prompt))
  ));
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
  previousTasks: T[] = [],
): T[] {
  const optimisticIds = new Set(optimisticTasks.map((task) => task.id));
  const optimisticPrompts = promptKeySet(optimisticTasks);
  const byId = new Map<string, T>();
  for (const prev of previousTasks) {
    if (!prev?.id) continue;
    if (
      optimisticIds.has(prev.id)
      || optimisticPrompts.has(normalizeTaskPrompt(prev.prompt))
    ) {
      byId.set(prev.id, prev);
    }
  }
  for (const server of serverTasks) {
    const prev = byId.get(server.id);
    byId.set(server.id, prev ? preferRicherTask(prev, server) : server);
  }
  const knownIds = new Set(byId.keys());
  const knownPrompts = promptKeySet([...byId.values()]);
  const pending = optimisticTasks
    .filter((task) => (
      Boolean(task.id)
      && Boolean(task.prompt.trim())
      && !knownIds.has(task.id)
      && !knownPrompts.has(normalizeTaskPrompt(task.prompt))
    ))
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
  const merged = [...byId.values()];
  return pending.length ? [...merged, ...pending] : merged;
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
