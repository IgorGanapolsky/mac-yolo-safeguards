/**
 * Mac snapshot sync advances threads.synced_at. /api/thread-messages used to
 * keep only tasks with created_at > synced_at so Mac bubbles were not duplicated.
 * That also hid hosted web runs on the same thread after a later sync — the
 * Real Estate prompt stayed CLOUD PENDING in chat while D1 was already completed
 * (task 4b2e57f3-86c6-46b8-8916-b4f3e4366ce6, 2026-08-24).
 *
 * Keep the created_at > synced_at bound for local/Mac rows, but always include
 * hosted cloud runs and any row that already has a result.
 */
export const THREAD_MESSAGES_TASK_VISIBILITY_SQL =
  "(? IS NULL OR k.created_at > ? OR k.route = 'cloud' OR (k.result IS NOT NULL AND length(k.result) > 0))";

export function isThreadTaskVisibleAfterSync(input: {
  createdAt: number;
  syncedAt: number | null | undefined;
  route: string;
  result: string | null | undefined;
}): boolean {
  if (input.syncedAt == null) return true;
  if (input.createdAt > input.syncedAt) return true;
  if (input.route === "cloud") return true;
  return Boolean(input.result && String(input.result).length > 0);
}
