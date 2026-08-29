import { readableChatOutput } from "./chat-output-safety";

/**
 * Copy/share payload for a Hermes output bubble. Shares the same sanitized
 * text the user sees on screen (never the raw tool protocol), so what lands
 * on the clipboard matches the rendered message.
 */
export function shareableMessageText(text: string | null | undefined, options: { hideToolProtocol?: boolean } = {}): string {
  if (!text) return "";
  const readable = options.hideToolProtocol ? readableChatOutput(text) : text;
  return readable.trim();
}

/**
 * Low-level fetch errors (undici/Node "fetch failed", ECONNREFUSED, …) are
 * developer wire-format, not customer copy. Translate them into a plain
 * explanation with a next step; keep anything already human-readable as-is.
 */
export function humanizeTaskError(error: string | null | undefined): string {
  const raw = (error ?? "").trim();
  if (!raw) return "Something went wrong while running this. Tap Retry to send it again.";
  const lowered = raw.toLowerCase();
  const networkSignatures = [
    "fetch failed",
    "econnrefused",
    "econnreset",
    "etimedout",
    "enotfound",
    "socket hang up",
    "network error",
    "networkerror",
    "und_err",
    "getaddrinfo",
    "connect timeout",
    "terminated",
  ];
  if (networkSignatures.some((signature) => lowered.includes(signature))) {
    return "Hermes couldn't reach the runner for this task (network hiccup between the app and the engine). Nothing is wrong with your prompt — tap Retry to send it again.";
  }
  if (/^https?:\/\/|^[a-z]+error:|^\w+exception/i.test(raw) || /\bat\s+\S+:\d+:\d+/.test(raw)) {
    return `The runner reported an internal error. Tap Retry to send it again. (Details: ${raw.slice(0, 200)})`;
  }
  return raw;
}

/** True when the failure is transient and a one-tap Retry is the right move. */
export function isRetryableTaskError(error: string | null | undefined): boolean {
  const raw = (error ?? "").trim().toLowerCase();
  if (!raw) return true;
  const permanentSignatures = ["plan is required", "capacity exhausted", "unauthorized", "forbidden", "quota"];
  return !permanentSignatures.some((signature) => raw.includes(signature));
}
