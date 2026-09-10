/** Local dismiss / minimize prefs for dashboard chat and prompt cards. */

export const CARD_PREFS_KEY = "thumbgate.dashboard.card-prefs.v1";

export type DashboardCardPrefs = {
  dismissedTaskIds: string[];
  collapsedTaskIds: string[];
  archivedThreadIds: string[];
  conversationMinimized: boolean;
};

export function emptyCardPrefs(): DashboardCardPrefs {
  return {
    dismissedTaskIds: [],
    collapsedTaskIds: [],
    archivedThreadIds: [],
    conversationMinimized: false,
  };
}

export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function parseCardPrefs(raw: unknown): DashboardCardPrefs {
  const base = emptyCardPrefs();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Record<string, unknown>;
  const list = (key: keyof DashboardCardPrefs) =>
    Array.isArray(value[key]) ? value[key].filter((item): item is string => typeof item === "string") : base[key];
  return {
    dismissedTaskIds: list("dismissedTaskIds") as string[],
    collapsedTaskIds: list("collapsedTaskIds") as string[],
    archivedThreadIds: list("archivedThreadIds") as string[],
    conversationMinimized: value.conversationMinimized === true,
  };
}

export function loadCardPrefs(storage: Pick<Storage, "getItem"> | null = globalThis.localStorage): DashboardCardPrefs {
  if (!storage) return emptyCardPrefs();
  try {
    return parseCardPrefs(JSON.parse(storage.getItem(CARD_PREFS_KEY) || "null"));
  } catch {
    return emptyCardPrefs();
  }
}

export function saveCardPrefs(
  prefs: DashboardCardPrefs,
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage,
): void {
  storage?.setItem(CARD_PREFS_KEY, JSON.stringify(prefs));
}
