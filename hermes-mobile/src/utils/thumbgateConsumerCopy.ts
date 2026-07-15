import { ThumbgateApiError } from '../services/thumbgateClient';

/** Shown briefly after a successful chat-output thumbs capture. */
export const CLOUD_MEMORY_SAVED_NOTE = 'Saved to cloud memory';

export type CloudMemorySkipReason = 'leash_locked' | 'capture_disabled';

export function formatCloudMemorySkipNote(reason: CloudMemorySkipReason): string {
  if (reason === 'leash_locked') {
    return 'Not saved — Leash Pro unlocks cloud memory';
  }
  return 'Not saved — memory capture is off in Leash options';
}

export function formatCloudMemoryCaptureFailure(
  error: unknown,
  options: { hasApiKey: boolean },
): string {
  if (!options.hasApiKey) {
    return 'Not saved — pair your Mac to enable memory sync';
  }
  if (error instanceof ThumbgateApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Not saved — memory sync key invalid. Pair your Mac again.';
    }
    const detail = error.message?.trim();
    if (detail) {
      return `Not saved — ${detail}`;
    }
    return `Not saved — cloud memory error (${error.status})`;
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && /network|fetch|abort|timed out/i.test(error.message))
  ) {
    return "Not saved — can't reach cloud memory. Check your connection.";
  }
  if (error instanceof Error && error.message.trim()) {
    return `Not saved — ${error.message.trim()}`;
  }
  return 'Not saved — cloud memory sync failed';
}

export type CloudMemoryCaptureResult = {
  ok: boolean;
  note: string;
};
