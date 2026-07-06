export type TranscriptReloadOnResumeInput = {
  appState: string;
  macChatLive: boolean;
  messageCount: number;
  hasActiveSession: boolean;
  /** Time spent backgrounded before returning active; omit when unknown. */
  backgroundDurationMs?: number;
  staleAfterMs?: number;
};

export type TranscriptReloadOptions = {
  background: boolean;
  force: boolean;
};

const DEFAULT_STALE_AFTER_MS = 30_000;

/** Whether AppState resume should trigger a transcript HTTP reload. */
export function shouldReloadTranscriptOnAppResume(
  input: Pick<TranscriptReloadOnResumeInput, 'appState' | 'hasActiveSession'>,
): boolean {
  return input.appState === 'active' && input.hasActiveSession;
}

/**
 * Resolve refreshSessionMessages options after foreground resume.
 * Empty transcripts must force-fetch (macChatLive can lag health on resume).
 */
export function resolveTranscriptReloadOnResume(
  input: TranscriptReloadOnResumeInput,
): TranscriptReloadOptions | null {
  if (!shouldReloadTranscriptOnAppResume(input)) {
    return null;
  }

  const isEmpty = input.messageCount === 0;
  const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const isStale =
    typeof input.backgroundDurationMs === 'number' && input.backgroundDurationMs >= staleAfter;

  if (isEmpty || !input.macChatLive) {
    return { background: false, force: true };
  }
  if (isStale) {
    return { background: true, force: true };
  }
  return { background: true, force: false };
}
