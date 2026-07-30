import type { HermesMessage } from '../types/chat';
import type {
  ComposerAttachment,
  OutboundRetryEnvelope,
} from '../types/chatAttachment';
import { EMPTY_REPLY_FAILURE_REASON } from './emptyStreamReplyRecovery';
import { OUTBOUND_STUCK_FAILURE_REASON } from './outboundSendRecovery';
import { isConnectivityMessage } from './chatErrors';
import { normalizeMessageText } from './chatMessageMerge';
import { isWrongKeyFailure } from './wrongKeyRecovery';

export type ComposerSendAction =
  | { kind: 'none' }
  | { kind: 'send'; text: string }
  | { kind: 'retry_resend'; text: string }
  | { kind: 'retry_reconnect'; text: string };

export type FailedOutboundRetry = {
  messageId: string | null;
  text: string;
  displayText: string;
  attachments: ComposerAttachment[];
  source: 'envelope' | 'legacy_text' | 'legacy_attachment_missing';
  /** Never silently degrade an old attachment send into a text-only retry. */
  requiresReattach: boolean;
};

function cloneAttachment(attachment: ComposerAttachment): ComposerAttachment {
  return { ...attachment };
}

function retryFromEnvelope(
  message: HermesMessage,
  envelope: OutboundRetryEnvelope,
): FailedOutboundRetry | null {
  if (envelope.version !== 1 || !Array.isArray(envelope.attachments)) {
    return null;
  }
  const text = envelope.text?.trim() ?? '';
  const displayText = envelope.displayText?.trim() ?? '';
  const attachments = envelope.attachments.map(cloneAttachment);
  if (!displayText && !text && attachments.length === 0) {
    return null;
  }
  return {
    messageId: message.id?.trim() || null,
    text,
    displayText: displayText || text,
    attachments,
    source: 'envelope',
    requiresReattach: false,
  };
}

function legacyRetryFromMessage(message: HermesMessage): FailedOutboundRetry | null {
  const displayText = message.content?.trim() ?? '';
  if (!displayText) {
    return null;
  }
  const attachmentMarker = /(?:^|\n)\s*📎\s+/m;
  const markerMatch = attachmentMarker.exec(displayText);
  if (!markerMatch) {
    return {
      messageId: message.id?.trim() || null,
      text: displayText,
      displayText,
      attachments: [],
      source: 'legacy_text',
      requiresReattach: false,
    };
  }
  const text = displayText.slice(0, markerMatch.index).trim();
  return {
    messageId: message.id?.trim() || null,
    text,
    displayText,
    attachments: [],
    source: 'legacy_attachment_missing',
    requiresReattach: true,
  };
}

/**
 * Last failed user turn, including its original attachment metadata.
 *
 * Returned objects are cloned so retry code cannot mutate the transcript's
 * persisted envelope. Legacy attachment bubbles are marked unavailable instead
 * of being resent as misleading text containing only a paperclip filename.
 */
export function findLastFailedOutboundRetry(
  messages: readonly HermesMessage[],
): FailedOutboundRetry | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
      continue;
    }
    const fromEnvelope = message.outboundRetryEnvelope
      ? retryFromEnvelope(message, message.outboundRetryEnvelope)
      : null;
    return fromEnvelope ?? legacyRetryFromMessage(message);
  }
  return null;
}

/** Last user bubble marked failed — used by legacy text-only status surfaces. */
export function findLastFailedOutboundText(messages: readonly HermesMessage[]): string | null {
  const retry = findLastFailedOutboundRetry(messages);
  return retry?.text || retry?.displayText || null;
}

/**
 * Decide what the ↑ button is actually sending.
 *
 * ChatInputBar keeps its own `latestTextRef` so a blocked/duplicate send never
 * loses the draft, and that ref is NOT cleared when the controlled value goes
 * empty. It can therefore hold residue the user can no longer see — text that
 * was partly typed and abandoned, or a body already delivered.
 *
 * `composerValue` here is `inputValueRef`, which `handleComposerTextChange`
 * updates synchronously on every keystroke, so it does not lag the native field
 * the way the controlled `value` prop can. It is the honest answer to "what is
 * in the composer right now".
 *
 * RULE: an empty composer is EMPTY. Never let the input bar's ref stand in for
 * typed text, or ↑ sends leftover characters instead of retrying the failed
 * turn (caught on-device by the ship-guard emulator run for #1241, which sent a
 * stray "ma" instead of retrying). The ref is only preferred when the composer
 * genuinely has content, where it is the fresher of the two.
 */
