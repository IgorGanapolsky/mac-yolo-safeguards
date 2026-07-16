/** Max chars for Android/iOS notification body glanceability. */
export const NOTIFICATION_REPLY_SNIPPET_MAX = 120;

const BOILERPLATE_REPLY_BODIES = new Set([
  'reply ready on your computer',
  'reply ready',
  'task finished',
  'task completed',
  'background task completed.',
  'background task completed',
  'hermes finished',
  'done',
]);

/** True when text is status chrome, not an assistant reply preview. */
export function isBoilerplateNotificationBody(text: string | undefined | null): boolean {
  const normalized = text?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return true;
  }
  if (BOILERPLATE_REPLY_BODIES.has(normalized)) {
    return true;
  }
  return /^reply ready\b/i.test(normalized) && normalized.length < 48;
}

/**
 * Strip common markdown so lock-screen snippets stay readable.
 * Intentionally lightweight — notification shade, not a full MD renderer.
 */
export function stripMarkdownForNotification(text: string): string {
  let out = text.replace(/\r\n/g, '\n');

  // Fenced code blocks → inner text
  out = out.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim());
  // Inline code
  out = out.replace(/`([^`]+)`/g, '$1');
  // Images ![alt](url) → alt
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  // Links [label](url) → label
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Headings / list markers
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  out = out.replace(/^\s*[-*+]\s+/gm, '');
  out = out.replace(/^\s*\d+\.\s+/gm, '');
  // Bold / italic / strike
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
  out = out.replace(/(\*|_)(.*?)\1/g, '$2');
  out = out.replace(/~~(.*?)~~/g, '$1');
  // Collapse whitespace
  out = out.replace(/\s+/g, ' ').trim();

  return out;
}

/**
 * First ~120 plain-text characters of assistant reply for notifications.
 * Returns empty string when input is missing or boilerplate status copy.
 */
export function formatNotificationReplySnippet(
  text: string | undefined | null,
  maxChars = NOTIFICATION_REPLY_SNIPPET_MAX,
): string {
  if (text == null) {
    return '';
  }
  const plain = stripMarkdownForNotification(String(text));
  if (!plain || isBoilerplateNotificationBody(plain)) {
    return '';
  }
  const limit = Math.max(24, Math.floor(maxChars));
  if (plain.length <= limit) {
    return plain;
  }
  const sliced = plain.slice(0, limit - 1).trimEnd();
  // Prefer breaking on a word boundary when close to the end.
  const lastSpace = sliced.lastIndexOf(' ');
  const body = lastSpace > limit * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${body.trimEnd()}…`;
}
