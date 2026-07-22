import type { HermesMessage } from '../types/chat';
import { hasUnsyncedLocalMessages } from './chatMessageMerge';

/**
 * Reconnect / heal often re-lists sessions while the gateway is still warming.
 * An empty list (or a transient miss of the active id) must NOT clear the
 * current thread — that wiped the transcript and discarded in-flight sends.
 *
 * Clear only when the server returned other threads and the active id is gone
 * (real delete / Clear all), or when skipAutoSelect already requested a clear.
 */
export function shouldClearMissingCurrentSession(input: {
  sessionsLength: number;
  currentSessionId?: string | null;
  skipAutoSelect?: boolean;
}): boolean {
  const currentId = input.currentSessionId?.trim();
  if (!currentId) {
    return false;
  }
  if (input.skipAutoSelect) {
    return true;
  }
  // Empty / incomplete list during reconnect — keep the sticky session.
  return input.sessionsLength > 0;
}

/**
 * Session-id effect historically did setMessages([]) then refresh. During a
 * false disconnect refresh is a no-op, so clearing discarded the transcript.
 * Keep local bubbles whenever we still have unsynced / failed outbound work.
 *
 * Intentional Choose-computer / profile switches must NEVER preserve — otherwise
 * machine A's optimistic bubble paints under machine B's identity mid-switch.
 */
export function shouldPreserveTranscriptOnSessionChange(input: {
  messages: readonly HermesMessage[];
  pendingOutboundSends: number;
  isSending: boolean;
  hasActiveRun: boolean;
  intentionalProfileSwitch?: boolean;
}): boolean {
  if (input.intentionalProfileSwitch) {
    return false;
  }
  if (input.pendingOutboundSends > 0 || input.isSending || input.hasActiveRun) {
    return true;
  }
  return hasUnsyncedLocalMessages([...input.messages]);
}

/**
 * handleSend clears the composer + AsyncStorage draft before the network call.
 * On rejected send we must restore both memory and storage — otherwise a
 * remount / session effect reloads an empty draft and the typed text vanishes.
 */
export function composerTextAfterRejectedSend(input: {
  rejectedText: string;
  attachmentsCount?: number;
}): { text: string; shouldPersistDraft: boolean } {
  const text = input.rejectedText;
  return {
    text,
    shouldPersistDraft: Boolean(text.trim()) || (input.attachmentsCount ?? 0) > 0,
  };
}

/**
 * Full-screen connection help replaces the transcript + composer. While the user
 * still has a failed/in-flight local outbound bubble, keep the chat surface so
 * they can retry instead of appearing to "lose" the message.
 */
export function shouldSuppressConnectionHelpForLocalOutbound(input: {
  hasRetryableFailedSend: boolean;
  pendingOutboundSends: number;
  messages: readonly HermesMessage[];
}): boolean {
  if (input.hasRetryableFailedSend || input.pendingOutboundSends > 0) {
    return true;
  }
  return hasUnsyncedLocalMessages([...input.messages]);
}