export function resolveComposerSendText(input: {
  latestText?: string | null;
  composerValue: string;
  lastSentComposerText?: string | null;
}): string {
  const composer = input.composerValue?.trim() ?? '';
  if (!composer) {
    return '';
  }
  const latest = input.latestText?.trim() ?? '';
  if (!latest) {
    return composer;
  }
  const lastSent = normalizeMessageText(input.lastSentComposerText ?? '');
  if (lastSent && normalizeMessageText(latest) === lastSent) {
    // Ref still echoes the body already on its way; the composer is the truth.
    return composer;
  }
  return latest;
}

export function resolveComposerSendAction(input: {
  composerText: string;
  lastFailedText?: string | null;
  hasFailedPayload?: boolean;
  isDemo: boolean;
  macChatLive: boolean;
}): ComposerSendAction {
  const composer = input.composerText.trim();
  if (composer) {
    return { kind: 'send', text: composer };
  }

  const failed = input.lastFailedText?.trim();
  if (!failed && !input.hasFailedPayload) {
    return { kind: 'none' };
  }

  if (!input.isDemo && !input.macChatLive) {
    return { kind: 'retry_reconnect', text: failed ?? '' };
  }
  return { kind: 'retry_resend', text: failed ?? '' };
}

export type FailedSendRetryTelemetryOutcome =
  | 'attempt'
  | 'accepted'
  | 'resumed_accepted'
  | 'rejected'
  | 'prepare_failed'
  | 'reattach_required';

/**
 * Privacy-safe retry telemetry. Do not add text, filenames, MIME types, URIs,
 * gateway addresses, or session ids to this contract.
 */
export function failedSendRetryTelemetryProperties(
  retry: FailedOutboundRetry,
  outcome: FailedSendRetryTelemetryOutcome,
): Record<string, string | number | boolean> {
  return {
    outcome,
    attachment_count: retry.attachments.length,
    payload_source: retry.source,
    requires_reattach: retry.requiresReattach,
  };
}

/** True when the red composer banner / run detail is an empty-reply failure (not connectivity). */
export function isEmptyReplyFailureMessage(message: string | null | undefined): boolean {
  const text = message?.trim() ?? '';
  if (!text) {
    return false;
  }
  if (text === EMPTY_REPLY_FAILURE_REASON) {
    return true;
  }
  const lower = text.toLowerCase();
  return (
    lower.includes('no reply text') ||
    lower.includes('did not return text') ||
    lower.includes('still no reply')
  );
}

/** Run-progress banner Retry chip — connectivity, empty reply, or stuck outbound. */
export function shouldShowFailedSendRetry(input: {
  runPhase?: string;
  runDetail?: string | null;
  lastFailedText?: string | null;
  hasFailedPayload?: boolean;
}): boolean {
  if (input.runPhase !== 'failed') {
    return false;
  }
  if (input.lastFailedText?.trim() || input.hasFailedPayload) {
    return true;
  }
  const detail = input.runDetail?.trim() ?? '';
  if (!detail) {
    return false;
  }
  return (
    isConnectivityMessage(detail) ||
    isWrongKeyFailure(detail) ||
    detail === EMPTY_REPLY_FAILURE_REASON ||
    detail === OUTBOUND_STUCK_FAILURE_REASON ||
    detail.toLowerCase().includes('no reply') ||
    detail.toLowerCase().includes('pair again')
  );
}

/** Keep reconnect tile visible after a failed send even during silent heal. */
export function shouldHideMacTileForSilentHeal(input: {
  silentHealInFlight: boolean;
  macRetryBusy: boolean;
  userSendFailed: boolean;
  hasRetryableFailedSend: boolean;
}): boolean {
  if (input.macRetryBusy) {
    return false;
  }
  if (input.userSendFailed || input.hasRetryableFailedSend) {
    return false;
  }
  return input.silentHealInFlight;
}
