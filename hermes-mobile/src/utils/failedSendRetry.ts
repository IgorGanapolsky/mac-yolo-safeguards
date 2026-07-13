import type { HermesMessage } from '../types/chat';
import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import { EMPTY_REPLY_FAILURE_REASON } from './emptyStreamReplyRecovery';
import { OUTBOUND_STUCK_FAILURE_REASON } from './outboundSendRecovery';
import { isConnectivityMessage } from './chatErrors';

export type ComposerSendAction =
  | { kind: 'none' }
  | { kind: 'send'; text: string }
  | { kind: 'retry_resend'; text: string }
  | { kind: 'retry_reconnect'; text: string };

/** Last user bubble marked failed — used when composer is empty and user taps ↑. */
export function findLastFailedOutboundText(messages: readonly HermesMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
      continue;
    }
    const text = message.content?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

/** Most recent user turn text — fallback when fail refs were cleared mid-retry. */
export function findLastUserMessageText(messages: readonly HermesMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user') {
      continue;
    }
    const text = message.content?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

export function resolveComposerSendAction(input: {
  composerText: string;
  lastFailedText?: string | null;
  isDemo: boolean;
  macChatLive: boolean;
}): ComposerSendAction {
  const composer = input.composerText.trim();
  if (composer) {
    return { kind: 'send', text: composer };
  }

  const failed = input.lastFailedText?.trim();
  if (!failed) {
    return { kind: 'none' };
  }

  if (!input.isDemo && !input.macChatLive) {
    return { kind: 'retry_reconnect', text: failed };
  }
  return { kind: 'retry_resend', text: failed };
}

/** Run-progress banner Retry chip — connectivity, empty reply, or stuck outbound. */
export function shouldShowFailedSendRetry(input: {
  runPhase?: string;
  runDetail?: string | null;
  lastFailedText?: string | null;
}): boolean {
  if (input.runPhase !== 'failed') {
    return false;
  }
  if (input.lastFailedText?.trim()) {
    return true;
  }
  const detail = input.runDetail?.trim() ?? '';
  if (!detail) {
    return false;
  }
  return (
    isConnectivityMessage(detail) ||
    detail === GATEWAY_WRONG_KEY_MESSAGE ||
    detail.includes(GATEWAY_WRONG_KEY_MESSAGE) ||
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
