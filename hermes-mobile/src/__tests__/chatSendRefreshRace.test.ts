import type { HermesMessage } from '../types/chat';
import {
  hasUnsyncedLocalMessages,
  mergeServerMessagesWithPending,
  transcriptDigest,
} from '../utils/chatMessageMerge';

describe('chat send refresh race', () => {
  it('keeps optimistic user bubble when gateway refresh returns stale transcript', () => {
    const serverStale: HermesMessage[] = [
      { id: 'gw-u1', role: 'user', content: 'older question' },
      { id: 'gw-a1', role: 'assistant', content: 'older answer' },
    ];
    const localWithPending: HermesMessage[] = [
      ...serverStale,
      {
        id: 'user-1700',
        role: 'user',
        content: 'just sent from phone',
        created_at: '2026-06-23T13:00:00.000Z',
      },
    ];

    expect(hasUnsyncedLocalMessages(localWithPending)).toBe(true);
    const merged = mergeServerMessagesWithPending(serverStale, localWithPending);
    expect(merged.map((m) => m.content)).toEqual(['older question', 'older answer', 'just sent from phone']);
    expect(transcriptDigest(merged)).not.toBe(transcriptDigest(serverStale));
  });

  it('skips redundant FlatList update when merged transcript matches digest', () => {
    const messages: HermesMessage[] = [
      { id: 'gw-u1', role: 'user', content: 'hello' },
      { id: 'gw-a1', role: 'assistant', content: 'hi' },
    ];
    const digest = transcriptDigest(messages);
    const mergedAgain = mergeServerMessagesWithPending(messages, messages);
    expect(transcriptDigest(mergedAgain)).toBe(digest);
    expect(hasUnsyncedLocalMessages(messages)).toBe(false);
  });
});
