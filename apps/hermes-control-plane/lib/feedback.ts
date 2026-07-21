export type FeedbackSignal = "up" | "down";

export function cleanFeedbackSignal(value: unknown): FeedbackSignal | null {
  return value === "up" || value === "down" ? value : null;
}

export function cleanFeedbackNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.replaceAll("\u0000", "").replace(/\s+/g, " ").trim().slice(0, 1_000);
  return note || null;
}

export function cleanTaskIds(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter((item) => /^[a-zA-Z0-9_-]{1,160}$/.test(item)))].slice(0, 100);
}
