import type { HermesMessage } from '../types/chat';
import { idHasPrefix } from './messageIds';
import { RUN_NO_TOKEN_FAIL_DETAIL, RUN_STREAM_IDLE_FAIL_DETAIL, RUN_STALE_TIMEOUT_DETAIL } from './runStaleDetection';
import { OUTBOUND_STUCK_FAILURE_REASON } from './outboundSendRecovery';

/** Delay before auto stop+resend when Mac HTTP is healthy but a send stalled. */
export const STALLED_SEND_AUTO_RECOVER_MS = 2_500;

/** Max automatic recoveries per session per app foreground — avoid retry storms. */
export const STALLED_SEND_AUTO_RECOVER_MAX = 2;

export const STALLED_SEND_RECOVERING_HINT = 'Recovering on your Mac…';

const STALL_REASON_MARKERS = [
  OUTBOUND_STUCK_FAILURE_REASON,
  RUN_NO_TOKEN_FAIL_DETAIL,
  RUN_STREAM_IDLE_FAIL_DETAIL,
  RUN_STALE_TIMEOUT_DETAIL,
  'chat stream stalled',
  'run stalled',
  'no live progress',
  'no reply from computer',
  'no reply yet',
  'still working',
] as const;

function normalizeBody(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function messageBody(message: HermesMessage): string {
  return normalizeBody(message.rawContent?.trim() || message.content?.trim() || '');
}

export function isStalledOutboundFailureReason(reason: string | undefined | null): boolean {
  if (!reason?.trim()) {
    return false;
  }
  const lower = reason.toLowerCase();
  return STALL_REASON_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

function indexOfLastUser(messages: readonly HermesMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      return index;
    }
  }
  return -1;
}

function hasAssistantAfter(messages: readonly HermesMessage[], afterIndex: number): boolean {
  for (let index = afterIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    const body = message.content?.trim() || message.rawContent?.trim() || '';
    if (body.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Local failed optimistic bubble that never landed on the Mac while a later
 * assistant reply already exists for a prior user turn — the permanent
 * "Connected — chat stalled" lie.
 */
export function isOrphanFailedOutboundBubble(
  message: HermesMessage,
  serverMessages: readonly HermesMessage[],
): boolean {
  if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
    return false;
  }
  if (!idHasPrefix(message.id, 'user-')) {
    return false;
  }
  const body = messageBody(message);
  if (!body) {
    return false;
  }
  const onServer = serverMessages.some(
    (server) => server.role?.toLowerCase() === 'user' && messageBody(server) === body,
  );
  if (onServer) {
    return false;
  }
  const lastServerUser = indexOfLastUser(serverMessages);
  if (lastServerUser < 0) {
    return false;
  }
  return hasAssistantAfter(serverMessages, lastServerUser);
}

/** Strip orphan failed phone-only bubbles once the Mac already answered. */
export function dropOrphanFailedOutboundBubbles(
  serverMessages: HermesMessage[],
  localMessages: HermesMessage[],
): HermesMessage[] {
  if (localMessages.length === 0) {
    return localMessages;
  }
  return localMessages.filter((message) => !isOrphanFailedOutboundBubble(message, serverMessages));
}

/**
 * Failed outbound that the Mac already acknowledged with an assistant reply —
 * clear the failed badge so the header cannot stick on "chat stalled".
 */
export function clearResolvedFailedOutboundStatuses(messages: HermesMessage[]): {
  messages: HermesMessage[];
  cleared: boolean;
} {
  let cleared = false;
  const next = messages.map((message, index) => {
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
      return message;
    }
    if (!hasAssistantAfter(messages, index)) {
      return message;
    }
    cleared = true;
    return {
      ...message,
      outboundStatus: 'sent' as const,
      outboundFailureReason: undefined,
    };
  });
  return { messages: cleared ? next : messages, cleared };
}

export function findLastStalledFailedOutboundText(messages: readonly HermesMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
      continue;
    }
    if (!isStalledOutboundFailureReason(message.outboundFailureReason)) {
      continue;
    }
    const text = message.content?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

/** When Mac HTTP is green and the last failure is a stall, auto-recover instead of babysitting. */
export function shouldAutoRecoverStalledSend(input: {
  macHttpOk: boolean;
  isDemo: boolean;
  isSending: boolean;
  recoveriesUsed: number;
  failedText: string | null | undefined;
  failureReason?: string | null;
  runDetail?: string | null;
}): boolean {
  if (input.isDemo || !input.macHttpOk || input.isSending) {
    return false;
  }
  if (input.recoveriesUsed >= STALLED_SEND_AUTO_RECOVER_MAX) {
    return false;
  }
  const text = input.failedText?.trim();
  if (!text) {
    return false;
  }
  return (
    isStalledOutboundFailureReason(input.failureReason) ||
    isStalledOutboundFailureReason(input.runDetail)
  );
}

export function findLastFailedOutboundFailureReason(
  messages: readonly HermesMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'failed') {
      continue;
    }
    const reason = message.outboundFailureReason?.trim();
    if (reason) {
      return reason;
    }
  }
  return null;
}
