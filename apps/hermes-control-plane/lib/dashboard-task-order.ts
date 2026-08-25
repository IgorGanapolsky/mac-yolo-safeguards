export type TimestampedTask = {
  id: string;
  createdAt: number;
  prompt?: string;
  status?: string;
};

export type SnapshotMessage = {
  role?: string;
  content?: string;
  createdAt?: number | null;
};

export type ThreadTimelineItem<
  TMessage extends SnapshotMessage = SnapshotMessage,
  TTask extends TimestampedTask = TimestampedTask,
> =
  | { kind: "snapshot"; at: number; index: number; message: TMessage }
  | { kind: "task"; at: number; index: number; task: TTask };

/** Chat chronology: oldest first, so the newest prompt/result sits by the composer. */
export function orderTasksChronologically<T extends TimestampedTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

function validClock(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Hermes snapshots are usually oldest-first. Some device payloads arrive
 * newest-first. Put the latest message last so it sits next to the composer.
 */
export function orderSnapshotChronologically<T extends SnapshotMessage>(messages: readonly T[]): T[] {
  const copy = [...messages];
  const clocks = copy
    .map((message, index) => ({ index, at: validClock(message.createdAt) }))
    .filter((row) => row.at != null) as Array<{ index: number; at: number }>;
  if (clocks.length >= 2 && clocks[0].at > clocks[clocks.length - 1].at) {
    return copy.reverse();
  }
  if (clocks.length === copy.length && copy.length > 1) {
    return copy.sort((left, right) => (left.createdAt as number) - (right.createdAt as number));
  }
  return copy;
}

/** Newest chronological task — the one that should sit by the composer. */
export function latestChronologicalTask<T>(tasks: readonly T[]): T | null {
  return tasks.length ? tasks[tasks.length - 1] : null;
}

function snapshotClocks(messages: readonly SnapshotMessage[]): number[] {
  const raw = messages.map((message) => validClock(message.createdAt));
  const out: Array<number | null> = raw.slice();
  let last: number | null = null;
  for (let index = 0; index < out.length; index += 1) {
    if (out[index] != null) last = out[index];
    else if (last != null) out[index] = last;
  }
  last = null;
  for (let index = out.length - 1; index >= 0; index -= 1) {
    if (out[index] != null) last = out[index];
    else if (last != null) out[index] = last;
  }
  return out.map((value, index) => value ?? index);
}

/**
 * One chat stream: snapshot bubbles and web tasks interleaved by createdAt.
 * Stacking snapshot then tasks is the 2026-08-25 “latest is in the middle” bug.
 */
export function mergeThreadTimeline<
  TMessage extends SnapshotMessage,
  TTask extends TimestampedTask,
>(input: {
  snapshot: readonly TMessage[];
  tasks: readonly TTask[];
}): Array<ThreadTimelineItem<TMessage, TTask>> {
  const snapshot = orderSnapshotChronologically(input.snapshot);
  const snapshotUser = new Set(
    snapshot
      .filter((message) => (message.role ?? "").toLowerCase() === "user")
      .map((message) => (message.content ?? "").trim())
      .filter(Boolean),
  );
  const dated = snapshot.some((message) => validClock(message.createdAt) != null);
  const clocks = snapshotClocks(snapshot);
  const snapshotItems: Array<ThreadTimelineItem<TMessage, TTask>> = snapshot.map(
    (message, index) => ({
      kind: "snapshot",
      at: clocks[index],
      index,
      message,
    }),
  );
  const latestSnapshotAt = clocks.length ? Math.max(...clocks) : 0;
  const tasks = orderTasksChronologically(input.tasks).filter((task) => {
    const prompt = typeof task.prompt === "string" ? task.prompt.trim() : "";
    if (!prompt || !snapshotUser.has(prompt)) return true;
    // Keep in-flight work visible even when a synced bubble already shows the prompt.
    const status = (task.status ?? "").toLowerCase();
    if (status !== "completed" && status !== "failed") return true;
    // Distinct later turns that reuse the same text (e.g. "try again") must stay.
    return task.createdAt > latestSnapshotAt;
  });
  const taskItems: Array<ThreadTimelineItem<TMessage, TTask>> = tasks.map((task, index) => ({
    kind: "task",
    at: task.createdAt,
    index,
    task,
  }));
  if (!dated) {
    // Undated Hermes snapshots are already oldest-first. Append tasks last so
    // the newest pending/completed turn sits on the composer.
    return [...snapshotItems, ...taskItems];
  }
  return [...snapshotItems, ...taskItems].sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    if (left.kind === right.kind) return left.index - right.index;
    return left.kind === "snapshot" ? -1 : 1;
  });
}

/**
 * Thread console already paints tasks as chat bubbles. Dumping the same
 * cards oldest-first between that pane and the composer is the "messages
 * all over the place" desktop bug (2026-08-25).
 *
 * Keep the card dump when a Lessons deep-link focuses a specific task so
 * `#task-<id>` scrollIntoView still has a target.
 */
export function hideDuplicateTaskList(input: {
  selectedThread: string | null | undefined;
  taskFilter: string;
  focusedTaskId?: string | null;
}): boolean {
  if (input.focusedTaskId) return false;
  return Boolean(input.selectedThread) && input.taskFilter === "all";
}
