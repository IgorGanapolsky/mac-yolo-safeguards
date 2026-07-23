import {
  dedupeAdjacentOptimisticUserBubbles,
  findFailedOptimisticUserBubble,
  findPendingOptimisticUserBubble,
  findReusableOptimisticUserBubble,
  findSentOptimisticUserBubbleAwaitingReply,
  isNoOpDuplicateOutboundSend,
  reactivateOptimisticUserBubble,
  shouldIgnoreDuplicateOutboundSend,
  shouldSkipQueueOutboundBubbleCommit,
} from '../utils/outboundSendDedupe';
import { idHasPrefix } from '../utils/messageIds';
import type { HermesMessage } from '../types/chat';

describe('outboundSendDedupe', () => {
  it('ignores duplicate send while busy when body matches last committed outbound', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: true,
        normalizedIncoming: 'make money faster',
        normalizedLastCommitted: 'make money faster',
      }),
    ).toBe(true);
    // UI must treat this as rejected (restore draft), not accepted success.
    expect(
      isNoOpDuplicateOutboundSend({
        isSending: true,
        normalizedIncoming: 'make money faster',
        normalizedLastCommitted: 'make money faster',
      }),
    ).toBe(true);
  });

  it('ignores duplicate send while busy when body matches active in-flight send', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: true,
        normalizedIncoming: 'make money faster',
        normalizedActiveSend: 'make money faster',
      }),
    ).toBe(true);
  });

  it('ignores duplicate tap before async send starts', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: false,
        normalizedIncoming: 'make money faster',
        normalizedPendingClaim: 'make money faster',
      }),
    ).toBe(true);
  });

  it('allows resend while outbound bubble is still pending once send lock is free', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: false,
        normalizedIncoming: 'make money faster',
        normalizedLastCommitted: 'make money faster',
        outboundStillPending: true,
      }),
    ).toBe(false);
  });

  it('hard-blocks re-POST while the same body is already delivered and awaiting a reply', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: false,
        normalizedIncoming: 'Forget Upwork. Pursue other opportunities',
        normalizedLastCommitted: 'Forget Upwork. Pursue other opportunities',
        outboundAwaitingReply: true,
      }),
    ).toBe(true);
  });

  it('allows a different prompt while busy', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: true,
        normalizedIncoming: 'second prompt',
        normalizedLastCommitted: 'make money faster',
      }),
    ).toBe(false);
  });

  it('does not ignore when send lock is free', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: false,
        normalizedIncoming: 'make money faster',
        normalizedLastCommitted: 'make money faster',
      }),
    ).toBe(false);
  });

  it('skips queue bubble commit when queued body matches last committed outbound', () => {
    expect(
      shouldSkipQueueOutboundBubbleCommit({
        normalizedQueued: 'make money faster',
        normalizedLastCommitted: 'make money faster',
      }),
    ).toBe(true);
  });

  it('finds pending optimistic user bubble by normalized body', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'Make money faster', outboundStatus: 'pending' },
    ];
    expect(findPendingOptimisticUserBubble(messages, 'make money faster')?.id).toBe('user-1');
  });

  it('reuses failed optimistic bubble on stall recovery instead of echoing a second prompt', () => {
    const prompt = 'make money today';
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: prompt,
        outboundStatus: 'failed',
        outboundFailureReason: 'Still waiting for a reply — recovering automatically…',
      },
    ];
    expect(findFailedOptimisticUserBubble(messages, prompt)?.id).toBe('user-1');
    expect(findReusableOptimisticUserBubble(messages, prompt)?.id).toBe('user-1');
    const reactivated = reactivateOptimisticUserBubble(messages, 'user-1');
    expect(reactivated).toHaveLength(1);
    expect(reactivated[0]?.outboundStatus).toBe('pending');
    expect(reactivated[0]?.outboundFailureReason).toBeUndefined();
    expect(reactivated[0]?.id).toBe('user-1');
  });

  it('reuses gateway-acked failed bubble after merge annotated outboundStatus (no user- prefix)', () => {
    const prompt = 'Make money faster';
    const messages: HermesMessage[] = [
      {
        id: 'gw-42',
        role: 'user',
        content: prompt,
        outboundStatus: 'failed',
        outboundFailureReason: 'Run stalled on your Mac — recovering automatically…',
      },
    ];
    expect(findFailedOptimisticUserBubble(messages, prompt)?.id).toBe('gw-42');
    expect(findReusableOptimisticUserBubble(messages, prompt)?.id).toBe('gw-42');
    const reactivated = reactivateOptimisticUserBubble(messages, 'gw-42');
    expect(reactivated).toHaveLength(1);
    expect(reactivated[0]?.id).toBe('gw-42');
    expect(reactivated[0]?.outboundStatus).toBe('pending');
    expect(reactivated[0]?.outboundFailureReason).toBeUndefined();
    // Recovery must not invent a second user-* row for the same intent.
    const afterCommit = dedupeAdjacentOptimisticUserBubbles([
      ...reactivated,
      { id: 'user-echo', role: 'user', content: prompt, outboundStatus: 'pending' },
    ]);
    expect(afterCommit).toHaveLength(1);
    expect(afterCommit[0]?.outboundStatus).toBe('pending');
  });

  it('dedupes adjacent optimistic user rows with the same body', () => {
    const messages: HermesMessage[] = [
      { id: 'gw-1', role: 'user', content: 'make money faster' },
      { id: 'user-1', role: 'user', content: 'make money faster', outboundStatus: 'pending' },
      { id: 'user-2', role: 'user', content: 'make money faster', outboundStatus: 'pending' },
    ];
    const deduped = dedupeAdjacentOptimisticUserBubbles(messages);
    expect(deduped.filter((m) => idHasPrefix(m.id, 'user-'))).toHaveLength(1);
    expect(deduped[deduped.length - 1]?.id).toBe('user-1');
  });

  it('collapses failed+pending echo pair from stall recovery into one bubble', () => {
    const prompt = 'make money today';
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: prompt,
        outboundStatus: 'failed',
        outboundFailureReason: 'Run stalled',
      },
      { id: 'user-2', role: 'user', content: prompt, outboundStatus: 'pending' },
    ];
    const deduped = dedupeAdjacentOptimisticUserBubbles(messages);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('user-2');
    expect(deduped[0]?.outboundStatus).toBe('pending');
  });

  it('collapses gateway-acked failed + user-* pending echo into one bubble', () => {
    const prompt = 'Make money faster';
    const messages: HermesMessage[] = [
      {
        id: 'gw-42',
        role: 'user',
        content: prompt,
        outboundStatus: 'failed',
        outboundFailureReason: 'Run stalled on your Mac — recovering automatically…',
      },
      { id: 'user-99', role: 'user', content: prompt, outboundStatus: 'pending' },
    ];
    const deduped = dedupeAdjacentOptimisticUserBubbles(messages);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('user-99');
    expect(deduped[0]?.outboundStatus).toBe('pending');
  });

  it('reuses sent optimistic bubble still awaiting reply — Delivering must not clone', () => {
    const prompt =
      'Use this religiously to research pain points and provide solutions and make money today';
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: prompt, outboundStatus: 'sent' },
    ];
    expect(findSentOptimisticUserBubbleAwaitingReply(messages, prompt)?.id).toBe('user-1');
    expect(findReusableOptimisticUserBubble(messages, prompt)?.id).toBe('user-1');
    const withReply: HermesMessage[] = [
      ...messages,
      { id: 'asst-1', role: 'assistant', content: 'Here is a plan.' },
    ];
    expect(findSentOptimisticUserBubbleAwaitingReply(withReply, prompt)).toBeUndefined();
  });
});
