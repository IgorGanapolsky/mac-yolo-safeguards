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
