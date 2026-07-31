/**
 * Alphabetical ordering for the Settings ops catalog.
 *
 * Why (owner directive, 2026-07-31): the gateway returns skills, cron jobs and
 * toolsets in whatever order it enumerates them — partly grouped, never sorted.
 * On a list of 80 skills and 21 cron jobs that makes finding a known name a
 * linear scan. Sorting is the difference between a catalog and a pile.
 *
 * Sorting happens at the SOURCE, before filtering, so the search box still
 * preserves order while typing (see skillSearch) and the list never reshuffles
 * under the user's finger.
 */

/**
 * Case-insensitive, locale-aware, numeric-aware compare.
 *
 * `numeric` matters here because names like `agent-2` and `agent-10` otherwise
 * sort lexically as 10 < 2. `sensitivity: 'base'` keeps `Airtable` and
 * `airtable` adjacent rather than splitting on case, which is what a human
 * scanning the list expects.
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function compareByName(a: string | null | undefined, b: string | null | undefined): number {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  // Unnamed entries sort last rather than jumping to the top of the list.
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return collator.compare(left, right);
}

/**
 * Return a NEW array sorted by the given key. Never mutates the input — these
 * lists come straight from context state, and sorting in place would mutate
 * React state and produce stale-render bugs.
 */
export function sortByName<T>(
  items: readonly T[] | null | undefined,
  key: (item: T) => string | null | undefined,
): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return [...items].filter(Boolean).sort((a, b) => compareByName(key(a), key(b)));
}
