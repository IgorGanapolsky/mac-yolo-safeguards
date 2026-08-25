export type TimestampedTask = {
  id: string;
  createdAt: number;
};

export type SnapshotMessage = {
  role?: string;
  content?: string;
  createdAt?: number | null;
};

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

/**
 * Thread console already paints tasks as chat bubbles. Dumping the same
 * cards oldest-first between that pane and the composer is the "messages
 * all over the place" desktop bug (2026-08-25).
 */
export function hideDuplicateTaskList(input: {
  selectedThread: string | null | undefined;
  taskFilter: string;
}): boolean {
  return Boolean(input.selectedThread) && input.taskFilter === "all";
}
