/**
 * Start fresh chat must carry typed composer text into the empty session.
 * Pure helpers keep the transfer race (draft-load wipe) testable without mounting ChatScreen.
 */

export type FreshChatComposerTransfer = {
  text: string;
};

/** Snapshot whatever is currently in the composer before Start fresh clears session state. */
export function captureComposerTextForFreshChat(text: string | null | undefined): string {
  return typeof text === 'string' ? text : '';
}

/** True when Start fresh should restore text after opening the empty chat. */
export function shouldRestoreComposerAfterFreshChat(preservedText: string): boolean {
  return preservedText.length > 0;
}

/**
 * Prefer the in-flight typed draft over an empty stored draft for the new session.
 * Empty preserved text falls through to whatever was loaded for the destination session.
 */
export function resolveComposerTextAfterFreshChat(options: {
  preservedText: string;
  loadedDraftForNewSession?: string;
}): string {
  if (shouldRestoreComposerAfterFreshChat(options.preservedText)) {
    return options.preservedText;
  }
  return options.loadedDraftForNewSession ?? '';
}

/**
 * While a Start-fresh transfer is pending, skip AsyncStorage draft load so it cannot
 * overwrite the carried text with an empty new-session draft.
 */
export function shouldSkipStoredDraftLoad(pendingTransferText: string | null): boolean {
  return pendingTransferText !== null;
}

export type DraftLoadResolveInput = {
  /** Composer text currently on screen (may include typing that raced the async load). */
  inMemoryText: string;
  /** Draft loaded from AsyncStorage for the destination session. */
  loadedDraft: string;
  /**
   * True when currentSession.id changed (thread switch / compose→session).
   * False when the same session re-fired the load effect (seed/demo flicker).
   */
  isSessionChange: boolean;
  /** True only when a compose-first draft receives its first real session id. */
  isComposeFirstSessionAttach?: boolean;
  /** Snapshot of in-memory text when the async load started. */
  textAtFetchStart: string;
};

/**
 * Never silently discard typed composer text.
 * - Same-session reload: keep live typing over an empty/stale storage read.
 * - Session change: apply the destination draft (including empty) so thread switch clears.
 * - Edits during the fetch always win over storage.
 */
export function resolveComposerTextAfterDraftLoad(input: DraftLoadResolveInput): string {
  const live = typeof input.inMemoryText === 'string' ? input.inMemoryText : '';
  const draft = typeof input.loadedDraft === 'string' ? input.loadedDraft : '';
  const started = typeof input.textAtFetchStart === 'string' ? input.textAtFetchStart : '';

  if (live.trim() && live !== started) {
    return live;
  }
  if (input.isComposeFirstSessionAttach && live.trim() && !draft.trim()) {
    return live;
  }
  if (!input.isSessionChange && live.trim() && !draft.trim()) {
    return live;
  }
  return draft;
}

/**
 * Storage key for compose-first (no Mac session yet). Typing must persist here so
 * auto-select / reconnect cannot wipe a draft that was never keyed to a session id.
 */
export const COMPOSER_DRAFT_COMPOSE_FIRST_KEY = '__compose_first__';

/** Session id used for draft save/load — compose-first uses a stable sentinel. */
export function composerDraftSessionKey(sessionId: string | null | undefined): string | null {
  const trimmed = sessionId?.trim();
  if (trimmed) {
    return trimmed;
  }
  return COMPOSER_DRAFT_COMPOSE_FIRST_KEY;
}
