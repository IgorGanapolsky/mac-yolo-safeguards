/**
 * One chronological timeline for a thread.
 *
 * The dashboard renders a thread from two independent sources: `snapshot`
 * (messages synced from a paired machine) and `tasks` (work submitted from the
 * web). They were previously emitted as two consecutive blocks — every snapshot
 * message, then every task — so a task card could appear below a message that
 * happened two days later. A 2026-08-21 fix sorted tasks among themselves,
 * which was correct but did not merge the two sequences, so the inversion
 * survived across the seam.
 *
 * This merges both into a single ascending timeline: oldest first, newest last,
 * next to the composer.
 *
 * Snapshot messages may carry no timestamp. Those cannot be interleaved
 * honestly, so they keep their original relative order and stay ahead of
 * everything that IS timestamped, rather than being given an invented time.
 */

export interface TimelineSnapshotMessage {
  role: string;
  content: string;
  createdAt?: number | null;
}

export interface TimelineTask {
  id?: string;
  prompt: string;
  createdAt: number;
}

export type TimelineEntry<S extends TimelineSnapshotMessage, T extends TimelineTask> =
  | { kind: "snapshot"; at: number | null; index: number; message: S }
  | { kind: "task"; at: number; index: number; task: T };

/**
 * Merge snapshot messages and tasks into one ascending timeline.
 *
 * Stable: entries sharing a timestamp keep source order, and snapshot wins ties
 * against a task so a synced prompt still reads before the work it produced.
 */
export function buildThreadTimeline<
  S extends TimelineSnapshotMessage,
  T extends TimelineTask,
>(snapshot: readonly S[] = [], tasks: readonly T[] = []): TimelineEntry<S, T>[] {
  const undated: TimelineEntry<S, T>[] = [];
  const dated: TimelineEntry<S, T>[] = [];

  snapshot.forEach((message, index) => {
    const at = typeof message.createdAt === "number" && Number.isFinite(message.createdAt)
      ? message.createdAt
      : null;
    const entry: TimelineEntry<S, T> = { kind: "snapshot", at, index, message };
    (at === null ? undated : dated).push(entry);
  });

  tasks.forEach((task, index) => {
    if (!Number.isFinite(task.createdAt)) return;
    dated.push({ kind: "task", at: task.createdAt, index, task });
  });

  // Non-mutating: callers pass arrays they still render from elsewhere.
  const ordered = [...dated].sort((left, right) => {
    const byTime = (left.at as number) - (right.at as number);
    if (byTime !== 0) return byTime;
    if (left.kind !== right.kind) return left.kind === "snapshot" ? -1 : 1;
    return left.index - right.index;
  });

  return [...undated, ...ordered];
}
