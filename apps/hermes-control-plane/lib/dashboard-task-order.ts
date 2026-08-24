export type TimestampedTask = {
  id: string;
  createdAt: number;
};

/** Chat chronology: oldest first, so the newest prompt/result sits by the composer. */
export function orderTasksChronologically<T extends TimestampedTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}
