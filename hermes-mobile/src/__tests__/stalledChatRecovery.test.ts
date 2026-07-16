import type { HermesMessage } from '../types/chat';
import { mergeServerMessagesWithPending } from '../utils/chatMessageMerge';
import { OUTBOUND_STUCK_FAILURE_REASON } from '../utils/outboundSendRecovery';
import { RUN_NO_TOKEN_FAIL_DETAIL } from '../utils/runStaleDetection';
import {
  STALLED_SEND_AUTO_RECOVER_MAX,
  clearResolvedFailedOutboundStatuses,
  findLastStalledFailedOutboundText,
  isOrphanFailedOutboundBubble,
  shouldAutoRecoverStalledSend,
} from '../utils/stalledChatRecovery';

describe('stalledChatRecovery', () => {
  it('detects orphan failed phone bubble when Mac already replied', () => {
    const server: HermesMessage[] = [
      { id: 'gw-u1', role: 'user', content: 'I beg you make money today' },
      { id: 'gw-a1', role: 'assistant', content: 'Here is the RN job breakdown…' },
    ];
    const orphan: HermesMessage = {
      id: 'user-local-1',
      role: 'user',
      content: 'Set everything up',
      outboundStatus: 'failed',
      outboundFailureReason: RUN_NO_TOKEN_FAIL_DETAIL,
    };
    expect(isOrphanFailedOutboundBubble(orphan, server)).toBe(true);
  });

  it('merge drops orphan stalled bubble so header cannot stick', () => {
    const server: HermesMessage[] = [
      { id: 'gw-u1', role: 'user', content: 'I beg you make money today' },
      { id: 'gw-a1', role: 'assistant', content: 'Here is the RN job breakdown…' },
    ];
    const local: HermesMessage[] = [
      ...server,
      {
        id: 'user-local-1',
        role: 'user',
        content: 'Set everything up',
        outboundStatus: 'failed',
        outboundFailureReason: 'Chat stream stalled — no updates from your computer.',
      },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.map((m) => m.content)).toEqual([
      'I beg you make money today',
      'Here is the RN job breakdown…',
    ]);
    expect(findLastStalledFailedOutboundText(merged)).toBeNull();
  });

  it('clears failed badge once an assistant reply follows the user turn', () => {
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Set everything up',
        outboundStatus: 'failed',
        outboundFailureReason: OUTBOUND_STUCK_FAILURE_REASON,
      },
      { id: 'asst-1', role: 'assistant', content: 'Done — next action is apply to the RN role.' },
    ];
    const { messages: next, cleared } = clearResolvedFailedOutboundStatuses(messages);
    expect(cleared).toBe(true);
    expect(next[0]?.outboundStatus).toBe('sent');
    expect(next[0]?.outboundFailureReason).toBeUndefined();
  });

  it('auto-recovers only for stall failures while Mac HTTP is green', () => {
    expect(
      shouldAutoRecoverStalledSend({
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 0,
        failedText: 'Set everything up',
        failureReason: RUN_NO_TOKEN_FAIL_DETAIL,
      }),
    ).toBe(true);
    expect(
      shouldAutoRecoverStalledSend({
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: 0,
        failedText: 'Set everything up',
        failureReason: 'Wrong API key',
      }),
    ).toBe(false);
    expect(
      shouldAutoRecoverStalledSend({
        macHttpOk: true,
        isDemo: false,
        isSending: false,
        recoveriesUsed: STALLED_SEND_AUTO_RECOVER_MAX,
        failedText: 'Set everything up',
        failureReason: RUN_NO_TOKEN_FAIL_DETAIL,
      }),
    ).toBe(false);
  });
});
