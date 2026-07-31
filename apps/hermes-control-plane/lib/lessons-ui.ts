/** Pure helpers for ThumbGate lessons dashboard navigation and filters. */

export type LessonSignalFilter = "all" | "up" | "down";

export type LessonNavTarget = {
  taskId: string;
  threadId?: string | null;
  signal: "up" | "down";
};

export function hermesTaskHref(lesson: LessonNavTarget): string {
  const params = new URLSearchParams();
  params.set("task", lesson.taskId);
  if (lesson.threadId) params.set("thread", lesson.threadId);
  return `/dashboard?${params.toString()}#task-activity`;
}

export function parseSignalFromSearch(search: string): LessonSignalFilter {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const signal = new URLSearchParams(raw).get("signal");
  if (signal === "up" || signal === "down") return signal;
  return "all";
}

/** Build shareable lessons URL for a signal filter (and optional query). */
export function lessonsListHref(signal: LessonSignalFilter, query = ""): string {
  const params = new URLSearchParams();
  if (signal !== "all") params.set("signal", signal);
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  const qs = params.toString();
  return `/dashboard/lessons${qs ? `?${qs}` : ""}#lesson-list`;
}

/**
 * Click on All / Helpful / Improve:
 * - single matching rating → open that task in Hermes (real destination)
 * - otherwise → filter the lessons list on this page
 */
export function resolveSignalClickDestination(args: {
  target: LessonSignalFilter;
  counts: { up: number; down: number };
  lessons: LessonNavTarget[];
}): { kind: "filter"; signal: LessonSignalFilter; openSingleWhenLoaded: boolean } | { kind: "open-hermes"; href: string } {
  if (args.target === "all") {
    return { kind: "filter", signal: "all", openSingleWhenLoaded: false };
  }
  const count = args.target === "up" ? args.counts.up : args.counts.down;
  if (count === 1) {
    const match = args.lessons.find((lesson) => lesson.signal === args.target);
    if (match) {
      return { kind: "open-hermes", href: hermesTaskHref(match) };
    }
    // Count says one exists but not in the current list — filter, then open after load.
    return { kind: "filter", signal: args.target, openSingleWhenLoaded: true };
  }
  return { kind: "filter", signal: args.target, openSingleWhenLoaded: false };
}

/** After a filter load, open the sole lesson in Hermes when the click requested it. */
export function singleLessonHermesHref(
  signal: LessonSignalFilter,
  lessons: LessonNavTarget[],
  openSingleWhenLoaded: boolean,
): string | null {
  if (!openSingleWhenLoaded || signal === "all" || lessons.length !== 1) return null;
  return hermesTaskHref(lessons[0]);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split text for search highlighting (case-insensitive substring). */
export function splitHighlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  const trimmed = query.trim();
  if (!trimmed || !text) return [{ text, match: false }];
  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, "gi");
  return text.split(pattern).filter((part) => part.length > 0).map((part) => ({
    text: part,
    match: part.toLowerCase() === trimmed.toLowerCase(),
  }));
}
