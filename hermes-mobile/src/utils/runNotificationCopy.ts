/**
 * User-facing run notification copy.
 *
 * Notifications used to reuse formatRunProgressLabel, which always led with
 * elapsed time ("3 min — Reply ready…"). Elapsed is useless on a lock-screen
 * card; the reply (or concrete status) should be the body.
 */

const ELAPSED_LEAD_RE =
  /^(?:⌛\s*)?(?:Working|Live streaming|Sending)?\s*[—-]?\s*(?:\d+\s*(?:min|m|s|sec|secs|seconds)\s*[—-]\s*)+/i;

const REPLY_READY_RE = /reply ready/i;
const STATUS_ONLY_RE =
  /^(reply ready on your computer|task finished|background task completed\.?|hermes is working.*|working on your computer.*)$/i;

/** Collapse whitespace and strip outer quotes for a lock-screen snippet. */
export function normalizeReplySnippet(raw: string | null | undefined): string {
  if (!raw) {
    return '';
  }
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

function clampSnippet(text: string, max = 180): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Strip elapsed-time prefixes and Working/Streaming shells from a status line.
 * Does not invent content — returns empty when nothing useful remains.
 */
export function stripElapsedFromStatus(detail: string | null | undefined): string {
  if (!detail) {
    return '';
  }
  let text = detail.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(ELAPSED_LEAD_RE, '').trim();
    if (next === text) {
      break;
    }
    text = next;
  }
  if (/^\d+\s*(min|m|s|sec|secs|seconds)$/i.test(text)) {
    return '';
  }
  return text;
}

export function isReplyReadyDetail(detail: string | null | undefined): boolean {
  return REPLY_READY_RE.test(detail ?? '');
}

function isStatusOnlyPhrase(text: string): boolean {
  return STATUS_ONLY_RE.test(text.trim());
}

/** Title for sticky live-status / completed run notifications (August 2026 Uber-style). */
export function uberStyleRunNotificationFormatter(input: {
  phase?: string | null;
  detail?: string | null;
  replySnippet?: string | null;
  macName?: string | null;
}): { title: string; subtitle: string; body: string } {
  const snippet = normalizeReplySnippet(input.replySnippet);
  const phase = (input.phase ?? '').toLowerCase();
  const mac = input.macName ? input.macName.replace(/\.local$/i, '') : 'Your Mac';

  let title = '⚡ Working · Hermes';
  let defaultBody = 'Processing task on your Mac…';

  if (phase === 'approval' || input.detail?.toLowerCase().includes('approval')) {
    title = '🛡️ Approval Required';
    defaultBody = 'A tool call requires your sign-off before proceeding.';
  } else if (phase === 'completed' || isReplyReadyDetail(input.detail)) {
    title = snippet ? '💬 Hermes Replied' : '✅ Task Completed';
    defaultBody = 'Reply ready — tap to open chat.';
  } else if (phase === 'failed') {
    title = '⚠️ Run Stopped';
    defaultBody = 'The run encountered an error. Tap to inspect.';
  } else if (phase === 'streaming' || snippet) {
    title = '⚡ Responding · Hermes';
    defaultBody = 'Writing response…';
  } else if (phase === 'dispatching' || phase === 'starting') {
    title = '🏎️ Dispatching · Hermes';
    defaultBody = 'Initializing agent pipeline…';
  }

  let body = snippet ? clampSnippet(snippet) : defaultBody;
  if (!snippet) {
    const cleaned = stripElapsedFromStatus(input.detail);
    if (cleaned && !isStatusOnlyPhrase(cleaned)) {
      body = clampSnippet(cleaned);
    }
  }

  return { title, subtitle: mac, body };
}

export function runProgressNotificationTitleFromState(input: {
  phase?: string | null;
  detail?: string | null;
  replySnippet?: string | null;
}): string {
  return uberStyleRunNotificationFormatter(input).title;
}

/**
 * Body for sticky live-status notifications.
 * Prefer reply snippet; never lead with elapsed time.
 */
export function runProgressNotificationBody(input: {
  phase?: string | null;
  detail?: string | null;
  replySnippet?: string | null;
}): string {
  const snippet = normalizeReplySnippet(input.replySnippet);
  if (snippet) {
    return clampSnippet(snippet);
  }

  const cleaned = stripElapsedFromStatus(input.detail);
  if (cleaned && !isStatusOnlyPhrase(cleaned)) {
    return clampSnippet(cleaned);
  }
  if (cleaned && isReplyReadyDetail(cleaned)) {
    return 'Reply ready — open chat to read it.';
  }

  const phase = (input.phase ?? '').toLowerCase();
  if (phase === 'streaming') {
    return 'Writing a reply on your computer…';
  }
  if (phase === 'completed') {
    return 'Reply ready — open chat to read it.';
  }
  if (phase === 'failed') {
    return 'The run ended with an error. Open chat for details.';
  }
  if (phase === 'approval') {
    return 'Your computer is waiting for an approval.';
  }
  return 'Working on your computer…';
}

/** Body for one-shot completion notifications (results channel). */
export function runCompletedNotificationBody(
  detail: string | null | undefined,
  options?: { success?: boolean; replySnippet?: string | null },
): string {
  const explicit = normalizeReplySnippet(options?.replySnippet);
  if (explicit) {
    return clampSnippet(explicit);
  }

  const cleaned = stripElapsedFromStatus(detail);
  if (cleaned && !isStatusOnlyPhrase(cleaned) && !isReplyReadyDetail(cleaned)) {
    return clampSnippet(cleaned);
  }

  if (options?.success === false) {
    return cleaned || 'The run ended with an error.';
  }
  return 'Reply ready — open chat to read it.';
}
