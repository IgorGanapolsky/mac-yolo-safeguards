import {
  dedupeAdjacentOptimisticUserBubbles,
  findPendingOptimisticUserBubble,
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

  it('ignores duplicate send while outbound bubble is still pending', () => {
    expect(
      shouldIgnoreDuplicateOutboundSend({
        isSending: false,
        normalizedIncoming: 'make money faster',
        normalizedLastCommitted: 'make money faster',
        outboundStillPending: true,
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
});
