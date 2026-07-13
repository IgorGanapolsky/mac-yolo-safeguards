import type { HermesMessage } from '../types/chat';
import {
  hasUnsyncedLocalMessages,
  mergeServerMessagesWithPending,
  transcriptDigest,
} from '../utils/chatMessageMerge';
import {
  localSnapshotForRemountMerge,
  shouldClearPersistedOutbound,
} from '../utils/pendingOutboundStorage';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER } from '../utils/streamAssistantText';

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

  it('send → background remount still shows user prompt + still-running stub', () => {
    const serverMissingOutbound: HermesMessage[] = [
      { id: 'gw-u0', role: 'user', content: 'older turn' },
      { id: 'gw-a0', role: 'assistant', content: 'older reply' },
    ];
    const persistedAfterKill: HermesMessage[] = [
      {
        id: 'user-9001',
        role: 'user',
        content: 'Make money today',
        created_at: '2026-07-13T13:10:00.000Z',
        outboundStatus: 'pending',
      },
      {
        id: 'asst-9001',
        role: 'assistant',
        content: GENERIC_EMPTY_STREAM_PLACEHOLDER,
        created_at: '2026-07-13T13:10:01.000Z',
      },
    ];

    // Remount wipes React state; only AsyncStorage snapshot remains.
    const localAfterRemount = localSnapshotForRemountMerge([], persistedAfterKill);
    expect(localAfterRemount.map((m) => m.content)).toEqual([
      'Make money today',
      GENERIC_EMPTY_STREAM_PLACEHOLDER,
    ]);

    const merged = mergeServerMessagesWithPending(serverMissingOutbound, localAfterRemount);
    expect(merged.map((m) => m.content)).toEqual([
      'older turn',
      'older reply',
      'Make money today',
      GENERIC_EMPTY_STREAM_PLACEHOLDER,
    ]);
    expect(shouldClearPersistedOutbound(serverMissingOutbound, persistedAfterKill)).toBe(false);
  });
});
